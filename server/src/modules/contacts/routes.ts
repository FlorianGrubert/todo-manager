import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Knex } from 'knex';
import { z } from 'zod';
import { CONTACT_ROLE, type ContactDto } from '@fg/shared';
import { now } from '../../db/knex.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { toBool } from '../../lib/flags.js';
import { idParam } from '../../lib/http.js';
import { parse } from '../../lib/validate.js';
import { requireProjectManager } from '../../permissions/index.js';
import { getTenant, requireTenant, scoped } from '../../tenancy/context.js';
import type { TenantContext } from '../../types.js';
import { createPlaceholderUser } from './service.js';

interface ContactRow {
  id: string;
  display_name: string;
  is_active: number;
  invited: number | string;
}

const displayName = z.string().trim().min(1).max(200);

/**
 * Persons without login (contacts): tenant-wide records that can be linked to
 * projects and assigned to the To-Dos of those projects. Managed by tenant
 * administrators and project administrators.
 */
export function contactRoutes(app: FastifyInstance): void {
  const opts = { preHandler: requireTenant };
  const db = () => app.deps.db;

  const listContacts = async (trx: Knex, ctx: TenantContext, id?: string): Promise<ContactDto[]> => {
    const query = scoped(trx, ctx, 'memberships', 'm')
      .where({ 'm.kind': 'contact', 'm.pseudonymized': 0 })
      .orderBy('m.display_name')
      .select(
        'm.id',
        'm.display_name',
        'm.is_active',
        trx.raw(
          `(select count(*) from invitations i where i.membership_id = m.id and i.used_at is null and i.revoked_at is null) as invited`,
        ),
      );
    if (id) query.where('m.id', id);
    const rows = (await query) as ContactRow[];
    const links = (await scoped(trx, ctx, 'project_members')
      .where({ role: CONTACT_ROLE })
      .whereIn(
        'membership_id',
        rows.map((r) => r.id),
      )
      .select('membership_id', 'project_id')) as { membership_id: string; project_id: string }[];
    return rows.map((r) => ({
      id: r.id,
      displayName: r.display_name,
      isActive: toBool(r.is_active),
      invited: Number(r.invited) > 0,
      projectIds: links.filter((l) => l.membership_id === r.id).map((l) => l.project_id),
    }));
  };

  app.get('/api/contacts', opts, async (req): Promise<ContactDto[]> => {
    const ctx = getTenant(req);
    requireProjectManager(ctx);
    return listContacts(db(), ctx);
  });

  app.post('/api/contacts', opts, async (req, reply) => {
    const ctx = getTenant(req);
    requireProjectManager(ctx);
    const body = parse(
      z.object({ displayName, projectIds: z.array(z.string().min(1).max(64)).max(200).default([]) }),
      req.body,
    );
    const projectIds = [...new Set(body.projectIds)];
    const contact = await db().transaction(async (trx) => {
      if (projectIds.length) {
        const found = await scoped(trx, ctx, 'projects').whereIn('id', projectIds).select('id');
        if (found.length !== projectIds.length) throw badRequest();
      }
      const ts = now();
      const userId = await createPlaceholderUser(trx, 'contact', body.displayName, app.deps.config.DEFAULT_LOCALE, ts);
      const id = randomUUID();
      await trx('memberships').insert({
        id,
        tenant_id: ctx.tenantId,
        user_id: userId,
        display_name: body.displayName,
        tenant_role: 'member',
        default_role: 'none',
        kind: 'contact',
        is_active: 1,
        pseudonymized: 0,
        accepted_at: null,
        created_at: ts,
        updated_at: ts,
      });
      for (const projectId of projectIds) {
        await trx('project_members').insert({
          id: randomUUID(),
          tenant_id: ctx.tenantId,
          project_id: projectId,
          membership_id: id,
          role: CONTACT_ROLE,
          created_at: ts,
        });
      }
      return (await listContacts(trx, ctx, id))[0];
    });
    return reply.code(201).send(contact);
  });

  app.patch('/api/contacts/:id', opts, async (req, reply) => {
    const ctx = getTenant(req);
    requireProjectManager(ctx);
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ displayName: displayName.optional(), isActive: z.boolean().optional() }), req.body);
    await db().transaction(async (trx) => {
      const contact = (await scoped(trx, ctx, 'memberships').where({ id, kind: 'contact' }).first('pseudonymized')) as
        | { pseudonymized: number }
        | undefined;
      if (!contact) throw notFound();
      if (toBool(contact.pseudonymized)) throw conflict();
      const update: Record<string, unknown> = { updated_at: now() };
      if (body.displayName !== undefined) update.display_name = body.displayName;
      if (body.isActive !== undefined) update.is_active = body.isActive ? 1 : 0;
      await scoped(trx, ctx, 'memberships').where({ id }).update(update);
      if (body.isActive === false) {
        await scoped(trx, ctx, 'invitations').where({ membership_id: id }).whereNull('used_at').update({ revoked_at: now() });
      }
    });
    return reply.code(204).send();
  });
}
