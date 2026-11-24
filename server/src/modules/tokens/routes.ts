import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  TOKEN_DEFAULT_DAYS,
  TOKEN_SCOPES,
  type AccessTokenDto,
  type AccessTokenSettings,
  type AdminAccessTokenDto,
  type CreatedAccessTokenDto,
} from '@fg/shared';
import { now } from '../../db/knex.js';
import { ApiError, conflict, notFound } from '../../lib/errors.js';
import { toBool } from '../../lib/flags.js';
import { idParam } from '../../lib/http.js';
import { parse } from '../../lib/validate.js';
import { requireTenantAdmin } from '../../permissions/index.js';
import { getAuth, getTenant, requireAuth, requireTenant } from '../../tenancy/context.js';
import { createAccessToken, TOKEN_COLUMNS, toTokenDto, type AccessTokenRow } from './service.js';

/** At most this many active tokens per membership. */
const MAX_TOKENS_PER_MEMBER = 20;

/**
 * Management of personal access tokens (Settings → Access tokens) and the
 * tenant administrator's view (Administration → Access tokens).
 */
export function tokenRoutes(app: FastifyInstance): void {
  const db = () => app.deps.db;
  const config = () => app.deps.config;

  // ---------------- own tokens ----------------
  /** All active tokens of the user, in all tenants. */
  app.get('/api/tokens', { preHandler: requireAuth }, async (req): Promise<AccessTokenDto[]> => {
    const auth = getAuth(req);
    const rows = (await db()('access_tokens as a')
      .join('memberships as m', 'm.id', 'a.membership_id')
      .join('tenants as t', 't.id', 'a.tenant_id')
      .where('m.user_id', auth.userId)
      .whereNull('a.revoked_at')
      .orderBy('a.created_at', 'desc')
      .select(...TOKEN_COLUMNS, 't.name as tenant_name')) as (AccessTokenRow & { tenant_name: string })[];
    const ts = now();
    return rows.map((r) => toTokenDto(r, ts));
  });

  app.post('/api/tokens', { preHandler: requireTenant, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const ctx = getTenant(req);
    if (!config().MCP_ENABLED) throw notFound();
    const body = parse(
      z.object({
        name: z.string().trim().min(1).max(100),
        scope: z.enum(TOKEN_SCOPES),
        ownOnly: z.boolean().default(false),
        days: z.number().int().min(1).max(config().MCP_TOKEN_MAX_DAYS).default(Math.min(TOKEN_DEFAULT_DAYS, config().MCP_TOKEN_MAX_DAYS)),
      }),
      req.body,
    );
    const tenant = (await db()('tenants').where({ id: ctx.tenantId }).first('name', 'allow_access_tokens')) as {
      name: string;
      allow_access_tokens: number;
    };
    if (!toBool(tenant.allow_access_tokens)) throw new ApiError(403, 'tokens_not_allowed');
    const active = (await db()('access_tokens')
      .where({ membership_id: ctx.membershipId })
      .whereNull('revoked_at')
      .where('expires_at', '>', now())
      .count({ c: '*' })
      .first()) as { c: number | string };
    if (Number(active.c) >= MAX_TOKENS_PER_MEMBER) throw conflict();

    const { id, token } = await createAccessToken(db(), ctx, body);
    const row = (await db()('access_tokens as a').where('a.id', id).first(...TOKEN_COLUMNS)) as AccessTokenRow;
    const created: CreatedAccessTokenDto = { ...toTokenDto({ ...row, tenant_name: tenant.name }), token };
    return reply.code(201).header('cache-control', 'no-store').send(created);
  });

  app.delete('/api/tokens/:id', { preHandler: requireAuth }, async (req, reply) => {
    const auth = getAuth(req);
    const { id } = parse(idParam, req.params);
    const own = db()('memberships').where({ user_id: auth.userId }).select('id');
    const count = await db()('access_tokens')
      .where({ id })
      .whereIn('membership_id', own)
      .whereNull('revoked_at')
      .update({ revoked_at: now() });
    if (!count) throw notFound();
    return reply.code(204).send();
  });

  // ---------------- tenant administration ----------------
  app.get('/api/admin/tokens/settings', { preHandler: requireTenant }, async (req): Promise<AccessTokenSettings> => {
    const ctx = getTenant(req);
    requireTenantAdmin(ctx);
    const tenant = (await db()('tenants').where({ id: ctx.tenantId }).first('allow_access_tokens')) as { allow_access_tokens: number };
    return { allowed: toBool(tenant.allow_access_tokens) };
  });

  app.put('/api/admin/tokens/settings', { preHandler: requireTenant }, async (req): Promise<AccessTokenSettings> => {
    const ctx = getTenant(req);
    requireTenantAdmin(ctx);
    const { allowed } = parse(z.object({ allowed: z.boolean() }), req.body);
    await db()('tenants')
      .where({ id: ctx.tenantId })
      .update({ allow_access_tokens: allowed ? 1 : 0, updated_at: now() });
    return { allowed };
  });

  /** All active tokens of the tenant (person, name, scope, last use – never the token itself). */
  app.get('/api/admin/tokens', { preHandler: requireTenant }, async (req): Promise<AdminAccessTokenDto[]> => {
    const ctx = getTenant(req);
    requireTenantAdmin(ctx);
    const rows = (await db()('access_tokens as a')
      .join('memberships as m', 'm.id', 'a.membership_id')
      .where('a.tenant_id', ctx.tenantId)
      .whereNull('a.revoked_at')
      .orderBy('m.display_name')
      .orderBy('a.created_at', 'desc')
      .select(...TOKEN_COLUMNS, 'm.display_name')) as (AccessTokenRow & { display_name: string })[];
    const ts = now();
    return rows.map((r) => {
      const { tenantId: _t, tenantName: _n, ...dto } = toTokenDto({ ...r, tenant_name: '' }, ts);
      return { ...dto, member: { id: r.membership_id, displayName: r.display_name } };
    });
  });

  app.delete('/api/admin/tokens/:id', { preHandler: requireTenant }, async (req, reply) => {
    const ctx = getTenant(req);
    requireTenantAdmin(ctx);
    const { id } = parse(idParam, req.params);
    const count = await db()('access_tokens')
      .where({ id, tenant_id: ctx.tenantId })
      .whereNull('revoked_at')
      .update({ revoked_at: now() });
    if (!count) throw notFound();
    return reply.code(204).send();
  });
}
