import type { Knex } from 'knex';

/*
 * Portable schema: only column types available in SQLite and PostgreSQL.
 * - IDs are UUID strings (36 chars)
 * - timestamps are ISO-8601 UTC strings (24 chars, sortable as text)
 * - due dates are `YYYY-MM-DD` strings
 * - flags are integers 0/1
 * Every tenant-owned table carries `tenant_id`, also child tables.
 */

const id = (t: Knex.CreateTableBuilder, name = 'id') => t.string(name, 36);
const ts = (t: Knex.CreateTableBuilder, name: string) => t.string(name, 30);
const flag = (t: Knex.CreateTableBuilder, name: string, def: 0 | 1) => t.integer(name).notNullable().defaultTo(def);

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('tenants', (t) => {
    id(t).primary();
    t.string('name', 200).notNullable();
    flag(t, 'is_active', 1);
    ts(t, 'created_at').notNullable();
    ts(t, 'updated_at').notNullable();
  });

  await knex.schema.createTable('users', (t) => {
    id(t).primary();
    t.string('email', 320).notNullable().unique();
    t.string('password_hash', 255).nullable();
    t.string('name', 200).notNullable().defaultTo('');
    t.string('locale', 5).notNullable().defaultTo('de');
    id(t, 'last_tenant_id').nullable().references('tenants.id');
    flag(t, 'is_system_admin', 0);
    flag(t, 'is_active', 1);
    flag(t, 'notify_assign', 1);
    t.integer('remind_days_before').nullable();
    flag(t, 'notify_overdue', 1);
    ts(t, 'created_at').notNullable();
    ts(t, 'updated_at').notNullable();
  });

  await knex.schema.createTable('memberships', (t) => {
    id(t).primary();
    id(t, 'tenant_id').notNullable().references('tenants.id');
    id(t, 'user_id').notNullable().references('users.id');
    t.string('display_name', 200).notNullable();
    t.string('tenant_role', 20).notNullable().defaultTo('member');
    t.string('default_role', 20).notNullable().defaultTo('none');
    flag(t, 'is_active', 1);
    flag(t, 'pseudonymized', 0);
    ts(t, 'accepted_at').nullable();
    ts(t, 'last_login_at').nullable();
    ts(t, 'created_at').notNullable();
    ts(t, 'updated_at').notNullable();
    t.unique(['tenant_id', 'user_id']);
  });

  await knex.schema.createTable('invitations', (t) => {
    id(t).primary();
    id(t, 'tenant_id').notNullable().references('tenants.id');
    id(t, 'membership_id').notNullable().references('memberships.id');
    t.string('token_hash', 64).notNullable().unique();
    ts(t, 'expires_at').notNullable();
    ts(t, 'used_at').nullable();
    ts(t, 'revoked_at').nullable();
    id(t, 'created_by_user_id').nullable().references('users.id');
    ts(t, 'created_at').notNullable();
  });

  await knex.schema.createTable('password_resets', (t) => {
    id(t).primary();
    id(t, 'user_id').notNullable().references('users.id');
    t.string('token_hash', 64).notNullable().unique();
    ts(t, 'expires_at').notNullable();
    ts(t, 'used_at').nullable();
    ts(t, 'created_at').notNullable();
  });

  await knex.schema.createTable('sessions', (t) => {
    t.string('id', 64).primary(); // sha256 of the cookie token
    id(t, 'user_id').notNullable().references('users.id');
    id(t, 'active_tenant_id').nullable().references('tenants.id');
    t.string('csrf_token', 64).notNullable();
    ts(t, 'created_at').notNullable();
    ts(t, 'expires_at').notNullable();
    t.index(['user_id']);
  });

  await knex.schema.createTable('projects', (t) => {
    id(t).primary();
    id(t, 'tenant_id').notNullable().references('tenants.id');
    t.string('name', 200).notNullable();
    t.text('description').nullable();
    ts(t, 'archived_at').nullable();
    id(t, 'created_by').nullable().references('memberships.id');
    ts(t, 'created_at').notNullable();
    ts(t, 'updated_at').notNullable();
    t.index(['tenant_id']);
  });

  await knex.schema.createTable('project_members', (t) => {
    id(t).primary();
    id(t, 'tenant_id').notNullable().references('tenants.id');
    id(t, 'project_id').notNullable().references('projects.id');
    id(t, 'membership_id').notNullable().references('memberships.id');
    t.string('role', 20).notNullable();
    ts(t, 'created_at').notNullable();
    t.unique(['project_id', 'membership_id']);
    t.index(['tenant_id', 'membership_id']);
  });

  await knex.schema.createTable('statuses', (t) => {
    id(t).primary();
    id(t, 'tenant_id').notNullable().references('tenants.id');
    t.string('system_key', 40).nullable();
    t.string('name', 100).nullable();
    t.integer('rank').notNullable();
    t.string('color', 9).notNullable();
    t.string('category', 10).notNullable().defaultTo('open');
    flag(t, 'is_new_default', 0);
    flag(t, 'is_cancel_target', 0);
    ts(t, 'removed_at').nullable();
    ts(t, 'created_at').notNullable();
    ts(t, 'updated_at').notNullable();
    t.index(['tenant_id']);
  });

  await knex.schema.createTable('priorities', (t) => {
    id(t).primary();
    id(t, 'tenant_id').notNullable().references('tenants.id');
    t.string('system_key', 40).nullable();
    t.string('name', 100).nullable();
    t.integer('rank').notNullable();
    t.string('icon_kind', 12).notNullable().defaultTo('arrows');
    t.integer('icon_arrows').notNullable().defaultTo(1);
    t.string('icon_direction', 4).notNullable().defaultTo('up');
    t.string('icon_color', 6).notNullable().defaultTo('yellow');
    ts(t, 'removed_at').nullable();
    ts(t, 'created_at').notNullable();
    ts(t, 'updated_at').notNullable();
    t.index(['tenant_id']);
  });

  await knex.schema.createTable('tags', (t) => {
    id(t).primary();
    id(t, 'tenant_id').notNullable().references('tenants.id');
    t.string('name', 100).notNullable();
    t.string('color', 9).nullable();
    ts(t, 'created_at').notNullable();
    t.unique(['tenant_id', 'name']);
  });

  await knex.schema.createTable('todos', (t) => {
    id(t).primary();
    id(t, 'tenant_id').notNullable().references('tenants.id');
    id(t, 'project_id').nullable().references('projects.id');
    t.string('title', 500).notNullable();
    t.text('description').nullable();
    t.string('due_date', 10).nullable();
    id(t, 'priority_id').nullable().references('priorities.id');
    id(t, 'assignee_id').nullable().references('memberships.id');
    id(t, 'status_id').notNullable().references('statuses.id');
    t.string('client_id', 64).nullable();
    id(t, 'created_by').notNullable().references('memberships.id');
    id(t, 'updated_by').notNullable().references('memberships.id');
    ts(t, 'created_at').notNullable();
    ts(t, 'updated_at').notNullable();
    t.unique(['tenant_id', 'client_id']);
    t.index(['tenant_id', 'status_id']);
    t.index(['tenant_id', 'assignee_id']);
    t.index(['tenant_id', 'project_id']);
  });

  await knex.schema.createTable('todo_links', (t) => {
    id(t).primary();
    id(t, 'tenant_id').notNullable().references('tenants.id');
    id(t, 'todo_id').notNullable().references('todos.id');
    t.string('url', 2000).notNullable();
    t.string('label', 200).nullable();
    t.integer('position').notNullable().defaultTo(0);
    t.index(['todo_id']);
  });

  await knex.schema.createTable('todo_tags', (t) => {
    id(t, 'tenant_id').notNullable().references('tenants.id');
    id(t, 'todo_id').notNullable().references('todos.id');
    id(t, 'tag_id').notNullable().references('tags.id');
    t.primary(['todo_id', 'tag_id']);
    t.index(['tenant_id', 'tag_id']);
  });

  await knex.schema.createTable('comments', (t) => {
    id(t).primary();
    id(t, 'tenant_id').notNullable().references('tenants.id');
    id(t, 'todo_id').notNullable().references('todos.id');
    id(t, 'author_id').notNullable().references('memberships.id');
    t.text('body').notNullable();
    ts(t, 'created_at').notNullable();
    t.index(['todo_id']);
  });

  await knex.schema.createTable('todo_history', (t) => {
    id(t).primary();
    id(t, 'tenant_id').notNullable().references('tenants.id');
    id(t, 'todo_id').notNullable().references('todos.id');
    id(t, 'changed_by').notNullable().references('memberships.id');
    ts(t, 'changed_at').notNullable();
    t.string('field', 40).notNullable();
    t.text('old_value').nullable();
    t.text('new_value').nullable();
    t.index(['todo_id']);
  });

  await knex.schema.createTable('saved_filters', (t) => {
    id(t).primary();
    id(t, 'tenant_id').notNullable().references('tenants.id');
    id(t, 'membership_id').notNullable().references('memberships.id');
    t.string('name', 100).notNullable();
    t.text('criteria').notNullable();
    ts(t, 'created_at').notNullable();
    ts(t, 'updated_at').notNullable();
    t.index(['tenant_id', 'membership_id']);
  });

  await knex.schema.createTable('notification_log', (t) => {
    id(t).primary();
    id(t, 'tenant_id').notNullable().references('tenants.id');
    id(t, 'todo_id').notNullable().references('todos.id');
    id(t, 'user_id').notNullable().references('users.id');
    t.string('kind', 20).notNullable();
    t.string('ref', 40).notNullable();
    ts(t, 'created_at').notNullable();
    t.unique(['tenant_id', 'todo_id', 'user_id', 'kind', 'ref']);
  });
}

export async function down(knex: Knex): Promise<void> {
  for (const table of [
    'notification_log',
    'saved_filters',
    'todo_history',
    'comments',
    'todo_tags',
    'todo_links',
    'todos',
    'tags',
    'priorities',
    'statuses',
    'project_members',
    'projects',
    'sessions',
    'password_resets',
    'invitations',
    'memberships',
    'users',
    'tenants',
  ]) {
    await knex.schema.dropTableIfExists(table);
  }
}
