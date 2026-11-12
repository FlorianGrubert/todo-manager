import { randomUUID } from 'node:crypto';
import { INVITATION_VALID_DAYS, type DefaultRole, type Locale, type TenantRole } from '@fg/shared';
import { now } from '../db/knex.js';
import { conflict } from '../lib/errors.js';
import { randomToken, sha256 } from '../lib/tokens.js';
import { composeMail } from '../mail/mailer.js';
import type { AppDeps } from '../types.js';
import { normalizeEmail, type UserRow } from './service.js';

export interface InviteInput {
  tenantId: string;
  email: string;
  displayName: string;
  tenantRole: TenantRole;
  defaultRole: DefaultRole;
  invitedByUserId: string | null;
  /** Language of the invitation mail for persons without account. */
  locale: Locale;
}

/**
 * Invites a person into a tenant.
 *
 * The behaviour visible to the inviting administrator is identical whether the
 * e-mail address already has an account (in another tenant) or not: in both cases
 * a pending membership is created and a mail is sent. Internally an existing
 * account is reused, so the person accepts with the existing login (§8).
 */
export async function inviteMember(deps: AppDeps, input: InviteInput): Promise<{ membershipId: string }> {
  const { db, config, mailer } = deps;
  const email = normalizeEmail(input.email);
  const token = randomToken();
  const ts = now();
  const expiresAt = new Date(Date.now() + INVITATION_VALID_DAYS * 86400_000).toISOString();

  const result = await db.transaction(async (trx) => {
    let user = (await trx('users').where({ email }).first()) as UserRow | undefined;
    if (!user) {
      const id = randomUUID();
      await trx('users').insert({
        id,
        email,
        password_hash: null,
        name: input.displayName,
        locale: input.locale,
        created_at: ts,
        updated_at: ts,
      });
      user = (await trx('users').where({ id }).first()) as UserRow;
    }

    const existing = (await trx('memberships').where({ tenant_id: input.tenantId, user_id: user.id }).first()) as
      | { id: string; accepted_at: string | null }
      | undefined;
    let membershipId: string;
    if (existing?.accepted_at) {
      throw conflict('already_member');
    } else if (existing) {
      membershipId = existing.id;
      await trx('memberships').where({ id: membershipId }).update({
        display_name: input.displayName,
        tenant_role: input.tenantRole,
        default_role: input.defaultRole,
        is_active: 1,
        updated_at: ts,
      });
      await trx('invitations').where({ membership_id: membershipId }).whereNull('used_at').update({ revoked_at: ts });
    } else {
      membershipId = randomUUID();
      await trx('memberships').insert({
        id: membershipId,
        tenant_id: input.tenantId,
        user_id: user.id,
        display_name: input.displayName,
        tenant_role: input.tenantRole,
        default_role: input.defaultRole,
        is_active: 1,
        pseudonymized: 0,
        accepted_at: null,
        created_at: ts,
        updated_at: ts,
      });
    }

    await trx('invitations').insert({
      id: randomUUID(),
      tenant_id: input.tenantId,
      membership_id: membershipId,
      token_hash: sha256(token),
      expires_at: expiresAt,
      created_by_user_id: input.invitedByUserId,
      created_at: ts,
    });
    const tenant = (await trx('tenants').where({ id: input.tenantId }).first()) as { name: string };
    return { membershipId, user, tenantName: tenant.name };
  });

  const hasAccount = Boolean(result.user.password_hash);
  const locale = hasAccount ? result.user.locale : input.locale;
  await mailer.send(
    composeMail(locale, hasAccount ? 'inviteExisting' : 'inviteNew', email, hasAccount ? result.user.name : input.displayName, {
      tenant: result.tenantName,
      link: `${config.BASE_URL}/invite/${token}`,
      days: INVITATION_VALID_DAYS,
    }),
  );
  return { membershipId: result.membershipId };
}

export interface OpenInvitation {
  id: string;
  tenantId: string;
  tenantName: string;
  membershipId: string;
  user: UserRow;
}

/** Finds a valid (unused, not revoked, not expired) invitation for a token. */
export async function findOpenInvitation(deps: AppDeps, token: string): Promise<OpenInvitation | undefined> {
  const { db } = deps;
  const row = (await db('invitations as i')
    .join('memberships as m', 'm.id', 'i.membership_id')
    .join('tenants as t', 't.id', 'i.tenant_id')
    .where({ 'i.token_hash': sha256(token), 't.is_active': 1, 'm.is_active': 1 })
    .whereNull('i.used_at')
    .whereNull('i.revoked_at')
    .where('i.expires_at', '>', now())
    .first('i.id', 'i.tenant_id', 't.name as tenant_name', 'm.id as membership_id', 'm.user_id')) as
    | { id: string; tenant_id: string; tenant_name: string; membership_id: string; user_id: string }
    | undefined;
  if (!row) return undefined;
  const user = (await db('users').where({ id: row.user_id }).first()) as UserRow | undefined;
  if (!user) return undefined;
  return { id: row.id, tenantId: row.tenant_id, tenantName: row.tenant_name, membershipId: row.membership_id, user };
}
