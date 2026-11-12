import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LOCALES, PASSWORD_MIN_LENGTH } from '@fg/shared';
import { now } from '../db/knex.js';
import { ApiError, notFound } from '../lib/errors.js';
import { toBool } from '../lib/flags.js';
import { randomToken, sha256 } from '../lib/tokens.js';
import { parse } from '../lib/validate.js';
import { composeMail } from '../mail/mailer.js';
import { getAuth, requireAuth } from '../tenancy/context.js';
import { findOpenInvitation } from './invitations.js';
import { hashPassword, verifyPassword } from './password.js';
import {
  buildMe,
  findUserByEmail,
  listUserTenants,
  markTenantEntered,
  pickTenant,
  type UserRow,
} from './service.js';
import { clearSessionCookie, createSession, destroyUserSessions, SESSION_COOKIE, setSessionCookie } from './sessions.js';

const RESET_VALID_MS = 3600_000;

const password = z.string().max(1024);

function assertPasswordLength(value: string): void {
  if (value.length < PASSWORD_MIN_LENGTH) throw new ApiError(400, 'password_too_short');
}

export function authRoutes(app: FastifyInstance): void {
  const deps = () => app.deps;
  const strictLimit = { rateLimit: { max: app.deps.config.AUTH_RATE_LIMIT, timeWindow: '1 minute' } };

  app.post('/api/auth/login', { config: strictLimit }, async (req, reply) => {
    const body = parse(z.object({ email: z.string().max(320), password }), req.body);
    const { db, config } = deps();
    const user = await findUserByEmail(db, body.email);
    const valid = await verifyPassword(user?.password_hash, body.password);
    if (!user || !valid || !toBool(user.is_active)) throw new ApiError(401, 'invalid_credentials');

    const tenants = await listUserTenants(db, user.id);
    if (tenants.length === 0 && !toBool(user.is_system_admin)) throw new ApiError(401, 'invalid_credentials');
    const tenant = pickTenant(tenants, user.last_tenant_id);
    if (tenant) await markTenantEntered(db, user.id, tenant.id);

    const { token, session } = await createSession(db, config, user.id, tenant?.id ?? null);
    setSessionCookie(reply, config, token);
    return buildMe(deps(), { userId: user.id, csrfToken: session.csrf_token, activeTenantId: session.active_tenant_id });
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.auth) await deps().db('sessions').where({ id: req.auth.sessionId }).delete();
    clearSessionCookie(reply, deps().config);
    return reply.code(204).send();
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (req) => buildMe(deps(), getAuth(req)));

  app.patch('/api/auth/me', { preHandler: requireAuth }, async (req) => {
    const auth = getAuth(req);
    const body = parse(
      z.object({ locale: z.enum(LOCALES).optional(), name: z.string().trim().min(1).max(200).optional() }),
      req.body,
    );
    const update: Record<string, unknown> = { updated_at: now() };
    if (body.locale) update.locale = body.locale;
    if (body.name) update.name = body.name;
    await deps().db('users').where({ id: auth.userId }).update(update);
    return buildMe(deps(), auth);
  });

  app.post('/api/auth/password', { preHandler: requireAuth, config: strictLimit }, async (req, reply) => {
    const auth = getAuth(req);
    const body = parse(z.object({ currentPassword: password, newPassword: password }), req.body);
    const { db } = deps();
    const user = (await db('users').where({ id: auth.userId }).first()) as UserRow;
    if (!(await verifyPassword(user.password_hash, body.currentPassword))) throw new ApiError(401, 'invalid_credentials');
    assertPasswordLength(body.newPassword);
    await db('users')
      .where({ id: user.id })
      .update({ password_hash: await hashPassword(body.newPassword), updated_at: now() });
    // Sign out all other sessions of this user.
    await db('sessions').where({ user_id: user.id }).whereNot({ id: auth.sessionId }).delete();
    return reply.code(204).send();
  });

  app.post('/api/auth/switch-tenant', { preHandler: requireAuth }, async (req) => {
    const auth = getAuth(req);
    const body = parse(z.object({ tenantId: z.string().max(64) }), req.body);
    const { db } = deps();
    const tenants = await listUserTenants(db, auth.userId);
    if (!tenants.some((t) => t.id === body.tenantId)) throw notFound();
    await db('sessions').where({ id: auth.sessionId }).update({ active_tenant_id: body.tenantId });
    await markTenantEntered(db, auth.userId, body.tenantId);
    return buildMe(deps(), { ...auth, activeTenantId: body.tenantId });
  });

  // Always answers 204 so that registered e-mail addresses cannot be discovered.
  app.post('/api/auth/forgot', { config: strictLimit }, async (req, reply) => {
    const body = parse(z.object({ email: z.string().max(320) }), req.body);
    const { db, config, mailer } = deps();
    const user = await findUserByEmail(db, body.email);
    if (user && toBool(user.is_active) && user.password_hash) {
      const token = randomToken();
      await db('password_resets').insert({
        id: randomUUID(),
        user_id: user.id,
        token_hash: sha256(token),
        expires_at: new Date(Date.now() + RESET_VALID_MS).toISOString(),
        created_at: now(),
      });
      await mailer.send(
        composeMail(user.locale, 'passwordReset', user.email, user.name, { link: `${config.BASE_URL}/reset/${token}` }),
      );
    }
    return reply.code(204).send();
  });

  app.post('/api/auth/reset', { config: strictLimit }, async (req, reply) => {
    const body = parse(z.object({ token: z.string().max(200), password }), req.body);
    const { db } = deps();
    const reset = (await db('password_resets')
      .where({ token_hash: sha256(body.token) })
      .whereNull('used_at')
      .where('expires_at', '>', now())
      .first()) as { id: string; user_id: string } | undefined;
    if (!reset) throw new ApiError(400, 'invalid_token');
    assertPasswordLength(body.password);
    const ts = now();
    await db.transaction(async (trx) => {
      await trx('password_resets').where({ id: reset.id }).update({ used_at: ts });
      await trx('users')
        .where({ id: reset.user_id })
        .update({ password_hash: await hashPassword(body.password), updated_at: ts });
    });
    await destroyUserSessions(db, reset.user_id);
    clearSessionCookie(reply, deps().config);
    return reply.code(204).send();
  });

  app.get('/api/invitations/:token', { config: strictLimit }, async (req) => {
    const { token } = parse(z.object({ token: z.string().max(200) }), req.params);
    const inv = await findOpenInvitation(deps(), token);
    if (!inv) throw new ApiError(404, 'invalid_token');
    return { tenantName: inv.tenantName, email: inv.user.email, needsPassword: !inv.user.password_hash };
  });

  app.post('/api/invitations/:token/accept', { config: strictLimit }, async (req, reply) => {
    const { token } = parse(z.object({ token: z.string().max(200) }), req.params);
    const body = parse(z.object({ password, name: z.string().trim().min(1).max(200).optional() }), req.body);
    const { db, config } = deps();
    const inv = await findOpenInvitation(deps(), token);
    if (!inv || !toBool(inv.user.is_active)) throw new ApiError(404, 'invalid_token');

    const ts = now();
    const userUpdate: Record<string, unknown> = { updated_at: ts, last_tenant_id: inv.tenantId };
    if (!inv.user.password_hash) {
      assertPasswordLength(body.password);
      userUpdate.password_hash = await hashPassword(body.password);
      if (body.name) userUpdate.name = body.name;
    } else if (!(await verifyPassword(inv.user.password_hash, body.password))) {
      throw new ApiError(401, 'invalid_credentials');
    }

    await db.transaction(async (trx) => {
      const used = await trx('invitations').where({ id: inv.id }).whereNull('used_at').update({ used_at: ts });
      if (used !== 1) throw new ApiError(404, 'invalid_token');
      await trx('memberships').where({ id: inv.membershipId }).update({ accepted_at: ts, last_login_at: ts, updated_at: ts });
      await trx('users').where({ id: inv.user.id }).update(userUpdate);
    });

    // Replace any existing session of the browser with one for the accepting user.
    if (req.cookies[SESSION_COOKIE] && req.auth) await db('sessions').where({ id: req.auth.sessionId }).delete();
    const { token: sessionToken, session } = await createSession(db, config, inv.user.id, inv.tenantId);
    setSessionCookie(reply, config, sessionToken);
    return buildMe(deps(), { userId: inv.user.id, csrfToken: session.csrf_token, activeTenantId: inv.tenantId });
  });
}
