import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import knexFactory, { type Knex } from 'knex';
import { migrationSource } from './migrations/index.js';

export type Db = Knex;

export interface DbOptions {
  client: 'sqlite' | 'pg';
  sqliteFile?: string;
  databaseUrl?: string;
  /** PostgreSQL only: schema to use (tests run in isolated schemas). */
  pgSchema?: string;
}

/**
 * Creates a Knex instance for SQLite or PostgreSQL. Only portable features are
 * used in the application, so both backends behave identically.
 */
export function createDb(options: DbOptions): Db {
  if (options.client === 'sqlite') {
    const file = options.sqliteFile ?? './data/todo-manager.db';
    if (file !== ':memory:') mkdirSync(dirname(resolve(file)), { recursive: true });
    return knexFactory({
      client: 'better-sqlite3',
      connection: { filename: file },
      useNullAsDefault: true,
      pool: {
        min: 1,
        max: 1,
        afterCreate: (conn: { pragma: (s: string) => void }, done: (err: Error | null, conn: unknown) => void) => {
          conn.pragma('foreign_keys = ON');
          conn.pragma('journal_mode = WAL');
          conn.pragma('busy_timeout = 5000');
          done(null, conn);
        },
      },
    });
  }
  if (!options.databaseUrl) throw new Error('DATABASE_URL is required for PostgreSQL');
  return knexFactory({
    client: 'pg',
    connection: options.databaseUrl,
    searchPath: options.pgSchema ? [options.pgSchema] : undefined,
    pool: { min: 0, max: 10 },
  });
}

export async function migrateLatest(db: Db): Promise<void> {
  await db.migrate.latest({ migrationSource });
}

/** Current UTC timestamp as fixed-length ISO string (sortable as text). */
export function now(): string {
  return new Date().toISOString();
}
