import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LOCALES, type SystemTenant } from '@fg/shared';
import { inviteMember } from '../../auth/invitations.js';
import { seedTenantDefaults } from '../../db/defaults.js';
import { now } from '../../db/knex.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { fromBool, toBool } from '../../lib/flags.js';
import { parse } from '../../lib/validate.js';
import { getAuth, requireSystemAdmin } from '../../tenancy/context.js';
import { exportTenant, importTenant } from './transfer.js';

const idParam = z.object({ id: z.string().max(64) });

/** System administration (above all tenants): create and manage tenants (§11). */
export function systemRoutes(app: FastifyInstance): void {
  const opts = { preHandler: requireSystemAdmin };

  app.get('/api/system/tenants', opts, async (): Promise<SystemTenant[]> => {
    const { db } = app.deps;
    const rows = (await db('tenants as t')
      .leftJoin('memberships as m', function () {
        this.on('m.tenant_id', '=', 't.id').andOn('m.is_active', '=', db.raw('?', [1]));
      })
      .groupBy('t.id', 't.name', 't.is_active', 't.created_at')
      .orderBy('t.name')
      .select('t.id', 't.name', 't.is_active', 't.created_at')
      .count({ member_count: 'm.id' })) as {
      id: string;
      name: string;
      is_active: number;
      created_at: string;
      member_count: number | string;
    }[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      isActive: toBool(r.is_active),
      memberCount: Number(r.member_count),
      createdAt: r.created_at,
    }));
  });

  app.post('/api/system/tenants', opts, async (req, reply) => {
    const auth = getAuth(req);
    const body = parse(
      z.object({
        name: z.string().trim().min(1).max(200),
        adminEmail: z.string().trim().max(320).email(),
        adminName: z.string().trim().min(1).max(200),
        locale: z.enum(LOCALES).default(app.deps.config.DEFAULT_LOCALE),
      }),
      req.body,
    );
    const { db } = app.deps;
    const tenantId = randomUUID();
    const ts = now();
    await db.transaction(async (trx) => {
      await trx('tenants').insert({ id: tenantId, name: body.name, is_active: 1, created_at: ts, updated_at: ts });
      await seedTenantDefaults(trx, tenantId);
    });
    await inviteMember(app.deps, {
      tenantId,
      email: body.adminEmail,
      displayName: body.adminName,
      tenantRole: 'admin',
      defaultRole: 'editor',
      invitedByUserId: auth.userId,
      locale: body.locale,
    });
    return reply.code(201).send({ id: tenantId });
  });

  app.patch('/api/system/tenants/:id', opts, async (req, reply) => {
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.object({ name: z.string().trim().min(1).max(200).optional(), isActive: z.boolean().optional() }),
      req.body,
    );
    const update: Record<string, unknown> = { updated_at: now() };
    if (body.name !== undefined) update.name = body.name;
    if (body.isActive !== undefined) update.is_active = fromBool(body.isActive);
    const count = await app.deps.db('tenants').where({ id }).update(update);
    if (count !== 1) throw notFound();
    return reply.code(204).send();
  });

  // ---------------- export / import of a tenant ----------------
  const importLimit = () => app.deps.config.IMPORT_MAX_MB * 1024 * 1024;

  app.get('/api/system/tenants/:id/export', opts, async (req, reply) => {
    const { id } = parse(idParam, req.params);
    const data = await exportTenant(app.deps.db, id, app.deps.config.version);
    const safeName = data.tenant.name.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'tenant';
    reply.header('content-disposition', `attachment; filename="${encodeURIComponent(safeName)}-${data.exportedAt.slice(0, 10)}.json"`);
    reply.header('cache-control', 'no-store');
    return data;
  });

  /** Imports an export as a new tenant (all IDs are re-generated). */
  app.post('/api/system/tenants/import', { ...opts, bodyLimit: importLimit() }, async (req, reply) => {
    const body = parse(z.object({ name: z.string().trim().max(200).optional(), data: z.unknown() }), req.body);
    const { tenantId } = await importTenant(app.deps.db, body.data, { name: body.name });
    return reply.code(201).send({ id: tenantId });
  });

  /** Replaces an existing tenant by an export. Requires the exact tenant name as confirmation. */
  app.post('/api/system/tenants/:id/replace', { ...opts, bodyLimit: importLimit() }, async (req, reply) => {
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ confirmName: z.string().max(200), data: z.unknown() }), req.body);
    const tenant = (await app.deps.db('tenants').where({ id }).first('name')) as { name: string } | undefined;
    if (!tenant) throw notFound();
    if (body.confirmName !== tenant.name) throw badRequest();
    await importTenant(app.deps.db, body.data, { replaceTenantId: id });
    return reply.code(204).send();
  });
}
