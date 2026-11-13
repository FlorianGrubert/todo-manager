import type { Knex } from 'knex';
import * as m001 from './001_initial.js';

interface Migration {
  up: (knex: Knex) => Promise<void>;
  down: (knex: Knex) => Promise<void>;
}

/** Ordered list of migrations, bundled statically (works from source and build). */
const migrations: Record<string, Migration> = {
  '001_initial': m001,
};

export const migrationSource: Knex.MigrationSource<string> = {
  getMigrations: () => Promise.resolve(Object.keys(migrations)),
  getMigrationName: (name) => name,
  getMigration: (name) => {
    const migration = migrations[name];
    if (!migration) throw new Error(`Unknown migration ${name}`);
    return Promise.resolve(migration);
  },
};
