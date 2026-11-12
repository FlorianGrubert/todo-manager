import { buildApp } from './app.js';
import { loadConfig, loadEnvFile } from './config.js';
import { createDb, migrateLatest } from './db/knex.js';

loadEnvFile();
const config = loadConfig();
const db = createDb({ client: config.DB_CLIENT, sqliteFile: config.SQLITE_FILE, databaseUrl: config.DATABASE_URL });
await migrateLatest(db);

const app = await buildApp({ config, db });

const shutdown = async () => {
  await app.close();
  await db.destroy();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await app.listen({ host: config.HOST, port: config.PORT });
app.log.info(`FG To-Do-Manager ${config.version} listening on ${config.BASE_URL} (database: ${config.DB_CLIENT})`);
