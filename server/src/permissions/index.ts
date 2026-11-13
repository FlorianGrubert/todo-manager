/**
 * Central permission rules (§8). Every route uses these functions; the UI only
 * mirrors them.
 *
 * Roles:
 * - tenant `admin`: everything in the tenant
 * - tenant `project_admin`: manage projects and project members (no implicit To-Do rights)
 * - project roles `editor`, `restricted`, `reader` per project
 * - `defaultRole` of the membership for To-Dos without project
 */
import type { Knex } from 'knex';
import type { ProjectRole } from '@fg/shared';
import type { Db } from '../db/knex.js';
import { ApiError, forbidden } from '../lib/errors.js';
import type { TenantContext } from '../types.js';

export type EffectiveRole = ProjectRole | 'admin';

/** Project roles of the current membership (projectId → role). */
export type RoleMap = Map<string, ProjectRole>;

export async function loadProjectRoles(db: Db, ctx: TenantContext): Promise<RoleMap> {
  const rows = (await db('project_members')
    .where({ tenant_id: ctx.tenantId, membership_id: ctx.membershipId })
    .select('project_id', 'role')) as { project_id: string; role: ProjectRole }[];
  return new Map(rows.map((r) => [r.project_id, r.role]));
}

export const isTenantAdmin = (ctx: TenantContext) => ctx.tenantRole === 'admin';
export const isProjectManager = (ctx: TenantContext) => ctx.tenantRole === 'admin' || ctx.tenantRole === 'project_admin';

export function requireTenantAdmin(ctx: TenantContext): void {
  if (!isTenantAdmin(ctx)) throw forbidden();
}

export function requireProjectManager(ctx: TenantContext): void {
  if (!isProjectManager(ctx)) throw forbidden();
}

/** Effective role for a project (`null` project = To-Dos without project). */
export function effectiveRole(ctx: TenantContext, roles: RoleMap, projectId: string | null): EffectiveRole | null {
  if (isTenantAdmin(ctx)) return 'admin';
  if (projectId === null) return ctx.defaultRole === 'none' ? null : ctx.defaultRole;
  return roles.get(projectId) ?? null;
}

export interface TodoAccessInfo {
  project_id: string | null;
  assignee_id: string | null;
  created_by: string;
}

/** „Eigene“ To-Dos: assigned to me, or created by me while unassigned (§8). */
export function isOwnTodo(ctx: TenantContext, todo: TodoAccessInfo): boolean {
  return todo.assignee_id === ctx.membershipId || (todo.assignee_id === null && todo.created_by === ctx.membershipId);
}

export function canViewTodo(ctx: TenantContext, roles: RoleMap, todo: TodoAccessInfo): boolean {
  const role = effectiveRole(ctx, roles, todo.project_id);
  if (!role) return false;
  return role === 'restricted' ? isOwnTodo(ctx, todo) : true;
}

/** Edit rights; To-Dos of archived projects are read-only. */
export function canEditTodo(ctx: TenantContext, roles: RoleMap, todo: TodoAccessInfo, projectArchived = false): boolean {
  if (projectArchived) return false;
  const role = effectiveRole(ctx, roles, todo.project_id);
  if (role === 'admin' || role === 'editor') return true;
  return role === 'restricted' && isOwnTodo(ctx, todo);
}

export function canCreateTodo(ctx: TenantContext, roles: RoleMap, projectId: string | null): boolean {
  const role = effectiveRole(ctx, roles, projectId);
  return role === 'admin' || role === 'editor' || role === 'restricted';
}

/** Restricted editors may only assign themselves or nobody. */
export function assertMayAssign(ctx: TenantContext, roles: RoleMap, projectId: string | null, assigneeId: string | null): void {
  if (assigneeId === null || assigneeId === ctx.membershipId) return;
  if (effectiveRole(ctx, roles, projectId) === 'restricted') throw forbidden();
}

/**
 * Restricts a To-Do query (alias `t`) to the To-Dos the current member may see.
 * Implemented in SQL so lists never load foreign data.
 */
export function applyTodoVisibility(query: Knex.QueryBuilder, ctx: TenantContext, roles: RoleMap): Knex.QueryBuilder {
  query.where('t.tenant_id', ctx.tenantId);
  if (isTenantAdmin(ctx)) return query;

  const full = [...roles].filter(([, r]) => r === 'editor' || r === 'reader').map(([id]) => id);
  const restricted = [...roles].filter(([, r]) => r === 'restricted').map(([id]) => id);
  const me = ctx.membershipId;
  const own = (q: Knex.QueryBuilder) =>
    q.where('t.assignee_id', me).orWhere((q2) => q2.whereNull('t.assignee_id').andWhere('t.created_by', me));

  return query.where((q) => {
    // Always-false base so that the OR-chain below starts cleanly.
    q.whereRaw('1 = 0');
    if (full.length) q.orWhereIn('t.project_id', full);
    if (restricted.length) q.orWhere((q2) => q2.whereIn('t.project_id', restricted).andWhere(own));
    if (ctx.defaultRole === 'editor' || ctx.defaultRole === 'reader') q.orWhereNull('t.project_id');
    if (ctx.defaultRole === 'restricted') q.orWhere((q2) => q2.whereNull('t.project_id').andWhere(own));
  });
}

/**
 * Checks that a membership may be assigned to To-Dos of the project: active,
 * accepted and at least restricted editor (tenant admins always).
 */
export async function assertEligibleAssignee(
  db: Db,
  ctx: TenantContext,
  projectId: string | null,
  assigneeId: string | null,
): Promise<void> {
  if (assigneeId === null) return;
  const m = (await db('memberships')
    .where({ id: assigneeId, tenant_id: ctx.tenantId, is_active: 1 })
    .whereNotNull('accepted_at')
    .first('tenant_role', 'default_role')) as { tenant_role: string; default_role: string } | undefined;
  if (!m) throw new ApiError(400, 'invalid_assignee');
  if (m.tenant_role === 'admin') return;
  let role: string | undefined;
  if (projectId === null) {
    role = m.default_role;
  } else {
    const pm = (await db('project_members')
      .where({ tenant_id: ctx.tenantId, project_id: projectId, membership_id: assigneeId })
      .first('role')) as { role: string } | undefined;
    role = pm?.role;
  }
  if (role !== 'editor' && role !== 'restricted') throw new ApiError(400, 'invalid_assignee');
}
