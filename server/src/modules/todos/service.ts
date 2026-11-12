import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { z } from 'zod';
import { DUE_DATE_PATTERN, LINK_URL_PATTERN, type TagDto, type TodoDto, type TodoLinkDto } from '@fg/shared';
import type { Db } from '../../db/knex.js';
import { now } from '../../db/knex.js';
import { ApiError, badRequest, notFound } from '../../lib/errors.js';
import { canEditTodo, canViewTodo, type RoleMap } from '../../permissions/index.js';
import { scoped } from '../../tenancy/context.js';
import type { TenantContext } from '../../types.js';

export interface TodoRow {
  id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  priority_id: string | null;
  assignee_id: string | null;
  status_id: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  project_archived_at: string | null;
}

export const TODO_COLUMNS = [
  't.id',
  't.project_id',
  't.title',
  't.description',
  't.due_date',
  't.priority_id',
  't.assignee_id',
  't.status_id',
  't.created_by',
  't.updated_by',
  't.created_at',
  't.updated_at',
  'p.archived_at as project_archived_at',
];

const id = z.string().min(1).max(64);
const dueDate = z
  .string()
  .regex(DUE_DATE_PATTERN)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)));
const link = z.object({
  url: z.string().trim().min(1).max(2000).regex(LINK_URL_PATTERN),
  label: z.string().trim().max(200).nullable().optional(),
});

export const todoInputSchema = z.object({
  projectId: id.nullable().optional(),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(20_000).nullable().optional(),
  dueDate: dueDate.nullable().optional(),
  priorityId: id.nullable().optional(),
  assigneeId: id.nullable().optional(),
  statusId: id.optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  links: z.array(link).max(50).optional(),
  clientId: z.string().min(1).max(64).optional(),
});
export type TodoInputParsed = z.infer<typeof todoInputSchema>;

/** Base query for To-Dos of the tenant including the project's archive flag (alias `t`). */
export function todoQuery(db: Db | Knex, ctx: TenantContext) {
  return scoped(db, ctx, 'todos', 't').leftJoin('projects as p', 'p.id', 't.project_id');
}

/** Loads a To-Do the member may see; otherwise 404 (no information is disclosed). */
export async function loadVisibleTodo(db: Db | Knex, ctx: TenantContext, roles: RoleMap, todoId: string): Promise<TodoRow> {
  const row = (await todoQuery(db, ctx).where('t.id', todoId).first(TODO_COLUMNS)) as TodoRow | undefined;
  if (!row || !canViewTodo(ctx, roles, row)) throw notFound();
  return row;
}

export function assertEditable(ctx: TenantContext, roles: RoleMap, row: TodoRow): void {
  if (row.project_archived_at) throw new ApiError(409, 'archived');
  if (!canEditTodo(ctx, roles, row)) throw new ApiError(403, 'forbidden');
}

export async function assertProjectUsable(db: Db | Knex, ctx: TenantContext, projectId: string | null): Promise<void> {
  if (projectId === null) return;
  const project = (await scoped(db, ctx, 'projects').where({ id: projectId }).first('archived_at')) as
    | { archived_at: string | null }
    | undefined;
  if (!project) throw notFound();
  if (project.archived_at) throw new ApiError(409, 'archived');
}

export async function assertActiveRef(db: Db | Knex, ctx: TenantContext, table: 'statuses' | 'priorities', refId: string | null): Promise<void> {
  if (refId === null) return;
  const row = await scoped(db, ctx, table).where({ id: refId }).whereNull('removed_at').first('id');
  if (!row) throw badRequest();
}

/** Resolves tag names to tag IDs, creating missing tags (tags are freely definable). */
export async function resolveTags(trx: Knex, ctx: TenantContext, names: string[]): Promise<string[]> {
  const unique = [...new Map(names.map((n) => [n.toLowerCase(), n])).values()];
  if (unique.length === 0) return [];
  const existing = (await scoped(trx, ctx, 'tags').select('id', 'name')) as { id: string; name: string }[];
  const byName = new Map(existing.map((t) => [t.name.toLowerCase(), t.id]));
  const ids: string[] = [];
  for (const name of unique) {
    let tagId = byName.get(name.toLowerCase());
    if (!tagId) {
      tagId = randomUUID();
      await trx('tags').insert({ id: tagId, tenant_id: ctx.tenantId, name, color: null, created_at: now() });
      byName.set(name.toLowerCase(), tagId);
    }
    ids.push(tagId);
  }
  return ids;
}

export async function replaceTags(trx: Knex, ctx: TenantContext, todoId: string, tagIds: string[]): Promise<void> {
  await scoped(trx, ctx, 'todo_tags').where({ todo_id: todoId }).delete();
  if (tagIds.length) {
    await trx('todo_tags').insert(tagIds.map((tagId) => ({ tenant_id: ctx.tenantId, todo_id: todoId, tag_id: tagId })));
  }
}

export async function replaceLinks(trx: Knex, ctx: TenantContext, todoId: string, links: TodoLinkDto[]): Promise<void> {
  await scoped(trx, ctx, 'todo_links').where({ todo_id: todoId }).delete();
  if (links.length) {
    await trx('todo_links').insert(
      links.map((l, i) => ({
        id: randomUUID(),
        tenant_id: ctx.tenantId,
        todo_id: todoId,
        url: l.url,
        label: l.label || null,
        position: i,
      })),
    );
  }
}

/** Loads tags, links, comment counts and member names for a list of To-Dos. */
export async function toTodoDtos(db: Db | Knex, ctx: TenantContext, roles: RoleMap, rows: TodoRow[]): Promise<TodoDto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500));

  const tags = new Map<string, TagDto[]>();
  const links = new Map<string, TodoLinkDto[]>();
  const comments = new Map<string, number>();
  for (const chunk of chunks) {
    const tagRows = (await scoped(db, ctx, 'todo_tags', 'tt')
      .join('tags as g', 'g.id', 'tt.tag_id')
      .whereIn('tt.todo_id', chunk)
      .orderBy('g.name')
      .select('tt.todo_id', 'g.id', 'g.name', 'g.color')) as (TagDto & { todo_id: string })[];
    for (const r of tagRows) {
      const list = tags.get(r.todo_id) ?? [];
      list.push({ id: r.id, name: r.name, color: r.color });
      tags.set(r.todo_id, list);
    }
    const linkRows = (await scoped(db, ctx, 'todo_links')
      .whereIn('todo_id', chunk)
      .orderBy('position')
      .select('todo_id', 'url', 'label')) as (TodoLinkDto & { todo_id: string })[];
    for (const r of linkRows) {
      const list = links.get(r.todo_id) ?? [];
      list.push({ url: r.url, label: r.label });
      links.set(r.todo_id, list);
    }
    const countRows = (await scoped(db, ctx, 'comments')
      .whereIn('todo_id', chunk)
      .groupBy('todo_id')
      .select('todo_id')
      .count({ c: '*' })) as { todo_id: string; c: number | string }[];
    for (const r of countRows) comments.set(r.todo_id, Number(r.c));
  }

  const memberIds = [...new Set(rows.flatMap((r) => [r.created_by, r.updated_by]))];
  const members = new Map(
    ((await scoped(db, ctx, 'memberships').whereIn('id', memberIds).select('id', 'display_name')) as {
      id: string;
      display_name: string;
    }[]).map((m) => [m.id, m.display_name]),
  );
  const member = (mid: string) => ({ id: mid, displayName: members.get(mid) ?? '' });

  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    title: r.title,
    description: r.description,
    dueDate: r.due_date,
    priorityId: r.priority_id,
    assigneeId: r.assignee_id,
    statusId: r.status_id,
    tags: tags.get(r.id) ?? [],
    links: links.get(r.id) ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdBy: member(r.created_by),
    updatedBy: member(r.updated_by),
    commentCount: comments.get(r.id) ?? 0,
    canEdit: canEditTodo(ctx, roles, r, r.project_archived_at !== null),
  }));
}
