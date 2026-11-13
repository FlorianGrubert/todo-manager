import type { Db } from './knex.js';
import { migrateLatest } from './knex.js';

/** All application tables, parents before children (foreign keys). */
export const ALL_TABLES = [
  'tenants',
  'users',
  'memberships',
  'invitations',
  'password_resets',
  'sessions',
  'projects',
  'project_members',
  'statuses',
  'priorities',
  'tags',
  'todos',
  'todo_links',
  'todo_tags',
  'comments',
  'todo_history',
  'saved_filters',
  'notification_log',
] as const;

const BATCH_SIZE = 500;

export interface CopyReport {
  table: string;
  source: number;
  target: number;
}

const count = async (db: Db, table: string) => Number(((await db(table).count({ c: '*' }).first()) as { c: number | string }).c);

/**
 * Copies the complete database (e.g. SQLite → PostgreSQL). Both schemas are
 * brought up to date first; the target must be empty. Everything is copied in
 * one transaction and the row counts are verified afterwards.
 */
export async function copyDatabase(source: Db, target: Db, log: (msg: string) => void = () => undefined): Promise<CopyReport[]> {
  await migrateLatest(source);
  await migrateLatest(target);

  for (const table of ALL_TABLES) {
    if ((await count(target, table)) > 0) {
      throw new Error(`Target database is not empty (table "${table}" contains data). Aborting.`);
    }
  }

  await target.transaction(async (trx) => {
    for (const table of ALL_TABLES) {
      const total = await count(source, table);
      const order = table === 'todo_tags' ? ['todo_id', 'tag_id'] : ['id'];
      for (let offset = 0; offset < total; offset += BATCH_SIZE) {
        const rows = (await source(table).orderBy(order).limit(BATCH_SIZE).offset(offset)) as Record<string, unknown>[];
        if (rows.length) await trx(table).insert(rows);
      }
      log(`${table}: ${total} rows`);
    }
  });

  const report: CopyReport[] = [];
  for (const table of ALL_TABLES) {
    report.push({ table, source: await count(source, table), target: await count(target, table) });
  }
  const mismatch = report.filter((r) => r.source !== r.target);
  if (mismatch.length) {
    throw new Error(`Row counts differ: ${mismatch.map((r) => `${r.table} ${r.source}≠${r.target}`).join(', ')}`);
  }
  return report;
}
