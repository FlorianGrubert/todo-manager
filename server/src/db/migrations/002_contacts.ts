import type { Knex } from 'knex';

/*
 * Persons without login ("contacts"): a membership of kind `contact` that can be
 * assigned to To-Dos of the projects it is linked to (project_members role
 * `contact`). Converting a person into a user keeps the membership (and thus all
 * assignments) and only switches the kind to `user`.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('memberships', (t) => {
    t.string('kind', 10).notNullable().defaultTo('user');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('memberships', (t) => {
    t.dropColumn('kind');
  });
}
