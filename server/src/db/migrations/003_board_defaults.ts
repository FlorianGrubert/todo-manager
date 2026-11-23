import type { Knex } from 'knex';

/*
 * Personal board defaults of a user (apply to all tenants): the start scope
 * ("Meine" / "Alle") and the board view (status, person, tag, grid).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.string('default_scope', 10).notNullable().defaultTo('mine');
    t.string('default_view', 10).notNullable().defaultTo('status');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('default_scope');
    t.dropColumn('default_view');
  });
}
