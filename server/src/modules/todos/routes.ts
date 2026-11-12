import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CommentDto, HistoryEntryDto, HistoryField, HistoryResponse, TodoDto } from '@fg/shared';
import { now } from '../../db/knex.js';
import { ApiError, badRequest, conflict, notFound } from '../../lib/errors.js';
import { idParam } from '../../lib/http.js';
import { parse } from '../../lib/validate.js';
import {
  applyTodoVisibility,
  assertEligibleAssignee,
  assertMayAssign,
  canCreateTodo,
  effectiveRole,
  isProjectManager,
  loadProjectRoles,
} from '../../permissions/index.js';
import { getTenant, requireTenant, scoped } from '../../tenancy/context.js';
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
  todoInputSchema,
  todoQuery,
  toTodoDtos,
  type TodoRow,
} from './service.js';

const listQuery = z.object({
  projectId: z.string().min(1).max(64).optional(),
  assignee: z.enum(['me']).optional(),
  includeClosed: z.enum(['0', '1']).optional(),
  includeArchived: z.enum(['0', '1']).optional(),
  q: z.string().max(200).optional(),
});

const MAX_LIST = 5000;

export function todoRoutes(app: FastifyInstance): void {
  const opts = { preHandler: requireTenant };
  const db = () => app.deps.db;

  app.get('/api/todos', opts, async (req): Promise<TodoDto[]> => {
    const ctx = getTenant(req);
    const filters = parse(listQuery, req.query);
    const roles = await loadProjectRoles(db(), ctx);
    const query = todoQuery(db(), ctx).join('statuses as s', 's.id', 't.status_id');
    applyTodoVisibility(query, ctx, roles);
    if (filters.projectId === 'none') query.whereNull('t.project_id');
    else if (filters.projectId) query.where('t.project_id', filters.projectId);
    if (filters.assignee === 'me') query.where('t.assignee_id', ctx.membershipId);
    if (filters.includeClosed !== '1') query.where('s.category', 'open');
    if (filters.includeArchived !== '1') query.whereNull('p.archived_at');
    if (filters.q?.trim()) {
      const term = `%${filters.q.trim().toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      query.where((q) =>
        q.whereRaw("lower(t.title) like ? escape '\\'", [term]).orWhereRaw("lower(t.description) like ? escape '\\'", [term]),
      );
    }
    const rows = (await query.orderBy('t.updated_at', 'desc').limit(MAX_LIST).select(TODO_COLUMNS)) as TodoRow[];
    return toTodoDtos(db(), ctx, roles, rows);
  });

  app.get('/api/todos/:id', opts, async (req): Promise<TodoDto> => {
    const ctx = getTenant(req);
    const { id } = parse(idParam, req.params);
    const roles = await loadProjectRoles(db(), ctx);
    const row = await loadVisibleTodo(db(), ctx, roles, id);
    const [dto] = await toTodoDtos(db(), ctx, roles, [row]);
    return dto!;
  });

  app.post('/api/todos', opts, async (req, reply) => {
    const ctx = getTenant(req);
    const input = parse(todoInputSchema, req.body);
    if (!input.title) throw badRequest();
    const roles = await loadProjectRoles(db(), ctx);
    const projectId = input.projectId ?? null;

    // Idempotent creation for offline capture: the same clientId returns the existing To-Do.
    if (input.clientId) {
      const existing = (await todoQuery(db(), ctx).where('t.client_id', input.clientId).first(TODO_COLUMNS)) as
        | TodoRow
        | undefined;
      if (existing) {
        const dto = await loadVisibleTodo(db(), ctx, roles, existing.id).catch(() => {
          throw conflict();
        });
        return reply.code(200).send((await toTodoDtos(db(), ctx, roles, [dto]))[0]);
      }
    }

    // Projects without any role are treated as non-existent (no information disclosure).
    if (projectId !== null && !effectiveRole(ctx, roles, projectId)) throw notFound();
    await assertProjectUsable(db(), ctx, projectId);
    if (!canCreateTodo(ctx, roles, projectId)) throw new ApiError(403, 'forbidden');
    const assigneeId = input.assigneeId ?? null;
    assertMayAssign(ctx, roles, projectId, assigneeId);
    await assertEligibleAssignee(db(), ctx, projectId, assigneeId);

    let statusId = input.statusId;
    if (statusId) await assertActiveRef(db(), ctx, 'statuses', statusId);
    else {
      const def = (await scoped(db(), ctx, 'statuses').where({ is_new_default: 1 }).whereNull('removed_at').first('id')) ??
        (await scoped(db(), ctx, 'statuses').whereNull('removed_at').orderBy('rank').first('id'));
      statusId = (def as { id: string } | undefined)?.id;
      if (!statusId) throw conflict();
    }
    await assertActiveRef(db(), ctx, 'priorities', input.priorityId ?? null);

    const todoId = randomUUID();
    const ts = now();
    await db().transaction(async (trx) => {
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
      await recordHistory(trx, ctx, todoId, [{ field: 'created', oldValue: null, newValue: input.title ?? null }], ts);
    });
    const row = await loadVisibleTodo(db(), ctx, roles, todoId).catch(() => undefined);
    // A restricted editor may create a To-Do that is no longer "own" (cannot happen with assignment rules, but be safe).
    if (!row) return reply.code(201).send({ id: todoId });
    return reply.code(201).send((await toTodoDtos(db(), ctx, roles, [row]))[0]);
  });

  app.patch('/api/todos/:id', opts, async (req): Promise<TodoDto> => {
    const ctx = getTenant(req);
    const { id } = parse(idParam, req.params);
    const input = parse(todoInputSchema.omit({ clientId: true }), req.body);
    const roles = await loadProjectRoles(db(), ctx);
    const row = await loadVisibleTodo(db(), ctx, roles, id);
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
      await assertProjectUsable(db(), ctx, projectId);
      if (!canCreateTodo(ctx, roles, projectId)) throw new ApiError(403, 'forbidden');
    }
    const assigneeId = input.assigneeId === undefined ? row.assignee_id : input.assigneeId;
    if (assigneeId !== row.assignee_id || projectId !== row.project_id) {
      if (assigneeId !== row.assignee_id) assertMayAssign(ctx, roles, projectId, assigneeId);
      await assertEligibleAssignee(db(), ctx, projectId, assigneeId);
    }
    if (input.statusId !== undefined && input.statusId !== row.status_id) {
      await assertActiveRef(db(), ctx, 'statuses', input.statusId);
    }
    if (input.priorityId !== undefined && input.priorityId !== row.priority_id) {
      await assertActiveRef(db(), ctx, 'priorities', input.priorityId);
    }

    track('title', 'title', input.title);
    track('description', 'description', input.description === undefined ? undefined : input.description || null);
    track('dueDate', 'due_date', input.dueDate);
    track('priority', 'priority_id', input.priorityId);
    track('assignee', 'assignee_id', assigneeId);
    track('status', 'status_id', input.statusId);
    track('project', 'project_id', projectId);

    const ts = now();
    await db().transaction(async (trx) => {
      if (input.tags !== undefined) {
        const before = (await scoped(trx, ctx, 'todo_tags', 'tt')
          .join('tags as g', 'g.id', 'tt.tag_id')
          .where('tt.todo_id', id)
          .orderBy('g.name')
          .pluck('g.name')) as string[];
        const tagIds = await resolveTags(trx, ctx, input.tags);
        const after = ((await scoped(trx, ctx, 'tags').whereIn('id', tagIds).orderBy('name').pluck('name')) as string[]);
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

    const fresh = (await todoQuery(db(), ctx).where('t.id', id).first(TODO_COLUMNS)) as TodoRow;
    return (await toTodoDtos(db(), ctx, roles, [fresh]))[0]!;
  });

  /** Cancels a To-Do: sets the status marked as cancel target (§5). */
  app.post('/api/todos/:id/cancel', opts, async (req): Promise<TodoDto> => {
    const ctx = getTenant(req);
    const { id } = parse(idParam, req.params);
    const roles = await loadProjectRoles(db(), ctx);
    const row = await loadVisibleTodo(db(), ctx, roles, id);
    assertEditable(ctx, roles, row);
    const target = (await scoped(db(), ctx, 'statuses').where({ is_cancel_target: 1 }).whereNull('removed_at').first('id')) as
      | { id: string }
      | undefined;
    if (!target) throw conflict();
    if (target.id !== row.status_id) {
      const ts = now();
      await db().transaction(async (trx) => {
        await scoped(trx, ctx, 'todos')
          .where({ id })
          .update({ status_id: target.id, updated_at: ts, updated_by: ctx.membershipId });
        await recordHistory(trx, ctx, id, [{ field: 'status', oldValue: row.status_id, newValue: target.id }], ts);
      });
    }
    const fresh = (await todoQuery(db(), ctx).where('t.id', id).first(TODO_COLUMNS)) as TodoRow;
    return (await toTodoDtos(db(), ctx, roles, [fresh]))[0]!;
  });

  // ---------------- comments (all roles that can see the To-Do) ----------------
  app.get('/api/todos/:id/comments', opts, async (req): Promise<CommentDto[]> => {
    const ctx = getTenant(req);
    const { id } = parse(idParam, req.params);
    const roles = await loadProjectRoles(db(), ctx);
    await loadVisibleTodo(db(), ctx, roles, id);
    const rows = (await scoped(db(), ctx, 'comments', 'c')
      .join('memberships as m', 'm.id', 'c.author_id')
      .where('c.todo_id', id)
      .orderBy('c.created_at')
      .select('c.id', 'c.body', 'c.created_at', 'c.author_id', 'm.display_name')) as {
      id: string;
      body: string;
      created_at: string;
      author_id: string;
      display_name: string;
    }[];
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      createdAt: r.created_at,
      author: { id: r.author_id, displayName: r.display_name },
    }));
  });

  app.post('/api/todos/:id/comments', opts, async (req, reply) => {
    const ctx = getTenant(req);
    const { id } = parse(idParam, req.params);
    const { body } = parse(z.object({ body: z.string().trim().min(1).max(10_000) }), req.body);
    const roles = await loadProjectRoles(db(), ctx);
    await loadVisibleTodo(db(), ctx, roles, id);
    const comment: CommentDto = {
      id: randomUUID(),
      body,
      createdAt: now(),
      author: { id: ctx.membershipId, displayName: ctx.displayName },
    };
    await db()('comments').insert({
      id: comment.id,
      tenant_id: ctx.tenantId,
      todo_id: id,
      author_id: ctx.membershipId,
      body,
      created_at: comment.createdAt,
    });
    return reply.code(201).send(comment);
  });

  // ---------------- history ----------------
  app.get('/api/todos/:id/history', opts, async (req): Promise<HistoryResponse> => {
    const ctx = getTenant(req);
    const { id } = parse(idParam, req.params);
    const roles = await loadProjectRoles(db(), ctx);
    await loadVisibleTodo(db(), ctx, roles, id);
    const rows = (await scoped(db(), ctx, 'todo_history', 'h')
      .join('memberships as m', 'm.id', 'h.changed_by')
      .where('h.todo_id', id)
      .orderBy('h.changed_at', 'desc')
      .select('h.id', 'h.field', 'h.old_value', 'h.new_value', 'h.changed_at', 'h.changed_by', 'm.display_name')) as {
      id: string;
      field: HistoryField;
      old_value: string | null;
      new_value: string | null;
      changed_at: string;
      changed_by: string;
      display_name: string;
    }[];
    const entries: HistoryEntryDto[] = rows.map((r) => ({
      id: r.id,
      field: r.field,
      oldValue: r.old_value,
      newValue: r.new_value,
      changedAt: r.changed_at,
      changedBy: { id: r.changed_by, displayName: r.display_name },
    }));

    const idsFor = (field: HistoryField) =>
      [...new Set(rows.filter((r) => r.field === field).flatMap((r) => [r.old_value, r.new_value]))].filter(
        (v): v is string => v !== null,
      );
    const statuses = (await scoped(db(), ctx, 'statuses').whereIn('id', idsFor('status'))) as StatusRow[];
    const priorities = (await scoped(db(), ctx, 'priorities').whereIn('id', idsFor('priority'))) as PriorityRow[];
    const members = (await scoped(db(), ctx, 'memberships')
      .whereIn('id', idsFor('assignee'))
      .select('id', 'display_name as displayName')) as { id: string; displayName: string }[];
    // Only names of projects the member may see are disclosed.
    const projects = ((await scoped(db(), ctx, 'projects').whereIn('id', idsFor('project')).select('id', 'name')) as {
      id: string;
      name: string;
    }[]).filter((p) => isProjectManager(ctx) || effectiveRole(ctx, roles, p.id) !== null);
    return {
      entries,
      refs: { statuses: statuses.map(toStatusDto), priorities: priorities.map(toPriorityDto), members, projects },
    };
  });
}
