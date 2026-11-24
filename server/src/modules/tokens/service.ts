/**
 * Personal access tokens for the MCP server. A token belongs to exactly one
 * membership (and thus one tenant); only its SHA-256 hash is stored. It is
 * valid while it is neither expired nor revoked, the membership, the account
 * and the tenant are active, and the tenant allows access tokens.
 */
import { randomUUID } from 'node:crypto';
import { ACCESS_TOKEN_PREFIX, type AccessTokenDto, type Locale, type TokenScope } from '@fg/shared';
import type { Db } from '../../db/knex.js';
import { now } from '../../db/knex.js';
import { toBool } from '../../lib/flags.js';
import { randomToken, sha256 } from '../../lib/tokens.js';
import type { TenantContext } from '../../types.js';

export interface AccessTokenRow {
  id: string;
  tenant_id: string;
  membership_id: string;
  name: string;
  scope: TokenScope;
  own_only: number;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export const TOKEN_COLUMNS = [
  'a.id',
  'a.tenant_id',
  'a.membership_id',
  'a.name',
  'a.scope',
  'a.own_only',
  'a.created_at',
  'a.expires_at',
  'a.last_used_at',
  'a.revoked_at',
];

export function toTokenDto(r: AccessTokenRow & { tenant_name: string }, at = now()): AccessTokenDto {
  return {
    id: r.id,
    name: r.name,
    tenantId: r.tenant_id,
    tenantName: r.tenant_name,
    scope: r.scope,
    ownOnly: toBool(r.own_only),
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    lastUsedAt: r.last_used_at,
    expired: r.expires_at <= at,
  };
}

/** Creates a token for the membership of the context; returns the plain token (shown once). */
export async function createAccessToken(
  db: Db,
  ctx: TenantContext,
  input: { name: string; scope: TokenScope; ownOnly: boolean; days: number },
): Promise<{ id: string; token: string }> {
  const token = `${ACCESS_TOKEN_PREFIX}${randomToken()}`;
  const id = randomUUID();
  const ts = now();
  await db('access_tokens').insert({
    id,
    tenant_id: ctx.tenantId,
    membership_id: ctx.membershipId,
    name: input.name,
    token_hash: sha256(token),
    scope: input.scope,
    own_only: input.ownOnly ? 1 : 0,
    created_at: ts,
    expires_at: new Date(Date.now() + input.days * 86_400_000).toISOString(),
  });
  return { id, token };
}

/** Revokes all tokens of a user in all tenants (e.g. after a password reset). */
export async function revokeUserTokens(db: Db, userId: string): Promise<void> {
  const memberships = db('memberships').where({ user_id: userId }).select('id');
  await db('access_tokens').whereIn('membership_id', memberships).whereNull('revoked_at').update({ revoked_at: now() });
}

export interface TokenPrincipal {
  token: AccessTokenRow;
  ctx: TenantContext;
  locale: Locale;
}

const LAST_USED_RESOLUTION_MS = 60_000;

/**
 * Resolves a bearer token to its tenant context. Returns undefined for every
 * invalid token (unknown, expired, revoked, inactive membership/account/tenant,
 * tenant does not allow tokens) – callers do not learn why.
 */
export async function authenticateToken(db: Db, token: string): Promise<TokenPrincipal | undefined> {
  if (!token.startsWith(ACCESS_TOKEN_PREFIX) || token.length > 200) return undefined;
  const ts = now();
  const row = (await db('access_tokens as a')
    .join('memberships as m', 'm.id', 'a.membership_id')
    .join('users as u', 'u.id', 'm.user_id')
    .join('tenants as t', 't.id', 'a.tenant_id')
    .where({ 'a.token_hash': sha256(token), 'm.is_active': 1, 'u.is_active': 1, 't.is_active': 1, 't.allow_access_tokens': 1 })
    .whereRaw('m.tenant_id = a.tenant_id')
    .whereNull('a.revoked_at')
    .whereNotNull('m.accepted_at')
    .whereNot('m.kind', 'contact')
    .where('a.expires_at', '>', ts)
    .first(
      ...TOKEN_COLUMNS,
      'm.user_id',
      'm.tenant_role',
      'm.default_role',
      'm.display_name',
      'u.locale',
    )) as
    | (AccessTokenRow & {
        user_id: string;
        tenant_role: TenantContext['tenantRole'];
        default_role: TenantContext['defaultRole'];
        display_name: string;
        locale: Locale;
      })
    | undefined;
  if (!row) return undefined;
  // Only write "last used" about once per minute to keep requests cheap.
  if (!row.last_used_at || Date.parse(ts) - Date.parse(row.last_used_at) > LAST_USED_RESOLUTION_MS) {
    await db('access_tokens').where({ id: row.id }).update({ last_used_at: ts });
  }
  return {
    token: row,
    locale: row.locale,
    ctx: {
      tenantId: row.tenant_id,
      membershipId: row.membership_id,
      userId: row.user_id,
      tenantRole: row.tenant_role,
      defaultRole: row.default_role,
      displayName: row.display_name,
      via: row.name,
      ownOnly: toBool(row.own_only),
    },
  };
}
