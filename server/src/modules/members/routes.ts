import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Knex } from 'knex';
import { z } from 'zod';
import { DEFAULT_ROLES, LOCALES, TENANT_ROLES, type AdminMemberDto, type DefaultRole, type TenantRole } from '@fg/shared';
import { inviteMember } from '../../auth/invitations.js';
import { now } from '../../db/knex.js';
import { conflict, notFound } from '../../lib/errors.js';
import { toBool } from '../../lib/flags.js';
import { idParam } from '../../lib/http.js';
import { parse } from '../../lib/validate.js';
import { requireTenantAdmin } from '../../permissions/index.js';
import { getTenant, requireTenant, scoped } from '../../tenancy/context.js';
import type { TenantContext } from '../../types.js';

interface MemberRow {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  locale: 'de' | 'en';
  tenant_role: TenantRole;
  default_role: DefaultRole;
  is_active: number;
  pseudonymized: number;
  accepted_at: string | null;
  last_login_at: string | null;
}

const memberSelect = [
  'm.id',
  'm.user_id',
  'm.display_name',
  'u.email',
  'u.locale',
  'm.tenant_role',
  'm.default_role',
  'm.is_active',
  'm.pseudonymized',
  'm.accepted_at',
  'm.last_login_at',
];

const toDto = (r: MemberRow): AdminMemberDto => ({
  id: r.id,
  displayName: r.display_name,
  email: toBool(r.pseudonymized) ? null : r.email,
  tenantRole: r.tenant_role,
  defaultRole: r.default_role,
  isActive: toBool(r.is_active),
  pseudonymized: toBool(r.pseudonymized),
  pending: r.accepted_at === null,
  lastLoginAt: r.last_login_at,
});

/**
 * Ensures the tenant keeps at least one active administrator (§11) when the
 * given membership loses admin status or is deactivated.
 */
async function assertNotLastAdmin(trx: Knex, ctx: TenantContext, member: MemberRow): Promise<void> {
  if (member.tenant_role !== 'admin' || !toBool(member.is_active) || member.accepted_at === null) return;
  const row = (await scoped(trx, ctx, 'memberships')
    .where({ tenant_role: 'admin', is_active: 1 })
    .whereNotNull('accepted_at')
    .whereNot({ id: member.id })
    .count({ c: '*' })
    .first()) as { c: number | string } | undefined;
  if (Number(row?.c ?? 0) === 0) throw conflict('last_admin');
}

/** Tenant administration of members: invite, roles, deactivate, pseudonymize (§8). */
export function memberRoutes(app: FastifyInstance): void {
  const opts = { preHandler: requireTenant };
  const db = () => app.deps.db;

  const findMember = async (trx: Knex, ctx: TenantContext, id: string): Promise<MemberRow> => {
    const row = (await scoped(trx, ctx, 'memberships', 'm')
      .join('users as u', 'u.id', 'm.user_id')
      .where({ 'm.id': id })
      .first(memberSelect)) as MemberRow | undefined;
    if (!row) throw notFound();
    return row;
  };

  app.get('/api/admin/members', opts, async (req): Promise<AdminMemberDto[]> => {
    const ctx = getTenant(req);
    requireTenantAdmin(ctx);
    const rows = (await scoped(db(), ctx, 'memberships', 'm')
      .join('users as u', 'u.id', 'm.user_id')
      .orderBy('m.display_name')
      .select(memberSelect)) as MemberRow[];
    return rows.map(toDto);
  });

  // Identical response whether or not the e-mail address is known elsewhere.
  app.post('/api/admin/members', { ...opts, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const ctx = getTenant(req);
    requireTenantAdmin(ctx);
    const body = parse(
      z.object({
        email: z.string().trim().max(320).email(),
        displayName: z.string().trim().min(1).max(200),
        tenantRole: z.enum(TENANT_ROLES).default('member'),
        defaultRole: z.enum(DEFAULT_ROLES).default('none'),
        locale: z.enum(LOCALES).default(app.deps.config.DEFAULT_LOCALE),
      }),
      req.body,
    );
    const { membershipId } = await inviteMember(app.deps, {
      tenantId: ctx.tenantId,
      email: body.email,
      displayName: body.displayName,
      tenantRole: body.tenantRole,
      defaultRole: body.defaultRole,
      invitedByUserId: ctx.userId,
      locale: body.locale,
    });
    return reply.code(201).send({ id: membershipId });
  });

  app.post('/api/admin/members/:id/resend', opts, async (req, reply) => {
    const ctx = getTenant(req);
    requireTenantAdmin(ctx);
    const { id } = parse(idParam, req.params);
    const member = await findMember(db(), ctx, id);
    if (member.accepted_at !== null || toBool(member.pseudonymized)) throw conflict();
    await inviteMember(app.deps, {
      tenantId: ctx.tenantId,
      email: member.email,
      displayName: member.display_name,
      tenantRole: member.tenant_role,
      defaultRole: member.default_role,
      invitedByUserId: ctx.userId,
      locale: member.locale,
    });
    return reply.code(204).send();
  });

  app.patch('/api/admin/members/:id', opts, async (req, reply) => {
    const ctx = getTenant(req);
    requireTenantAdmin(ctx);
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.object({
        displayName: z.string().trim().min(1).max(200).optional(),
        tenantRole: z.enum(TENANT_ROLES).optional(),
        defaultRole: z.enum(DEFAULT_ROLES).optional(),
        isActive: z.boolean().optional(),
      }),
      req.body,
    );
    await db().transaction(async (trx) => {
      const member = await findMember(trx, ctx, id);
      if (toBool(member.pseudonymized)) throw conflict();
      const demoted = body.tenantRole !== undefined && body.tenantRole !== 'admin';
      if (demoted || body.isActive === false) await assertNotLastAdmin(trx, ctx, member);
      const update: Record<string, unknown> = { updated_at: now() };
      if (body.displayName !== undefined) update.display_name = body.displayName;
      if (body.tenantRole !== undefined) update.tenant_role = body.tenantRole;
      if (body.defaultRole !== undefined) update.default_role = body.defaultRole;
      if (body.isActive !== undefined) update.is_active = body.isActive ? 1 : 0;
      await scoped(trx, ctx, 'memberships').where({ id }).update(update);
      if (body.isActive === false) {
        await scoped(trx, ctx, 'invitations').where({ membership_id: id }).whereNull('used_at').update({ revoked_at: now() });
      }
    });
    return reply.code(204).send();
  });

  /**
   * Pseudonymizes a member in this tenant: name and e-mail are no longer shown,
   * references in To-Dos, comments and history remain. Only this tenant's
   * membership is changed; the account itself is anonymised only when it has no
   * membership in any other tenant.
   */
  app.post('/api/admin/members/:id/pseudonymize', opts, async (req): Promise<AdminMemberDto> => {
    const ctx = getTenant(req);
    requireTenantAdmin(ctx);
    const { id } = parse(idParam, req.params);
    return db().transaction(async (trx) => {
      const member = await findMember(trx, ctx, id);
      if (toBool(member.pseudonymized)) throw conflict();
      await assertNotLastAdmin(trx, ctx, member);
      const pseudonym = `Pseudonym ${randomBytes(3).toString('hex').toUpperCase()}`;
      const ts = now();
      await scoped(trx, ctx, 'memberships')
        .where({ id })
        .update({ display_name: pseudonym, pseudonymized: 1, is_active: 0, updated_at: ts });
      await scoped(trx, ctx, 'invitations').where({ membership_id: id }).whereNull('used_at').update({ revoked_at: ts });
      await scoped(trx, ctx, 'saved_filters').where({ membership_id: id }).delete();

      const other = await trx('memberships').where({ user_id: member.user_id }).whereNot({ tenant_id: ctx.tenantId }).first('id');
      // System administrators keep their account (they manage the whole installation).
      const sysAdmin = await trx('users').where({ id: member.user_id, is_system_admin: 1 }).first('id');
      if (!other && !sysAdmin) {
        await trx('users')
          .where({ id: member.user_id })
          .update({
            email: `pseudonym-${randomUUID()}@invalid.invalid`,
            name: pseudonym,
            password_hash: null,
            is_active: 0,
            updated_at: ts,
          });
        await trx('sessions').where({ user_id: member.user_id }).delete();
        await trx('password_resets').where({ user_id: member.user_id }).whereNull('used_at').update({ used_at: ts });
      }
      return toDto(await findMember(trx, ctx, id));
    });
  });
}
