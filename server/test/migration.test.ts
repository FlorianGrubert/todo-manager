import { randomUUID } from 'node:crypto';
import knexFactory from 'knex';
import { describe, expect, it } from 'vitest';
import type { TodoDto } from '@fg/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { ALL_TABLES, copyDatabase } from '../src/db/copy.js';
import { createDb } from '../src/db/knex.js';
import { createTestEnv, PG_URL, TEST_DB, TestClient } from './helpers.js';
import { buildScenario } from './scenario.js';

// Needs both databases – runs in the PostgreSQL test project.
describe.skipIf(TEST_DB !== 'pg')('migration SQLite → PostgreSQL', () => {
  it('copies all data, verifies row counts and the application works on the target', async () => {
    const source = await createTestEnv({}, 'sqlite');
    const schema = `m_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const admin = knexFactory({ client: 'pg', connection: PG_URL });
    await admin.raw(`create schema ${schema}`);
    const target = createDb({ client: 'pg', databaseUrl: PG_URL, pgSchema: schema });
    try {
      const s = await buildScenario(source);
      await s.clients.reader.post(`/api/todos/${s.todos.t1}/comments`, { body: 'migrated?' });
      const expected = ((await s.clients.admin.get('/api/todos?scope=all&closed=1')).json() as TodoDto[]).map((t) => t.title).sort();

      const report = await copyDatabase(source.db, target);
      expect(report.map((r) => r.table)).toEqual([...ALL_TABLES]);
      expect(report.every((r) => r.source === r.target)).toBe(true);
      expect(report.find((r) => r.table === 'todos')?.target).toBe(5);

      // A second run must refuse to copy into a non-empty database.
      await expect(copyDatabase(source.db, target)).rejects.toThrow(/not empty/);

      const config = loadConfig({}, { NODE_ENV: 'test', LOG_LEVEL: 'silent', WEB_DIST: './no-web-dist', AUTH_RATE_LIMIT: '1000' });
      const app = await buildApp({ config, db: target, logger: false, mailer: { sent: [], send: () => Promise.resolve() } });
      try {
        const client = new TestClient(app);
        await client.login('admin@acme.test');
        const titles = ((await client.get('/api/todos?scope=all&closed=1')).json() as TodoDto[]).map((t) => t.title).sort();
        expect(titles).toEqual(expected);
        const t1 = (await client.get(`/api/todos/${s.todos.t1}`)).json() as TodoDto;
        expect(t1.commentCount).toBe(1);
      } finally {
        await app.close();
      }
    } finally {
      await target.destroy();
      await admin.raw(`drop schema ${schema} cascade`);
      await admin.destroy();
      await source.close();
    }
  });
});
