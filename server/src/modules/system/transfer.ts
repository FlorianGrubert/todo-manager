/**
 * Export and import of a single tenant (§11 „Export und Import pro Mandant“).
 *
 * The export is a JSON document with all data of the tenant including history.
 * On import every ID is replaced by a new one, so a tenant can be imported next
 * to its original (or into another installation) without collisions. Persons
 * are matched by e-mail address; unknown persons get an account without
 * password (they set one via "forgot password"). Nothing of other tenants is
 * read or changed.
 */
import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { z } from 'zod';
import { NONE } from '@fg/shared';
import { normalizeEmail } from '../../auth/service.js';
import type { Db } from '../../db/knex.js';
import { now } from '../../db/knex.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { toBool } from '../../lib/flags.js';

export const EXPORT_FORMAT = 'fg-todo-manager/tenant';
export const EXPORT_VERSION = 1;

const id = z.string().min(1).max(64);
const ts = z.string().max(30);
const flag = z.coerce.number().int().min(0).max(1);
const text = (max: number) => z.string().max(max);
const num = z.coerce.number().int();

const memberSchema = z.object({
  id,
  email: z.string().max(320).nullable(),
  name: text(200),
  locale: z.enum(['de', 'en']),
  display_name: text(200),
  tenant_role: z.enum(['admin', 'project_admin', 'member']),
  default_role: z.enum(['editor', 'restricted', 'reader', 'none']),
  is_active: flag,
  pseudonymized: flag,
  accepted_at: ts.nullable(),
  last_login_at: ts.nullable(),
  created_at: ts,
  updated_at: ts,
});
const projectSchema = z.object({
  id,
  name: text(200),
  description: z.string().max(10_000).nullable(),
  archived_at: ts.nullable(),
  created_by: id.nullable(),
  created_at: ts,
  updated_at: ts,
});
const projectMemberSchema = z.object({ id, project_id: id, membership_id: id, role: z.enum(['editor', 'restricted', 'reader']), created_at: ts });
const statusSchema = z.object({
  id,
  system_key: text(40).nullable(),
  name: text(100).nullable(),
  rank: num,
  color: text(9),
  category: z.enum(['open', 'done', 'cancelled']),
  is_new_default: flag,
  is_cancel_target: flag,
  removed_at: ts.nullable(),
  created_at: ts,
  updated_at: ts,
});
const prioritySchema = z.object({
  id,
  system_key: text(40).nullable(),
  name: text(100).nullable(),
  rank: num,
  icon_kind: z.enum(['arrows', 'exclamation']),
  icon_arrows: num,
  icon_direction: z.enum(['up', 'down']),
  icon_color: z.enum(['green', 'yellow', 'red']),
  removed_at: ts.nullable(),
  created_at: ts,
  updated_at: ts,
});
const tagSchema = z.object({ id, name: text(100), color: text(9).nullable(), created_at: ts });
const todoSchema = z.object({
  id,
  project_id: id.nullable(),
  title: text(500),
  description: z.string().max(20_000).nullable(),
  due_date: text(10).nullable(),
  priority_id: id.nullable(),
  assignee_id: id.nullable(),
  status_id: id,
  client_id: text(64).nullable(),
  created_by: id,
  updated_by: id,
  created_at: ts,
  updated_at: ts,
});
const linkSchema = z.object({ id, todo_id: id, url: text(2000), label: text(200).nullable(), position: num });
const todoTagSchema = z.object({ todo_id: id, tag_id: id });
const commentSchema = z.object({ id, todo_id: id, author_id: id, body: z.string().max(10_000), created_at: ts });
const historySchema = z.object({
  id,
  todo_id: id,
  changed_by: id,
  changed_at: ts,
  field: text(40),
  old_value: z.string().max(25_000).nullable(),
  new_value: z.string().max(25_000).nullable(),
});
const filterSchema = z.object({ id, membership_id: id, name: text(100), criteria: z.string().max(20_000), created_at: ts, updated_at: ts });

export const tenantExportSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  appVersion: z.string().max(40),
  exportedAt: ts,
  tenant: z.object({ name: text(200), createdAt: ts }),
  members: z.array(memberSchema),
  projects: z.array(projectSchema),
  projectMembers: z.array(projectMemberSchema),
  statuses: z.array(statusSchema),
  priorities: z.array(prioritySchema),
  tags: z.array(tagSchema),
  todos: z.array(todoSchema),
  todoLinks: z.array(linkSchema),
  todoTags: z.array(todoTagSchema),
  comments: z.array(commentSchema),
  history: z.array(historySchema),
  savedFilters: z.array(filterSchema),
});
export type TenantExport = z.infer<typeof tenantExportSchema>;

/** Tables with tenant data, in deletion order (children first). */
const TENANT_TABLES = [
  'saved_filters',
  'notification_log',
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
  'invitations',
  'memberships',
] as const;

const strip = <T extends Record<string, unknown>>(rows: T[]) =>
  rows.map((row) => {
    const { tenant_id: _tenant, ...rest } = row;
    return rest;
  });

export async function exportTenant(db: Db, tenantId: string, appVersion: string): Promise<TenantExport> {
  const tenant = (await db('tenants').where({ id: tenantId }).first('name', 'created_at')) as
    | { name: string; created_at: string }
    | undefined;
  if (!tenant) throw notFound();
  const all = (table: string) => db(table).where({ tenant_id: tenantId }).orderBy(table === 'todo_tags' ? 'todo_id' : 'id');

  const members = (await db('memberships as m')
    .join('users as u', 'u.id', 'm.user_id')
    .where('m.tenant_id', tenantId)
    .orderBy('m.id')
    .select(
      'm.id',
      'u.email',
      'u.name',
      'u.locale',
      'm.display_name',
      'm.tenant_role',
      'm.default_role',
      'm.is_active',
      'm.pseudonymized',
      'm.accepted_at',
      'm.last_login_at',
      'm.created_at',
      'm.updated_at',
    )) as TenantExport['members'];

  const data = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    appVersion,
    exportedAt: now(),
    tenant: { name: tenant.name, createdAt: tenant.created_at },
    // Pseudonymized persons are exported without personal data.
    members: members.map((m) =>
      toBool(m.pseudonymized) ? { ...m, email: null, name: m.display_name } : m,
    ),
    projects: strip(await all('projects')),
    projectMembers: strip(await all('project_members')),
    statuses: strip(await all('statuses')),
    priorities: strip(await all('priorities')),
    tags: strip(await all('tags')),
    todos: strip(await all('todos')),
    todoLinks: strip(await all('todo_links')),
    todoTags: strip(await all('todo_tags')),
    comments: strip(await all('comments')),
    history: strip(await all('todo_history')),
    savedFilters: strip(await all('saved_filters')),
  };
  // Validate our own output, so an export can always be imported again.
  return tenantExportSchema.parse(data);
}

/** Old ID → new ID per object type; unknown references make the import invalid. */
class IdMap {
  private readonly map = new Map<string, string>();
  add(oldId: string): string {
    if (this.map.has(oldId)) throw badRequest();
    const fresh = randomUUID();
    this.map.set(oldId, fresh);
    return fresh;
  }
  get(oldId: string): string {
    const value = this.map.get(oldId);
    if (!value) throw badRequest();
    return value;
  }
  optional(oldId: string | null): string | null {
    return oldId === null ? null : this.get(oldId);
  }
  tryGet(oldId: string | null): string | null {
    return oldId === null ? null : (this.map.get(oldId) ?? null);
  }
}

/** Deletes all data of a tenant (only used when a tenant is replaced by an import). */
async function clearTenant(trx: Knex, tenantId: string): Promise<void> {
  for (const table of TENANT_TABLES) await trx(table).where({ tenant_id: tenantId }).delete();
}

export interface ImportTarget {
  /** Replace this existing tenant; otherwise a new tenant is created. */
  replaceTenantId?: string;
  /** Name of the new tenant (defaults to the exported name). */
  name?: string;
}

export async function importTenant(db: Db, raw: unknown, target: ImportTarget): Promise<{ tenantId: string }> {
  const parsed = tenantExportSchema.safeParse(raw);
  if (!parsed.success) throw badRequest();
  const data = parsed.data;
  const ts = now();

  return db.transaction(async (trx) => {
    let tenantId: string;
    if (target.replaceTenantId) {
      tenantId = target.replaceTenantId;
      if (!(await trx('tenants').where({ id: tenantId }).first('id'))) throw notFound();
      await clearTenant(trx, tenantId);
      await trx('tenants').where({ id: tenantId }).update({ updated_at: ts });
    } else {
      tenantId = randomUUID();
      await trx('tenants').insert({
        id: tenantId,
        name: target.name?.trim() || data.tenant.name,
        is_active: 1,
        created_at: ts,
        updated_at: ts,
      });
    }

    const members = new IdMap();
    const projects = new IdMap();
    const statuses = new IdMap();
    const priorities = new IdMap();
    const tags = new IdMap();
    const todos = new IdMap();
    const t = (row: object) => ({ ...row, tenant_id: tenantId });

    // Persons: reuse accounts by e-mail; never change existing accounts.
    const seenEmails = new Set<string>();
    for (const m of data.members) {
      let userId: string;
      if (m.email) {
        const email = normalizeEmail(m.email);
        if (seenEmails.has(email)) throw badRequest();
        seenEmails.add(email);
        const existing = (await trx('users').where({ email }).first('id')) as { id: string } | undefined;
        if (existing) userId = existing.id;
        else {
          userId = randomUUID();
          await trx('users').insert({ id: userId, email, name: m.name, locale: m.locale, password_hash: null, created_at: ts, updated_at: ts });
        }
      } else {
        userId = randomUUID();
        await trx('users').insert({
          id: userId,
          email: `pseudonym-${randomUUID()}@invalid.invalid`,
          name: m.display_name,
          locale: m.locale,
          password_hash: null,
          is_active: 0,
          created_at: ts,
          updated_at: ts,
        });
      }
      const { email: _e, name: _n, locale: _l, id: oldId, ...membership } = m;
      await trx('memberships').insert(t({ ...membership, id: members.add(oldId), user_id: userId }));
    }

    for (const p of data.projects) {
      await trx('projects').insert(t({ ...p, id: projects.add(p.id), created_by: members.tryGet(p.created_by) }));
    }
    for (const pm of data.projectMembers) {
      await trx('project_members').insert(
        t({ ...pm, id: randomUUID(), project_id: projects.get(pm.project_id), membership_id: members.get(pm.membership_id) }),
      );
    }
    for (const s of data.statuses) await trx('statuses').insert(t({ ...s, id: statuses.add(s.id) }));
    for (const p of data.priorities) await trx('priorities').insert(t({ ...p, id: priorities.add(p.id) }));
    for (const tag of data.tags) await trx('tags').insert(t({ ...tag, id: tags.add(tag.id) }));

    for (const todo of data.todos) {
      await trx('todos').insert(
        t({
          ...todo,
          id: todos.add(todo.id),
          project_id: projects.optional(todo.project_id),
          priority_id: priorities.optional(todo.priority_id),
          assignee_id: members.optional(todo.assignee_id),
          status_id: statuses.get(todo.status_id),
          created_by: members.get(todo.created_by),
          updated_by: members.get(todo.updated_by),
        }),
      );
    }
    for (const link of data.todoLinks) {
      await trx('todo_links').insert(t({ ...link, id: randomUUID(), todo_id: todos.get(link.todo_id) }));
    }
    for (const tt of data.todoTags) {
      await trx('todo_tags').insert(t({ todo_id: todos.get(tt.todo_id), tag_id: tags.get(tt.tag_id) }));
    }
    for (const c of data.comments) {
      await trx('comments').insert(t({ ...c, id: randomUUID(), todo_id: todos.get(c.todo_id), author_id: members.get(c.author_id) }));
    }

    // History values contain IDs for some fields; translate them as well.
    const valueMap: Record<string, IdMap> = { status: statuses, priority: priorities, assignee: members, project: projects };
    for (const h of data.history) {
      const map = valueMap[h.field];
      await trx('todo_history').insert(
        t({
          ...h,
          id: randomUUID(),
          todo_id: todos.get(h.todo_id),
          changed_by: members.get(h.changed_by),
          old_value: map ? map.tryGet(h.old_value) : h.old_value,
          new_value: map ? map.tryGet(h.new_value) : h.new_value,
        }),
      );
    }

    for (const f of data.savedFilters) {
      let criteria: Record<string, string[]>;
      try {
        criteria = JSON.parse(f.criteria) as Record<string, string[]>;
      } catch {
        criteria = {};
      }
      const remap = (values: unknown, map: IdMap) =>
        (Array.isArray(values) ? values : [])
          .filter((v): v is string => typeof v === 'string')
          .map((v) => (v === NONE ? v : map.tryGet(v)))
          .filter((v): v is string => v !== null);
      const next = {
        tagIds: remap(criteria.tagIds, tags),
        assigneeIds: remap(criteria.assigneeIds, members),
        priorityIds: remap(criteria.priorityIds, priorities),
        projectIds: remap(criteria.projectIds, projects),
      };
      await trx('saved_filters').insert(
        t({ ...f, id: randomUUID(), membership_id: members.get(f.membership_id), criteria: JSON.stringify(next) }),
      );
    }
    return { tenantId };
  });
}
