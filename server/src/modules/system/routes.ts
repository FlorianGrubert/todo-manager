import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LOCALES, type SystemTenant } from '@fg/shared';
import { inviteMember } from '../../auth/invitations.js';
import { seedTenantDefaults } from '../../db/defaults.js';
import { now } from '../../db/knex.js';
import { notFound } from '../../lib/errors.js';
import { fromBool, toBool } from '../../lib/flags.js';
import { parse } from '../../lib/validate.js';
import { getAuth, requireSystemAdmin } from '../../tenancy/context.js';

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
}
