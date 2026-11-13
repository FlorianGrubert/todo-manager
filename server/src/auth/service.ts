import type { ActiveTenant, Locale, MeResponse, TenantSummary } from '@fg/shared';
import type { Db } from '../db/knex.js';
import { now } from '../db/knex.js';
import { toBool } from '../lib/flags.js';
import { loadMembership } from '../tenancy/context.js';
import type { AppDeps, AuthInfo } from '../types.js';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  name: string;
  locale: Locale;
  last_tenant_id: string | null;
  is_system_admin: number;
  is_active: number;
  notify_assign: number;
  remind_days_before: number | null;
  notify_overdue: number;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function findUserByEmail(db: Db, email: string): Promise<UserRow | undefined> {
  return (await db('users').where({ email: normalizeEmail(email) }).first()) as UserRow | undefined;
}

/** Tenants the user may currently enter (active + accepted membership, active tenant). */
export async function listUserTenants(db: Db, userId: string): Promise<TenantSummary[]> {
  const rows = (await db('memberships as m')
    .join('tenants as t', 't.id', 'm.tenant_id')
    .where({ 'm.user_id': userId, 'm.is_active': 1, 't.is_active': 1 })
    .whereNotNull('m.accepted_at')
    .orderBy('t.name')
    .select('t.id', 't.name')) as TenantSummary[];
  return rows;
}

/** Picks the tenant to open after login: the last used one, otherwise the first. */
export function pickTenant(tenants: TenantSummary[], lastTenantId: string | null): TenantSummary | null {
  return tenants.find((t) => t.id === lastTenantId) ?? tenants[0] ?? null;
}

/** Records that the user entered a tenant (last login per membership, last used tenant). */
export async function markTenantEntered(db: Db, userId: string, tenantId: string): Promise<void> {
  const ts = now();
  await db('memberships').where({ user_id: userId, tenant_id: tenantId }).update({ last_login_at: ts, updated_at: ts });
  await db('users').where({ id: userId }).update({ last_tenant_id: tenantId });
}

export async function buildMe(deps: AppDeps, auth: Pick<AuthInfo, 'userId' | 'csrfToken' | 'activeTenantId'>): Promise<MeResponse> {
  const { db, config } = deps;
  const user = (await db('users').where({ id: auth.userId }).first()) as UserRow;
  const tenants = await listUserTenants(db, user.id);
  let activeTenant: ActiveTenant | null = null;
  if (auth.activeTenantId) {
    const m = await loadMembership(db, user.id, auth.activeTenantId);
    const tenant = tenants.find((t) => t.id === auth.activeTenantId);
    if (m && tenant) {
      activeTenant = {
        id: tenant.id,
        name: tenant.name,
        membershipId: m.id,
        role: m.tenant_role,
        defaultRole: m.default_role,
        displayName: m.display_name,
      };
    }
  }
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      locale: user.locale,
      isSystemAdmin: toBool(user.is_system_admin),
      notifyAssign: toBool(user.notify_assign),
      remindDaysBefore: user.remind_days_before,
      notifyOverdue: toBool(user.notify_overdue),
    },
    tenants,
    activeTenant,
    csrfToken: auth.csrfToken,
    version: config.version,
  };
}
