import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { paramsToTodoQuery, type FilterCriteria, type Locale, type SavedFilterDto } from '@fg/shared';
import { now } from '../../db/knex.js';
import { t } from '../../i18n/index.js';
import { notFound } from '../../lib/errors.js';
import { idParam } from '../../lib/http.js';
import { toCsv, toXlsx } from '../../lib/tabular.js';
import { parse } from '../../lib/validate.js';
import { loadProjectRoles } from '../../permissions/index.js';
import { getAuth, getTenant, loadMembership, requireAuth, requireTenant, scoped } from '../../tenancy/context.js';
import type { TenantContext } from '../../types.js';
import type { PriorityRow, StatusRow } from '../reference/mappers.js';
import { listTodoRows } from './query.js';
import { loadVisibleTodo, toTodoDtos } from './service.js';

const idList = z.array(z.string().min(1).max(64)).max(100);
const criteriaSchema = z.object({
  tagIds: idList.default([]),
  assigneeIds: idList.default([]),
  priorityIds: idList.default([]),
  projectIds: idList.default([]),
});

interface FilterRow {
  id: string;
  name: string;
  criteria: string;
}

const toFilterDto = (r: FilterRow): SavedFilterDto => {
  let criteria: FilterCriteria;
  try {
    criteria = criteriaSchema.parse(JSON.parse(r.criteria));
  } catch {
    criteria = { tagIds: [], assigneeIds: [], priorityIds: [], projectIds: [] };
  }
  return { id: r.id, name: r.name, criteria };
};

/** Saved filters, deep-link resolution and list export. */
export function todoExtraRoutes(app: FastifyInstance): void {
  const opts = { preHandler: requireTenant };
  const db = () => app.deps.db;

  // ---------------- saved filters (per member and tenant) ----------------
  const ownFilters = (ctx: TenantContext) => scoped(db(), ctx, 'saved_filters').where({ membership_id: ctx.membershipId });

  app.get('/api/filters', opts, async (req): Promise<SavedFilterDto[]> => {
    const ctx = getTenant(req);
    const rows = (await ownFilters(ctx).orderBy('name').select('id', 'name', 'criteria')) as FilterRow[];
    return rows.map(toFilterDto);
  });

  app.post('/api/filters', opts, async (req, reply) => {
    const ctx = getTenant(req);
    const body = parse(z.object({ name: z.string().trim().min(1).max(100), criteria: criteriaSchema }), req.body);
    const row: FilterRow & Record<string, unknown> = {
      id: randomUUID(),
      tenant_id: ctx.tenantId,
      membership_id: ctx.membershipId,
      name: body.name,
      criteria: JSON.stringify(body.criteria),
      created_at: now(),
      updated_at: now(),
    };
    await db()('saved_filters').insert(row);
    return reply.code(201).send(toFilterDto(row));
  });

  app.patch('/api/filters/:id', opts, async (req): Promise<SavedFilterDto> => {
    const ctx = getTenant(req);
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.object({ name: z.string().trim().min(1).max(100).optional(), criteria: criteriaSchema.optional() }),
      req.body,
    );
    const update: Record<string, unknown> = { updated_at: now() };
    if (body.name) update.name = body.name;
    if (body.criteria) update.criteria = JSON.stringify(body.criteria);
    const count = await ownFilters(ctx).where({ id }).update(update);
    if (count !== 1) throw notFound();
    return toFilterDto((await ownFilters(ctx).where({ id }).first('id', 'name', 'criteria')) as FilterRow);
  });

  app.delete('/api/filters/:id', opts, async (req, reply) => {
    const ctx = getTenant(req);
    const { id } = parse(idParam, req.params);
    const count = await ownFilters(ctx).where({ id }).delete();
    if (count !== 1) throw notFound();
    return reply.code(204).send();
  });

  // ---------------- deep links ----------------
  /**
   * Resolves the tenant of a shared To-Do link. This is the only lookup across
   * tenants: it only succeeds when the current user is an active member of the
   * To-Do's tenant AND may see the To-Do there. Otherwise the answer is the same
   * 404 as for a non-existing To-Do (Zero Trust, §5 „To-Dos teilen“).
   */
  app.get('/api/todos/:id/locate', { preHandler: requireAuth }, async (req) => {
    const auth = getAuth(req);
    const { id } = parse(idParam, req.params);
    const todo = (await db()('todos').where({ id }).first('tenant_id')) as { tenant_id: string } | undefined;
    if (!todo) throw notFound();
    const m = await loadMembership(db(), auth.userId, todo.tenant_id);
    if (!m) throw notFound();
    const ctx: TenantContext = {
      tenantId: m.tenant_id,
      membershipId: m.id,
      userId: m.user_id,
      tenantRole: m.tenant_role,
      defaultRole: m.default_role,
      displayName: m.display_name,
    };
    await loadVisibleTodo(db(), ctx, await loadProjectRoles(db(), ctx), id);
    return { tenantId: ctx.tenantId };
  });

  // ---------------- export (CSV / XLSX) ----------------
  app.get('/api/todos/export', opts, async (req, reply) => {
    const ctx = getTenant(req);
    const auth = getAuth(req);
    const query = req.query as Record<string, unknown>;
    const { format, tz } = parse(
      z.object({ format: z.enum(['csv', 'xlsx']).default('xlsx'), tz: z.string().max(64).optional() }),
      query,
    );
    const filters = paramsToTodoQuery(query);
    const locale: Locale = auth.locale;
    let timeZone = 'Europe/Berlin';
    if (tz) {
      try {
        new Intl.DateTimeFormat('de', { timeZone: tz });
        timeZone = tz;
      } catch {
        // ignore unknown time zones
      }
    }

    const roles = await loadProjectRoles(db(), ctx);
    const todos = await toTodoDtos(db(), ctx, roles, await listTodoRows(db(), ctx, roles, filters));

    const statuses = new Map(((await scoped(db(), ctx, 'statuses')) as StatusRow[]).map((s) => [s.id, s]));
    const priorities = new Map(((await scoped(db(), ctx, 'priorities')) as PriorityRow[]).map((p) => [p.id, p]));
    const projects = new Map(
      ((await scoped(db(), ctx, 'projects').select('id', 'name')) as { id: string; name: string }[]).map((p) => [p.id, p.name]),
    );
    const members = new Map(
      ((await scoped(db(), ctx, 'memberships').select('id', 'display_name')) as { id: string; display_name: string }[]).map(
        (m) => [m.id, m.display_name],
      ),
    );
    const label = (kind: 'status' | 'priority', row: { name: string | null; system_key: string | null } | undefined) =>
      row ? (row.name ?? (row.system_key ? t(locale, `${kind}.${row.system_key}`) : '')) : '';
    const dateTime = new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
    });
    const date = (iso: string | null) => {
      if (!iso) return '';
      const [y, m, d] = iso.split('-');
      return locale === 'de' ? `${d}.${m}.${y}` : iso;
    };

    const columns = [
      'title',
      'description',
      'project',
      'status',
      'priority',
      'assignee',
      'dueDate',
      'tags',
      'links',
      'createdAt',
      'createdBy',
      'updatedAt',
      'updatedBy',
      'url',
    ];
    const header = columns.map((c) => t(locale, `export.columns.${c}`));
    const rows = todos.map((todo) => [
      todo.title,
      todo.description ?? '',
      todo.projectId ? (projects.get(todo.projectId) ?? '') : '',
      label('status', statuses.get(todo.statusId)),
      todo.priorityId ? label('priority', priorities.get(todo.priorityId)) : '',
      todo.assigneeId ? (members.get(todo.assigneeId) ?? '') : '',
      date(todo.dueDate),
      todo.tags.map((tag) => tag.name).join(', '),
      todo.links.map((l) => l.url).join('\n'),
      dateTime.format(new Date(todo.createdAt)),
      todo.createdBy.displayName,
      dateTime.format(new Date(todo.updatedAt)),
      todo.updatedBy.displayName,
      `${app.deps.config.BASE_URL}/todos/${todo.id}`,
    ]);

    const filename = `${t(locale, 'export.filename')}-${new Date().toISOString().slice(0, 10)}.${format}`;
    reply.header('content-disposition', `attachment; filename="${filename}"`);
    reply.header('cache-control', 'no-store');
    if (format === 'csv') {
      reply.type('text/csv; charset=utf-8');
      return reply.send(toCsv(header, rows, locale === 'de' ? ';' : ','));
    }
    reply.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return reply.send(toXlsx(t(locale, 'export.sheet'), header, rows));
  });
}
