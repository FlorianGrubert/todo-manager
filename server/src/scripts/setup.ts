/**
 * Setup script: creates/updates the database schema and creates (or promotes)
 * the first system administrator.
 *
 * Usage: npm run setup -- --email admin@example.com --name "Admin" [--password ...]
 * Alternatively SETUP_ADMIN_EMAIL / SETUP_ADMIN_NAME / SETUP_ADMIN_PASSWORD.
 * Missing values are asked interactively.
 */
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { PASSWORD_MIN_LENGTH } from '@fg/shared';
import { hashPassword } from '../auth/password.js';
import { normalizeEmail } from '../auth/service.js';
import { loadConfig, loadEnvFile } from '../config.js';
import { createDb, migrateLatest, now } from '../db/knex.js';

loadEnvFile();
const config = loadConfig();
const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    password: { type: 'string' },
    'migrate-only': { type: 'boolean', default: false },
  },
});

const db = createDb({ client: config.DB_CLIENT, sqliteFile: config.SQLITE_FILE, databaseUrl: config.DATABASE_URL });
try {
  await migrateLatest(db);
  console.log(`Database schema is up to date (${config.DB_CLIENT}).`);

  if (!values['migrate-only']) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = async (question: string, preset?: string) => preset ?? (await rl.question(question)).trim();
    const email = normalizeEmail(await ask('System administrator e-mail: ', values.email ?? process.env.SETUP_ADMIN_EMAIL));
    const name = await ask('Name: ', values.name ?? process.env.SETUP_ADMIN_NAME);
    const password = await ask(
      `Password (min. ${PASSWORD_MIN_LENGTH} characters): `,
      values.password ?? process.env.SETUP_ADMIN_PASSWORD,
    );
    rl.close();

    if (!email.includes('@')) throw new Error('Invalid e-mail address.');
    if (password.length < PASSWORD_MIN_LENGTH) throw new Error(`Password must have at least ${PASSWORD_MIN_LENGTH} characters.`);

    const ts = now();
    const passwordHash = await hashPassword(password);
    const existing = (await db('users').where({ email }).first()) as { id: string } | undefined;
    if (existing) {
      await db('users')
        .where({ id: existing.id })
        .update({ is_system_admin: 1, is_active: 1, password_hash: passwordHash, ...(name ? { name } : {}), updated_at: ts });
      console.log(`Existing user ${email} is now system administrator; password was updated.`);
    } else {
      await db('users').insert({
        id: randomUUID(),
        email,
        name: name || email,
        password_hash: passwordHash,
        locale: config.DEFAULT_LOCALE,
        is_system_admin: 1,
        created_at: ts,
        updated_at: ts,
      });
      console.log(`System administrator ${email} created.`);
    }
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
