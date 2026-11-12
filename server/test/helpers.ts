import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import knexFactory from 'knex';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { MeResponse } from '@fg/shared';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { loadConfig } from '../src/config.js';
import { seedTenantDefaults } from '../src/db/defaults.js';
import { createDb, migrateLatest, now, type Db } from '../src/db/knex.js';
import type { Mailer, MailMessage } from '../src/mail/mailer.js';

export const TEST_DB = (process.env.TEST_DB ?? 'sqlite') as 'sqlite' | 'pg';
const PG_URL = process.env.TEST_DATABASE_URL ?? 'postgres://todo:todo@localhost:15432/todo_test';
export const TEST_PASSWORD = 'correct-horse-battery';

export interface TestEnv {
  app: FastifyInstance;
  db: Db;
  mails: MailMessage[];
  close: () => Promise<void>;
}

/** Creates an isolated database (temp SQLite file or own PostgreSQL schema) plus app instance. */
export async function createTestEnv(): Promise<TestEnv> {
  let db: Db;
  let cleanup: () => Promise<void>;
  if (TEST_DB === 'pg') {
    const schema = `t_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const admin = knexFactory({ client: 'pg', connection: PG_URL });
    await admin.raw(`create schema ${schema}`);
    db = createDb({ client: 'pg', databaseUrl: PG_URL, pgSchema: schema });
    cleanup = async () => {
      await db.destroy();
      await admin.raw(`drop schema ${schema} cascade`);
      await admin.destroy();
    };
  } else {
    const dir = mkdtempSync(join(tmpdir(), 'fgtm-test-'));
    db = createDb({ client: 'sqlite', sqliteFile: join(dir, 'test.db') });
    cleanup = async () => {
      await db.destroy();
      rmSync(dir, { recursive: true, force: true });
    };
  }
  await migrateLatest(db);
  const config = loadConfig({}, { NODE_ENV: 'test', LOG_LEVEL: 'silent', BASE_URL: 'http://localhost:3000', WEB_DIST: './no-web-dist' });
  const mails: MailMessage[] = [];
  const mailer: Mailer = {
    sent: mails,
    send: (m) => {
      mails.push(m);
      return Promise.resolve();
    },
  };
  const app = await buildApp({ config, db, mailer, logger: false });
  await app.ready();
  return {
    app,
    db,
    mails,
    close: async () => {
      await app.close();
      await cleanup();
    },
  };
}

export async function createUser(
  db: Db,
  opts: { email: string; name?: string; systemAdmin?: boolean; password?: string | null },
): Promise<string> {
  const id = randomUUID();
  const ts = now();
  await db('users').insert({
    id,
    email: opts.email.toLowerCase(),
    name: opts.name ?? opts.email,
    password_hash: opts.password === null ? null : await hashPassword(opts.password ?? TEST_PASSWORD),
    is_system_admin: opts.systemAdmin ? 1 : 0,
    created_at: ts,
    updated_at: ts,
  });
  return id;
}

export async function createTenant(db: Db, name: string): Promise<string> {
  const id = randomUUID();
  const ts = now();
  await db('tenants').insert({ id, name, is_active: 1, created_at: ts, updated_at: ts });
  await seedTenantDefaults(db, id);
  return id;
}

export async function addMembership(
  db: Db,
  tenantId: string,
  userId: string,
  opts: { tenantRole?: string; defaultRole?: string; displayName?: string } = {},
): Promise<string> {
  const id = randomUUID();
  const ts = now();
  await db('memberships').insert({
    id,
    tenant_id: tenantId,
    user_id: userId,
    display_name: opts.displayName ?? 'Member',
    tenant_role: opts.tenantRole ?? 'member',
    default_role: opts.defaultRole ?? 'editor',
    accepted_at: ts,
    created_at: ts,
    updated_at: ts,
  });
  return id;
}

/** Client that keeps the session cookie and CSRF token like a browser would. */
export class TestClient {
  cookie: string | undefined;
  csrf: string | undefined;

  constructor(private readonly app: FastifyInstance) {}

  async request(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, body?: unknown): Promise<LightMyRequestResponse> {
    const headers: Record<string, string> = {};
    if (this.cookie) headers.cookie = this.cookie;
    if (this.csrf && method !== 'GET') headers['x-csrf-token'] = this.csrf;
    const res = await this.app.inject({ method, url, headers, ...(body === undefined ? {} : { payload: body as object }) });
    const setCookie = res.cookies.find((c) => c.name === 'fgtm_sid');
    if (setCookie) this.cookie = setCookie.value ? `fgtm_sid=${setCookie.value}` : undefined;
    if (res.statusCode < 300 && res.headers['content-type']?.toString().includes('json')) {
      const data = res.json() as Partial<MeResponse>;
      if (data && typeof data === 'object' && 'csrfToken' in data) this.csrf = data.csrfToken;
    }
    return res;
  }

  get(url: string) {
    return this.request('GET', url);
  }
  post(url: string, body: unknown = {}) {
    return this.request('POST', url, body);
  }
  patch(url: string, body: unknown = {}) {
    return this.request('PATCH', url, body);
  }

  async login(email: string, password = TEST_PASSWORD): Promise<MeResponse> {
    const res = await this.post('/api/auth/login', { email, password });
    if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
    return res.json() as MeResponse;
  }
}

/** Extracts the token from the last mail link matching the path prefix. */
export function tokenFromMail(mails: MailMessage[], prefix: '/invite/' | '/reset/'): string {
  const mail = [...mails].reverse().find((m) => m.text.includes(prefix));
  const match = mail?.text.match(new RegExp(`${prefix}([A-Za-z0-9_-]+)`));
  if (!match?.[1]) throw new Error('no token in mails');
  return match[1];
}
