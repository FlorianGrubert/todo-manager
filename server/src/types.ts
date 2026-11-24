import type { DefaultRole, Locale, TenantRole } from '@fg/shared';
import type { Config } from './config.js';
import type { Db } from './db/knex.js';
import type { EventBus } from './events/bus.js';
import type { TaskQueue } from './lib/queue.js';
import type { Mailer } from './mail/mailer.js';

export interface AppDeps {
  config: Config;
  db: Db;
  mailer: Mailer;
  events: EventBus;
  queue: TaskQueue;
}

/** Authenticated session (set by the auth hook). */
export interface AuthInfo {
  userId: string;
  sessionId: string;
  csrfToken: string;
  isSystemAdmin: boolean;
  activeTenantId: string | null;
  locale: Locale;
}

/**
 * Verified tenant context. Built only from the server-side session and the
 * membership row – never from request parameters (Zero Trust).
 */
export interface TenantContext {
  tenantId: string;
  membershipId: string;
  userId: string;
  tenantRole: TenantRole;
  defaultRole: DefaultRole;
  displayName: string;
  /**
   * Set when the request comes from an access token (MCP): the token's name.
   * Changes and comments are marked with it ("über MCP").
   */
  via?: string | null;
  /** Access token restricted to own To-Dos: may only change To-Dos assigned to or created by the member. */
  ownOnly?: boolean;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
  interface FastifyRequest {
    auth: AuthInfo | null;
    tenant: TenantContext | null;
  }
}
