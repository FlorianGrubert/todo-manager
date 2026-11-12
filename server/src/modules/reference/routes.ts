import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  PRIORITY_ICON_COLORS,
  PRIORITY_ICON_DIRECTIONS,
  PRIORITY_ICON_KINDS,
  STATUS_CATEGORIES,
  type MemberDto,
  type PriorityDto,
  type StatusDto,
  type TagDto,
} from '@fg/shared';
import { now } from '../../db/knex.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { color, idParam, optionalId, pickDefined } from '../../lib/http.js';
import { parse } from '../../lib/validate.js';
import { effectiveRole, loadProjectRoles, requireTenantAdmin } from '../../permissions/index.js';
import { getTenant, requireTenant, scoped } from '../../tenancy/context.js';
import { reassignTodos } from '../todos/history.js';
import { toPriorityDto, toStatusDto, toTagDto, type PriorityRow, type StatusRow, type TagRow } from './mappers.js';

const rank = z.number().int().min(-1_000_000).max(1_000_000);
const name = z.string().trim().min(1).max(100);

const statusCreate = z.object({ name, rank, color, category: z.enum(STATUS_CATEGORIES) });
const statusUpdate = z.object({
  name: name.nullable().optional(),
  rank: rank.optional(),
  color: color.optional(),
  category: z.enum(STATUS_CATEGORIES).optional(),
  isNewDefault: z.literal(true).optional(),
  isCancelTarget: z.literal(true).optional(),
});

const priorityFields = {
  rank,
  iconKind: z.enum(PRIORITY_ICON_KINDS),
  iconArrows: z.number().int().min(1).max(3),
  iconDirection: z.enum(PRIORITY_ICON_DIRECTIONS),
  iconColor: z.enum(PRIORITY_ICON_COLORS),
};
const priorityCreate = z.object({ name, ...priorityFields });
const priorityUpdate = z.object({
  name: name.nullable().optional(),
  rank: rank.optional(),
  iconKind: priorityFields.iconKind.optional(),
  iconArrows: priorityFields.iconArrows.optional(),
  iconDirection: priorityFields.iconDirection.optional(),
  iconColor: priorityFields.iconColor.optional(),
});
const priorityColumns = {
  name: 'name',
  rank: 'rank',
  iconKind: 'icon_kind',
  iconArrows: 'icon_arrows',
  iconDirection: 'icon_direction',
  iconColor: 'icon_color',
};

/** Statuses, priorities, tags and member lists of the active tenant. */
export function referenceRoutes(app: FastifyInstance): void {
  const opts = { preHandler: requireTenant };
  const db = () => app.deps.db;

  // ---------------- statuses ----------------
  app.get('/api/statuses', opts, async (req): Promise<StatusDto[]> => {
    const ctx = getTenant(req);
    const rows = (await scoped(db(), ctx, 'statuses').whereNull('removed_at').orderBy([
      'rank',
      'created_at',
    ])) as StatusRow[];
    return rows.map(toStatusDto);
  });

  app.post('/api/statuses', opts, async (req, reply) => {
    const ctx = getTenant(req);
    requireTenantAdmin(ctx);
    const body = parse(statusCreate, req.body);
    const id = randomUUID();
    const ts = now();
    await db()('statuses').insert({
      id,
      tenant_id: ctx.tenantId,
      system_key: null,
      name: body.name,
      rank: body.rank,
      color: body.color,
      category: body.category,
      created_at: ts,
      updated_at: ts,
    });
    return reply.code(201).send({ id });
  });

  app.patch('/api/statuses/:id', opts, async (req, reply) => {
    const ctx = getTenant(req);
    requireTenantAdmin(ctx);
    const { id } = parse(idParam, req.params);
    const body = parse(statusUpdate, req.body);
    await db().transaction(async (trx) => {
      const status = (await scoped(trx, ctx, 'statuses').where({ id }).whereNull('removed_at').first()) as
        | StatusRow
        | undefined;
      if (!status) throw notFound();
      if (body.name === null && !status.system_key) throw badRequest();
      const category = body.category ?? status.category;
      const cancelTarget = body.isCancelTarget ?? Boolean(Number(status.is_cancel_target));
      if (cancelTarget && category !== 'cancelled') throw conflict();

      const update: Record<string, unknown> = {
        ...pickDefined(body, { name: 'name', rank: 'rank', color: 'color', category: 'category' }),
        updated_at: now(),
      };
      if (body.isNewDefault) {
        await scoped(trx, ctx, 'statuses').update({ is_new_default: 0 });
        update.is_new_default = 1;
      }
      if (body.isCancelTarget) {
        await scoped(trx, ctx, 'statuses').update({ is_cancel_target: 0 });
        update.is_cancel_target = 1;
      }
      await scoped(trx, ctx, 'statuses').where({ id }).update(update);
    });
    return reply.code(204).send();
  });

  app.post('/api/statuses/:id/remove', opts, async (req, reply) => {
    const ctx = getTenant(req);
    requireTenantAdmin(ctx);
    const { id } = parse(idParam, req.params);
    const { replacementId } = parse(z.object({ replacementId: z.string().min(1).max(64) }), req.body);
    await db().transaction(async (trx) => {
      const status = (await scoped(trx, ctx, 'statuses').where({ id }).whereNull('removed_at').first()) as
        | StatusRow
        | undefined;
      if (!status) throw notFound();
      if (Number(status.is_new_default) || Number(status.is_cancel_target)) throw conflict('in_use');
      const replacement = await scoped(trx, ctx, 'statuses').where({ id: replacementId }).whereNull('removed_at').first();
      if (!replacement || replacementId === id) throw badRequest();
      await reassignTodos(trx, ctx, 'status_id', 'status', id, replacementId);
      await scoped(trx, ctx, 'statuses').where({ id }).update({ removed_at: now(), is_new_default: 0, is_cancel_target: 0 });
    });
    return reply.code(204).send();
  });

  // ---------------- priorities ----------------
  app.get('/api/priorities', opts, async (req): Promise<PriorityDto[]> => {
    const ctx = getTenant(req);
    const rows = (await scoped(db(), ctx, 'priorities').whereNull('removed_at').orderBy([
      'rank',
      'created_at',
    ])) as PriorityRow[];
    return rows.map(toPriorityDto);
  });

  app.post('/api/priorities', opts, async (req, reply) => {
    const ctx = getTenant(req);
    requireTenantAdmin(ctx);
    const body = parse(priorityCreate, req.body);
    const id = randomUUID();
    const ts = now();
    await db()('priorities').insert({
      id,
      tenant_id: ctx.tenantId,
      system_key: null,
      ...pickDefined(body, priorityColumns),
      created_at: ts,
      updated_at: ts,
    });
    return reply.code(201).send({ id });
  });

  app.patch('/api/priorities/:id', opts, async (req, reply) => {
    const ctx = getTenant(req);
    requireTenantAdmin(ctx);
    const { id } = parse(idParam, req.params);
    const body = parse(priorityUpdate, req.body);
    const priority = (await scoped(db(), ctx, 'priorities').where({ id }).whereNull('removed_at').first()) as
      | PriorityRow
      | undefined;
    if (!priority) throw notFound();
    if (body.name === null && !priority.system_key) throw badRequest();
    await scoped(db(), ctx, 'priorities')
      .where({ id })
      .update({ ...pickDefined(body, priorityColumns), updated_at: now() });
    return reply.code(204).send();
  });

  app.post('/api/priorities/:id/remove', opts, async (req, reply) => {
    const ctx = getTenant(req);
    requireTenantAdmin(ctx);
    const { id } = parse(idParam, req.params);
    const { replacementId } = parse(z.object({ replacementId: optionalId }), req.body);
    await db().transaction(async (trx) => {
      const priority = await scoped(trx, ctx, 'priorities').where({ id }).whereNull('removed_at').first();
      if (!priority) throw notFound();
      if (replacementId !== null) {
        const replacement = await scoped(trx, ctx, 'priorities')
          .where({ id: replacementId })
          .whereNull('removed_at')
          .first();
        if (!replacement || replacementId === id) throw badRequest();
      }
      await reassignTodos(trx, ctx, 'priority_id', 'priority', id, replacementId);
      await scoped(trx, ctx, 'priorities').where({ id }).update({ removed_at: now() });
    });
    return reply.code(204).send();
  });

  // ---------------- tags ----------------
  app.get('/api/tags', opts, async (req): Promise<TagDto[]> => {
    const ctx = getTenant(req);
    const rows = (await scoped(db(), ctx, 'tags').orderBy('name').select('id', 'name', 'color')) as TagRow[];
    return rows.map(toTagDto);
  });

  app.patch('/api/tags/:id', opts, async (req, reply) => {
    const ctx = getTenant(req);
    requireTenantAdmin(ctx);
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ name: name.optional(), color: color.nullable().optional() }), req.body);
    const tag = await scoped(db(), ctx, 'tags').where({ id }).first();
    if (!tag) throw notFound();
    if (body.name) {
      const clash = await scoped(db(), ctx, 'tags').where({ name: body.name }).whereNot({ id }).first();
      if (clash) throw conflict();
    }
    await scoped(db(), ctx, 'tags').where({ id }).update(pickDefined(body, { name: 'name', color: 'color' }));
    return reply.code(204).send();
  });

  app.delete('/api/tags/:id', opts, async (req, reply) => {
    const ctx = getTenant(req);
    requireTenantAdmin(ctx);
    const { id } = parse(idParam, req.params);
    await db().transaction(async (trx) => {
      const tag = await scoped(trx, ctx, 'tags').where({ id }).first();
      if (!tag) throw notFound();
      await scoped(trx, ctx, 'todo_tags').where({ tag_id: id }).delete();
      await scoped(trx, ctx, 'tags').where({ id }).delete();
    });
    return reply.code(204).send();
  });

  // ---------------- members (for assignment, lanes, filters) ----------------
  app.get('/api/members', opts, async (req): Promise<MemberDto[]> => {
    const ctx = getTenant(req);
    return (await scoped(db(), ctx, 'memberships')
      .where({ is_active: 1 })
      .whereNotNull('accepted_at')
      .orderBy('display_name')
      .select('id', 'display_name as displayName')) as MemberDto[];
  });

  /** Members that can be assigned to To-Dos of a project (`none` = without project). */
  app.get('/api/members/assignable', opts, async (req): Promise<MemberDto[]> => {
    const ctx = getTenant(req);
    const { projectId } = parse(z.object({ projectId: z.string().min(1).max(64) }), req.query);
    const pid = projectId === 'none' ? null : projectId;
    if (pid !== null) {
      const project = await scoped(db(), ctx, 'projects').where({ id: pid }).first();
      if (!project) throw notFound();
    }
    const roles = await loadProjectRoles(db(), ctx);
    if (!effectiveRole(ctx, roles, pid)) throw notFound();

    const query = scoped(db(), ctx, 'memberships', 'm')
      .where({ 'm.is_active': 1 })
      .whereNotNull('m.accepted_at')
      .where((q) => {
        q.where('m.tenant_role', 'admin');
        if (pid === null) q.orWhereIn('m.default_role', ['editor', 'restricted']);
        else
          q.orWhereExists(
            db()('project_members as pm')
              .whereRaw('pm.membership_id = m.id')
              .where({ 'pm.project_id': pid, 'pm.tenant_id': ctx.tenantId })
              .whereIn('pm.role', ['editor', 'restricted']),
          );
      })
      .orderBy('m.display_name')
      .select('m.id', 'm.display_name as displayName');
    return (await query) as MemberDto[];
  });
}
