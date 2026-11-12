import type { DefaultRole, Locale, TenantRole } from '@fg/shared';
import type { Config } from './config.js';
import type { Db } from './db/knex.js';
import type { Mailer } from './mail/mailer.js';

export interface AppDeps {
  config: Config;
  db: Db;
  mailer: Mailer;
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
