import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DefaultRole, Locale, TenantRole } from '@fg/shared';
import { findSession, SESSION_COOKIE } from '../auth/sessions.js';
import type { Db } from '../db/knex.js';
import { ApiError } from '../lib/errors.js';
import { toBool } from '../lib/flags.js';
import { safeEqual } from '../lib/tokens.js';
import type { AuthInfo, TenantContext } from '../types.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Registers the hook that resolves the session cookie and enforces the CSRF token. */
export function registerAuthContext(app: FastifyInstance): void {
  app.decorateRequest('auth', null);
  app.decorateRequest('tenant', null);

  app.addHook('onRequest', async (req) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return;
    const { db, config } = app.deps;
    const session = await findSession(db, config, token);
    if (!session) return;
    const user = (await db('users').where({ id: session.user_id }).first()) as
      | { id: string; is_active: number; is_system_admin: number; locale: Locale }
      | undefined;
    if (!user || !toBool(user.is_active)) return;
    req.auth = {
      userId: user.id,
      sessionId: session.id,
      csrfToken: session.csrf_token,
      isSystemAdmin: toBool(user.is_system_admin),
      activeTenantId: session.active_tenant_id,
      locale: user.locale,
    };
    if (!SAFE_METHODS.has(req.method)) {
      const header = req.headers['x-csrf-token'];
      if (typeof header !== 'string' || !safeEqual(header, session.csrf_token)) {
        throw new ApiError(403, 'csrf');
      }
    }
  });
}

/** preHandler: requires an authenticated session. */
export async function requireAuth(req: FastifyRequest): Promise<void> {
  if (!req.auth) throw new ApiError(401, 'unauthorized');
}

/** preHandler: requires the system administrator role. */
export async function requireSystemAdmin(req: FastifyRequest): Promise<void> {
  if (!req.auth) throw new ApiError(401, 'unauthorized');
  if (!req.auth.isSystemAdmin) throw new ApiError(403, 'forbidden');
}

export interface MembershipRow {
  id: string;
  tenant_id: string;
  user_id: string;
  tenant_role: TenantRole;
  default_role: DefaultRole;
  display_name: string;
}

/** Loads the active, accepted membership of a user in an active tenant. */
export async function loadMembership(db: Db, userId: string, tenantId: string): Promise<MembershipRow | undefined> {
  return (await db('memberships as m')
    .join('tenants as t', 't.id', 'm.tenant_id')
    .where({ 'm.user_id': userId, 'm.tenant_id': tenantId, 'm.is_active': 1, 't.is_active': 1 })
    .whereNotNull('m.accepted_at')
    .first('m.id', 'm.tenant_id', 'm.user_id', 'm.tenant_role', 'm.default_role', 'm.display_name')) as
    | MembershipRow
    | undefined;
}

/** preHandler: requires a session with a verified active tenant membership. */
export async function requireTenant(req: FastifyRequest): Promise<void> {
  if (!req.auth) throw new ApiError(401, 'unauthorized');
  if (!req.auth.activeTenantId) throw new ApiError(403, 'forbidden');
  const m = await loadMembership(req.server.deps.db, req.auth.userId, req.auth.activeTenantId);
  if (!m) throw new ApiError(403, 'forbidden');
  req.tenant = {
    tenantId: m.tenant_id,
    membershipId: m.id,
    userId: m.user_id,
    tenantRole: m.tenant_role,
    defaultRole: m.default_role,
    displayName: m.display_name,
  };
}

export function getAuth(req: FastifyRequest): AuthInfo {
  if (!req.auth) throw new ApiError(401, 'unauthorized');
  return req.auth;
}

export function getTenant(req: FastifyRequest): TenantContext {
  if (!req.tenant) throw new ApiError(403, 'forbidden');
  return req.tenant;
}

/** Query builder restricted to the active tenant. Use for every tenant-owned table. */
export function scoped(db: Db, ctx: TenantContext, table: string, alias?: string) {
  const name = alias ?? table;
  return db(alias ? `${table} as ${alias}` : table).where(`${name}.tenant_id`, ctx.tenantId);
}
