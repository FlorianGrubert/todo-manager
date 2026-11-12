import type { Knex } from 'knex';
import { NONE, type TodoQuery } from '@fg/shared';
import type { Db } from '../../db/knex.js';
import { applyTodoVisibility, type RoleMap } from '../../permissions/index.js';
import type { TenantContext } from '../../types.js';
import { TODO_COLUMNS, todoQuery, type TodoRow } from './service.js';

export const MAX_LIST = 5000;

/** Adds "value IN list OR (none requested AND value IS NULL)" for one criterion. */
function whereInOrNull(query: Knex.QueryBuilder, column: string, values: string[]): void {
  if (values.length === 0) return;
  const ids = values.filter((v) => v !== NONE);
  const withNone = values.includes(NONE);
  query.where((q) => {
    q.whereRaw('1 = 0');
    if (ids.length) q.orWhereIn(column, ids);
    if (withNone) q.orWhereNull(column);
  });
}

/**
 * Builds the To-Do list query for the current member: visibility rules, filters
 * (OR within a criterion, AND between criteria), search and sorting.
 * Used by the board and by the export, so both always show the same To-Dos.
 */
export function buildTodoListQuery(db: Db, ctx: TenantContext, roles: RoleMap, filters: TodoQuery): Knex.QueryBuilder {
  const query = todoQuery(db, ctx)
    .join('statuses as s', 's.id', 't.status_id')
    .leftJoin('priorities as pr', 'pr.id', 't.priority_id');
  applyTodoVisibility(query, ctx, roles);

  if (filters.scope === 'mine') query.where('t.assignee_id', ctx.membershipId);
  if (!filters.includeClosed) query.where('s.category', 'open');
  if (!filters.includeArchived) query.whereNull('p.archived_at');

  whereInOrNull(query, 't.assignee_id', filters.assigneeIds);
  whereInOrNull(query, 't.priority_id', filters.priorityIds);
  whereInOrNull(query, 't.project_id', filters.projectIds);
  if (filters.tagIds.length) {
    const ids = filters.tagIds.filter((v) => v !== NONE);
    const withNone = filters.tagIds.includes(NONE);
    const tagsOf = () => db('todo_tags as tt').whereRaw('tt.todo_id = t.id').where('tt.tenant_id', ctx.tenantId);
    query.where((q) => {
      q.whereRaw('1 = 0');
      if (ids.length) q.orWhereExists(tagsOf().whereIn('tt.tag_id', ids));
      if (withNone) q.orWhereNotExists(tagsOf());
    });
  }

  const term = filters.q.trim().toLowerCase();
  if (term) {
    const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    query.where((q) =>
      q.whereRaw("lower(t.title) like ? escape '\\'", [like]).orWhereRaw("lower(t.description) like ? escape '\\'", [like]),
    );
  }

  const dir = filters.dir;
  // Empty values (no priority / no due date) are always sorted last.
  switch (filters.sort) {
    case 'priority':
      query.orderByRaw('case when pr.rank is null then 1 else 0 end').orderBy('pr.rank', dir);
      break;
    case 'status':
      query.orderBy('s.rank', dir);
      break;
    case 'dueDate':
      query.orderByRaw('case when t.due_date is null then 1 else 0 end').orderBy('t.due_date', dir);
      break;
    case 'createdAt':
      query.orderBy('t.created_at', dir);
      break;
    case 'updatedAt':
      query.orderBy('t.updated_at', dir);
      break;
  }
  query.orderBy('t.updated_at', 'desc').orderBy('t.id', 'asc');
  return query.limit(MAX_LIST).select(TODO_COLUMNS);
}

export async function listTodoRows(db: Db, ctx: TenantContext, roles: RoleMap, filters: TodoQuery): Promise<TodoRow[]> {
  return (await buildTodoListQuery(db, ctx, roles, filters)) as TodoRow[];
}
