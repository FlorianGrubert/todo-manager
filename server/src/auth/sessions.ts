import type { FastifyReply } from 'fastify';
import type { Config } from '../config.js';
import type { Db } from '../db/knex.js';
import { now } from '../db/knex.js';
import { randomToken, sha256 } from '../lib/tokens.js';

export const SESSION_COOKIE = 'fgtm_sid';

export interface SessionRow {
  id: string;
  user_id: string;
  active_tenant_id: string | null;
  csrf_token: string;
  created_at: string;
  expires_at: string;
}

const expiry = (config: Config) => new Date(Date.now() + config.SESSION_TTL_HOURS * 3600_000).toISOString();

export async function createSession(
  db: Db,
  config: Config,
  userId: string,
  activeTenantId: string | null,
): Promise<{ token: string; session: SessionRow }> {
  const token = randomToken();
  const session: SessionRow = {
    id: sha256(token),
    user_id: userId,
    active_tenant_id: activeTenantId,
    csrf_token: randomToken(),
    created_at: now(),
    expires_at: expiry(config),
  };
  await db('sessions').insert(session);
  return { token, session };
}

/** Loads a valid session for the cookie token and slides its expiry when half of it is used up. */
export async function findSession(db: Db, config: Config, token: string): Promise<SessionRow | undefined> {
  const session = (await db('sessions').where({ id: sha256(token) }).first()) as SessionRow | undefined;
  if (!session) return undefined;
  if (session.expires_at <= now()) {
    await db('sessions').where({ id: session.id }).delete();
    return undefined;
  }
  const remaining = Date.parse(session.expires_at) - Date.now();
  if (remaining < (config.SESSION_TTL_HOURS * 3600_000) / 2) {
    session.expires_at = expiry(config);
    await db('sessions').where({ id: session.id }).update({ expires_at: session.expires_at });
  }
  return session;
}

export async function destroyUserSessions(db: Db, userId: string): Promise<void> {
  await db('sessions').where({ user_id: userId }).delete();
}

export function setSessionCookie(reply: FastifyReply, config: Config, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: config.SESSION_TTL_HOURS * 3600,
  });
}

export function clearSessionCookie(reply: FastifyReply, config: Config): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, secure: config.cookieSecure, sameSite: 'lax' });
}
