import type { Knex } from 'knex';

/*
 * Access tokens for the MCP server (AI assistants):
 * - `access_tokens`: personal tokens of a membership (one tenant each); only the
 *   SHA-256 hash of the token is stored
 * - `tenants.allow_access_tokens`: the tenant administrator decides whether
 *   tokens may be used in the tenant (default: not allowed)
 * - `via` on history and comments: name of the token a change was made with
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('access_tokens', (t) => {
    t.string('id', 36).primary();
    t.string('tenant_id', 36).notNullable().references('tenants.id');
    t.string('membership_id', 36).notNullable().references('memberships.id');
    t.string('name', 100).notNullable();
    t.string('token_hash', 64).notNullable().unique();
    t.string('scope', 10).notNullable();
    t.integer('own_only').notNullable().defaultTo(0);
    t.string('created_at', 30).notNullable();
    t.string('expires_at', 30).notNullable();
    t.string('last_used_at', 30).nullable();
    t.string('revoked_at', 30).nullable();
    t.index(['tenant_id']);
    t.index(['membership_id']);
  });
  await knex.schema.alterTable('tenants', (t) => {
    t.integer('allow_access_tokens').notNullable().defaultTo(0);
  });
  await knex.schema.alterTable('todo_history', (t) => {
    t.string('via', 100).nullable();
  });
  await knex.schema.alterTable('comments', (t) => {
    t.string('via', 100).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('comments', (t) => {
    t.dropColumn('via');
  });
  await knex.schema.alterTable('todo_history', (t) => {
    t.dropColumn('via');
  });
  await knex.schema.alterTable('tenants', (t) => {
    t.dropColumn('allow_access_tokens');
  });
  await knex.schema.dropTableIfExists('access_tokens');
}
