/**
 * To-Do operations shared by the REST API and the MCP server. Every function
 * checks the permissions of the given tenant context itself, records history,
 * publishes live events and queues mails – callers only parse their input.
 */
import { randomUUID } from 'node:crypto';
import type { CommentDto, HistoryEntryDto, HistoryField, HistoryResponse, TodoDto } from '@fg/shared';
import { now } from '../../db/knex.js';
import { ApiError, conflict, forbidden, notFound } from '../../lib/errors.js';
import {
  assertEligibleAssignee,
  assertMayAssign,
  canCreateTodo,
  effectiveRole,
  isProjectManager,
  loadProjectRoles,
  passesOwnOnly,
} from '../../permissions/index.js';
import { scoped } from '../../tenancy/context.js';
import type { AppDeps, TenantContext } from '../../types.js';
import { queueAssignmentMail } from '../notifications/service.js';
import { toPriorityDto, toStatusDto, type PriorityRow, type StatusRow } from '../reference/mappers.js';
import { recordHistory, type HistoryChange } from './history.js';
import {
  assertActiveRef,
  assertEditable,
  assertProjectUsable,
  loadVisibleTodo,
  replaceLinks,
  replaceTags,
  resolveTags,
  TODO_COLUMNS,
  todoQuery,
  toTodoDtos,
  type TodoInputParsed,
  type TodoRow,
} from './service.js';

type Deps = AppDeps;

export interface CreateResult {
  /** false when an existing To-Do was returned for the same client ID (idempotent creation). */
  created: boolean;
  id: string;
  /** null when the new To-Do is not visible to its creator (cannot happen with the assignment rules). */
  todo: TodoDto | null;
}

async function loadDto(deps: Deps, ctx: TenantContext, id: string): Promise<TodoDto> {
  const roles = await loadProjectRoles(deps.db, ctx);
  const fresh = (await todoQuery(deps.db, ctx).where('t.id', id).first(TODO_COLUMNS)) as TodoRow;
  return (await toTodoDtos(deps.db, ctx, roles, [fresh]))[0]!;
}

/** Creates a To-Do. Without status the tenant's default status for new To-Dos is used. */
export async function createTodo(deps: Deps, ctx: TenantContext, input: TodoInputParsed & { title: string }): Promise<CreateResult> {
  const { db } = deps;
  const roles = await loadProjectRoles(db, ctx);
  const projectId = input.projectId ?? null;

  // Idempotent creation (offline capture, MCP): the same clientId returns the existing To-Do.
  if (input.clientId) {
    const existing = (await todoQuery(db, ctx).where('t.client_id', input.clientId).first(TODO_COLUMNS)) as TodoRow | undefined;
    if (existing) {
      const row = await loadVisibleTodo(db, ctx, roles, existing.id).catch(() => {
        throw conflict();
      });
      return { created: false, id: row.id, todo: (await toTodoDtos(db, ctx, roles, [row]))[0]! };
    }
  }

  // Projects without any role are treated as non-existent (no information disclosure).
  if (projectId !== null && !effectiveRole(ctx, roles, projectId)) throw notFound();
  await assertProjectUsable(db, ctx, projectId);
  if (!canCreateTodo(ctx, roles, projectId)) throw new ApiError(403, 'forbidden');
  const assigneeId = input.assigneeId ?? null;
  assertMayAssign(ctx, roles, projectId, assigneeId);
  await assertEligibleAssignee(db, ctx, projectId, assigneeId);

  let statusId = input.statusId;
  if (statusId) await assertActiveRef(db, ctx, 'statuses', statusId);
  else {
    const def =
      (await scoped(db, ctx, 'statuses').where({ is_new_default: 1 }).whereNull('removed_at').first('id')) ??
      (await scoped(db, ctx, 'statuses').whereNull('removed_at').orderBy('rank').first('id'));
    statusId = (def as { id: string } | undefined)?.id;
    if (!statusId) throw conflict();
  }
  await assertActiveRef(db, ctx, 'priorities', input.priorityId ?? null);

  const todoId = randomUUID();
  const ts = now();
  await db.transaction(async (trx) => {
    await trx('todos').insert({
      id: todoId,
      tenant_id: ctx.tenantId,
      project_id: projectId,
      title: input.title,
      description: input.description || null,
      due_date: input.dueDate ?? null,
      priority_id: input.priorityId ?? null,
      assignee_id: assigneeId,
      status_id: statusId,
      client_id: input.clientId ?? null,
      created_by: ctx.membershipId,
      updated_by: ctx.membershipId,
      created_at: ts,
      updated_at: ts,
    });
    await replaceTags(trx, ctx, todoId, await resolveTags(trx, ctx, input.tags ?? []));
    await replaceLinks(trx, ctx, todoId, (input.links ?? []).map((l) => ({ url: l.url, label: l.label ?? null })));
    await recordHistory(trx, ctx, todoId, [{ field: 'created', oldValue: null, newValue: input.title }], ts);
  });
  deps.events.publish(ctx.tenantId, { type: 'todos', todoId });
  if (assigneeId) queueAssignmentMail(deps, ctx, todoId, assigneeId);
  const row = await loadVisibleTodo(db, ctx, roles, todoId).catch(() => undefined);
  return { created: true, id: todoId, todo: row ? (await toTodoDtos(db, ctx, roles, [row]))[0]! : null };
}

/** Changes the given fields of a To-Do (undefined = unchanged) and records each change in the history. */
export async function updateTodo(deps: Deps, ctx: TenantContext, id: string, input: Omit<TodoInputParsed, 'clientId'>): Promise<TodoDto> {
  const { db } = deps;
  const roles = await loadProjectRoles(db, ctx);
  const row = await loadVisibleTodo(db, ctx, roles, id);
  assertEditable(ctx, roles, row);

  const changes: HistoryChange[] = [];
  const update: Record<string, unknown> = {};
  const track = (field: HistoryField, column: keyof TodoRow, value: string | null | undefined) => {
    if (value === undefined || value === row[column]) return;
    changes.push({ field, oldValue: row[column] as string | null, newValue: value });
    update[column] = value;
  };

  const projectId = input.projectId === undefined ? row.project_id : input.projectId;
  if (projectId !== row.project_id) {
    if (projectId !== null && !effectiveRole(ctx, roles, projectId)) throw notFound();
    await assertProjectUsable(db, ctx, projectId);
    if (!canCreateTodo(ctx, roles, projectId)) throw new ApiError(403, 'forbidden');
  }
  const assigneeId = input.assigneeId === undefined ? row.assignee_id : input.assigneeId;
  if (assigneeId !== row.assignee_id || projectId !== row.project_id) {
    if (assigneeId !== row.assignee_id) assertMayAssign(ctx, roles, projectId, assigneeId);
    await assertEligibleAssignee(db, ctx, projectId, assigneeId);
  }
  if (input.statusId !== undefined && input.statusId !== row.status_id) {
    await assertActiveRef(db, ctx, 'statuses', input.statusId);
  }
  if (input.priorityId !== undefined && input.priorityId !== row.priority_id) {
    await assertActiveRef(db, ctx, 'priorities', input.priorityId);
  }

  track('title', 'title', input.title);
  track('description', 'description', input.description === undefined ? undefined : input.description || null);
  track('dueDate', 'due_date', input.dueDate);
  track('priority', 'priority_id', input.priorityId);
  track('assignee', 'assignee_id', assigneeId);
  track('status', 'status_id', input.statusId);
  track('project', 'project_id', projectId);

  const ts = now();
  await db.transaction(async (trx) => {
    if (input.tags !== undefined) {
      const before = (await scoped(trx, ctx, 'todo_tags', 'tt')
        .join('tags as g', 'g.id', 'tt.tag_id')
        .where('tt.todo_id', id)
        .orderBy('g.name')
        .pluck('g.name')) as string[];
      const tagIds = await resolveTags(trx, ctx, input.tags);
      const after = (await scoped(trx, ctx, 'tags').whereIn('id', tagIds).orderBy('name').pluck('name')) as string[];
      if (before.join('\n') !== after.join('\n')) {
        changes.push({ field: 'tags', oldValue: before.join(', ') || null, newValue: after.join(', ') || null });
        await replaceTags(trx, ctx, id, tagIds);
      }
    }
    if (input.links !== undefined) {
      const before = (await scoped(trx, ctx, 'todo_links').where({ todo_id: id }).orderBy('position').pluck('url')) as string[];
      const links = input.links.map((l) => ({ url: l.url, label: l.label ?? null }));
      const labelsBefore = (await scoped(trx, ctx, 'todo_links').where({ todo_id: id }).orderBy('position').pluck('label')) as (
        | string
        | null
      )[];
      const changedUrls = before.join('\n') !== links.map((l) => l.url).join('\n');
      const changedLabels = labelsBefore.join('\n') !== links.map((l) => l.label ?? '').join('\n');
      if (changedUrls || changedLabels) {
        changes.push({
          field: 'links',
          oldValue: before.join('\n') || null,
          newValue: links.map((l) => l.url).join('\n') || null,
        });
        await replaceLinks(trx, ctx, id, links);
      }
    }
    if (changes.length === 0) return;
    await scoped(trx, ctx, 'todos')
      .where({ id })
      .update({ ...update, updated_at: ts, updated_by: ctx.membershipId });
    await recordHistory(trx, ctx, id, changes, ts);
  });
  if (changes.length) deps.events.publish(ctx.tenantId, { type: 'todos', todoId: id });
  if (assigneeId && assigneeId !== row.assignee_id) queueAssignmentMail(deps, ctx, id, assigneeId);
  return loadDto(deps, ctx, id);
}

/** Cancels a To-Do: sets the status marked as cancel target (§5). */
export async function cancelTodo(deps: Deps, ctx: TenantContext, id: string): Promise<TodoDto> {
  const { db } = deps;
  const roles = await loadProjectRoles(db, ctx);
  const row = await loadVisibleTodo(db, ctx, roles, id);
  assertEditable(ctx, roles, row);
  const target = (await scoped(db, ctx, 'statuses').where({ is_cancel_target: 1 }).whereNull('removed_at').first('id')) as
    | { id: string }
    | undefined;
  if (!target) throw conflict();
  if (target.id !== row.status_id) {
    const ts = now();
    await db.transaction(async (trx) => {
      await scoped(trx, ctx, 'todos').where({ id }).update({ status_id: target.id, updated_at: ts, updated_by: ctx.membershipId });
      await recordHistory(trx, ctx, id, [{ field: 'status', oldValue: row.status_id, newValue: target.id }], ts);
    });
    deps.events.publish(ctx.tenantId, { type: 'todos', todoId: id });
  }
  return loadDto(deps, ctx, id);
}

/** Comments of a To-Do the member may see (all roles, oldest first). */
export async function listComments(deps: Pick<Deps, 'db'>, ctx: TenantContext, id: string): Promise<CommentDto[]> {
  const { db } = deps;
  const roles = await loadProjectRoles(db, ctx);
  await loadVisibleTodo(db, ctx, roles, id);
  const rows = (await scoped(db, ctx, 'comments', 'c')
    .join('memberships as m', 'm.id', 'c.author_id')
    .where('c.todo_id', id)
    .orderBy('c.created_at')
    .select('c.id', 'c.body', 'c.created_at', 'c.author_id', 'c.via', 'm.display_name')) as {
    id: string;
    body: string;
    created_at: string;
    author_id: string;
    via: string | null;
    display_name: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    author: { id: r.author_id, displayName: r.display_name },
    via: r.via,
  }));
}

/** Adds a comment; every role that can see the To-Do may comment (§9). */
export async function addComment(deps: Deps, ctx: TenantContext, id: string, body: string): Promise<CommentDto> {
  const { db } = deps;
  const roles = await loadProjectRoles(db, ctx);
  const row = await loadVisibleTodo(db, ctx, roles, id);
  if (!passesOwnOnly(ctx, row)) throw forbidden();
  const comment: CommentDto = {
    id: randomUUID(),
    body,
    createdAt: now(),
    author: { id: ctx.membershipId, displayName: ctx.displayName },
    via: ctx.via ?? null,
  };
  await db('comments').insert({
    id: comment.id,
    tenant_id: ctx.tenantId,
    todo_id: id,
    author_id: ctx.membershipId,
    body,
    created_at: comment.createdAt,
    via: comment.via,
  });
  deps.events.publish(ctx.tenantId, { type: 'todos', todoId: id });
  return comment;
}

/** History of a To-Do (newest first) plus the referenced objects needed to show IDs as names. */
export async function getHistory(deps: Pick<Deps, 'db'>, ctx: TenantContext, id: string): Promise<HistoryResponse> {
  const { db } = deps;
  const roles = await loadProjectRoles(db, ctx);
  await loadVisibleTodo(db, ctx, roles, id);
  const rows = (await scoped(db, ctx, 'todo_history', 'h')
    .join('memberships as m', 'm.id', 'h.changed_by')
    .where('h.todo_id', id)
    .orderBy('h.changed_at', 'desc')
    .select('h.id', 'h.field', 'h.old_value', 'h.new_value', 'h.changed_at', 'h.changed_by', 'h.via', 'm.display_name')) as {
    id: string;
    field: HistoryField;
    old_value: string | null;
    new_value: string | null;
    changed_at: string;
    changed_by: string;
    via: string | null;
    display_name: string;
  }[];
  const entries: HistoryEntryDto[] = rows.map((r) => ({
    id: r.id,
    field: r.field,
    oldValue: r.old_value,
    newValue: r.new_value,
    changedAt: r.changed_at,
    changedBy: { id: r.changed_by, displayName: r.display_name },
    via: r.via,
  }));

  const idsFor = (field: HistoryField) =>
    [...new Set(rows.filter((r) => r.field === field).flatMap((r) => [r.old_value, r.new_value]))].filter(
      (v): v is string => v !== null,
    );
  const statuses = (await scoped(db, ctx, 'statuses').whereIn('id', idsFor('status'))) as StatusRow[];
  const priorities = (await scoped(db, ctx, 'priorities').whereIn('id', idsFor('priority'))) as PriorityRow[];
  const members = (await scoped(db, ctx, 'memberships')
    .whereIn('id', idsFor('assignee'))
    .select('id', 'display_name as displayName')) as { id: string; displayName: string }[];
  // Only names of projects the member may see are disclosed.
  const projects = (
    (await scoped(db, ctx, 'projects').whereIn('id', idsFor('project')).select('id', 'name')) as { id: string; name: string }[]
  ).filter((p) => isProjectManager(ctx) || effectiveRole(ctx, roles, p.id) !== null);
  return {
    entries,
    refs: { statuses: statuses.map(toStatusDto), priorities: priorities.map(toPriorityDto), members, projects },
  };
}
