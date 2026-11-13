/**
 * Migrates all data from SQLite to PostgreSQL (§10).
 *
 * Usage: npm run migrate:sqlite-to-pg -- [--from ./data/todo-manager.db] [--to postgres://user:pass@host/db]
 * Defaults: SQLITE_FILE and DATABASE_URL from the configuration.
 *
 * The PostgreSQL database must be empty. Stop the application before migrating;
 * afterwards set DB_CLIENT=pg and start it again. The SQLite file is not changed.
 */
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { loadConfig, loadEnvFile } from '../config.js';
import { copyDatabase } from '../db/copy.js';
import { createDb } from '../db/knex.js';

loadEnvFile();
const config = loadConfig();
const { values } = parseArgs({ options: { from: { type: 'string' }, to: { type: 'string' } } });
const from = values.from ?? config.SQLITE_FILE;
const to = values.to ?? config.DATABASE_URL;

if (!existsSync(from)) {
  console.error(`SQLite file not found: ${from}`);
  process.exit(1);
}
if (!to) {
  console.error('No PostgreSQL connection given (--to or DATABASE_URL).');
  process.exit(1);
}

const source = createDb({ client: 'sqlite', sqliteFile: from });
const target = createDb({ client: 'pg', databaseUrl: to });
try {
  console.log(`Copying ${from} → PostgreSQL …`);
  const report = await copyDatabase(source, target, (msg) => console.log(`  ${msg}`));
  const rows = report.reduce((sum, r) => sum + r.target, 0);
  console.log(`Done: ${rows} rows copied and verified.`);
  console.log('Next steps: set DB_CLIENT=pg and DATABASE_URL in .env, then restart the application.');
} catch (err) {
  console.error(`Migration failed: ${err instanceof Error ? err.message : String(err)}`);
  console.error('Nothing was committed to PostgreSQL.');
  process.exitCode = 1;
} finally {
  await source.destroy();
  await target.destroy();
}
