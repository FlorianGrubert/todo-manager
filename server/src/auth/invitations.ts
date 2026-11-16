import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { INVITATION_VALID_DAYS, type DefaultRole, type Locale, type TenantRole } from '@fg/shared';
import { now } from '../db/knex.js';
import { conflict, notFound } from '../lib/errors.js';
import { randomToken, sha256 } from '../lib/tokens.js';
import { composeMail } from '../mail/mailer.js';
import { PLACEHOLDER_DOMAIN } from '../modules/contacts/service.js';
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

interface PreparedInvitation {
  membershipId: string;
  user: UserRow;
  tenantName: string;
  token: string;
}

/** Revokes open invitations of the membership and creates a new one (inside the transaction). */
async function createInvitation(
  trx: Knex,
  tenantId: string,
  membershipId: string,
  invitedByUserId: string | null,
  ts: string,
): Promise<{ token: string; tenantName: string }> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + INVITATION_VALID_DAYS * 86400_000).toISOString();
  await trx('invitations').where({ membership_id: membershipId }).whereNull('used_at').update({ revoked_at: ts });
  await trx('invitations').insert({
    id: randomUUID(),
    tenant_id: tenantId,
    membership_id: membershipId,
    token_hash: sha256(token),
    expires_at: expiresAt,
    created_by_user_id: invitedByUserId,
    created_at: ts,
  });
  const tenant = (await trx('tenants').where({ id: tenantId }).first()) as { name: string };
  return { token, tenantName: tenant.name };
}

/** Sends the invitation mail (new account or existing login). */
async function sendInvitationMail(deps: AppDeps, prepared: PreparedInvitation, displayName: string, locale: Locale) {
  const hasAccount = Boolean(prepared.user.password_hash);
  await deps.mailer.send(
    composeMail(
      hasAccount ? prepared.user.locale : locale,
      hasAccount ? 'inviteExisting' : 'inviteNew',
      prepared.user.email,
      hasAccount ? prepared.user.name : displayName,
      {
        tenant: prepared.tenantName,
        link: `${deps.config.BASE_URL}/invite/${prepared.token}`,
        days: INVITATION_VALID_DAYS,
      },
    ),
  );
}

/**
 * Finds the account for an e-mail address or creates one without password.
 * An account may already exist from another tenant; this is never revealed.
 */
async function findOrCreateUser(trx: Knex, email: string, name: string, locale: Locale, ts: string): Promise<UserRow> {
  const user = (await trx('users').where({ email }).first()) as UserRow | undefined;
  if (user) return user;
  const id = randomUUID();
  await trx('users').insert({ id, email, password_hash: null, name, locale, created_at: ts, updated_at: ts });
  return (await trx('users').where({ id }).first()) as UserRow;
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
  const email = normalizeEmail(input.email);
  const ts = now();

  const prepared = await deps.db.transaction(async (trx): Promise<PreparedInvitation> => {
    const user = await findOrCreateUser(trx, email, input.displayName, input.locale, ts);
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
    const { token, tenantName } = await createInvitation(trx, input.tenantId, membershipId, input.invitedByUserId, ts);
    return { membershipId, user, tenantName, token };
  });

  await sendInvitationMail(deps, prepared, input.displayName, input.locale);
  return { membershipId: prepared.membershipId };
}

export interface ConvertContactInput extends Omit<InviteInput, 'displayName'> {
  membershipId: string;
}

/**
 * Invites a person without login to become a user. The membership (and thus
 * every To-Do assignment, history entry and filter) is kept; only the login is
 * attached. The membership stays a contact until the invitation is accepted.
 * As with {@link inviteMember}, the administrator cannot tell whether the
 * e-mail address already has an account in another tenant.
 */
export async function convertContact(deps: AppDeps, input: ConvertContactInput): Promise<void> {
  const email = normalizeEmail(input.email);
  const ts = now();

  const prepared = await deps.db.transaction(async (trx): Promise<PreparedInvitation & { displayName: string }> => {
    const contact = (await trx('memberships')
      .where({ id: input.membershipId, tenant_id: input.tenantId, kind: 'contact', is_active: 1, pseudonymized: 0 })
      .first('id', 'user_id', 'display_name')) as { id: string; user_id: string; display_name: string } | undefined;
    if (!contact) throw notFound();

    let user = (await trx('users').where({ email }).first()) as UserRow | undefined;
    if (user && user.id !== contact.user_id) {
      const other = await trx('memberships').where({ tenant_id: input.tenantId, user_id: user.id }).first('id');
      if (other) throw conflict('already_member');
    }
    if (!user) {
      // Turn the placeholder account into a real (password-less) account.
      await trx('users')
        .where({ id: contact.user_id })
        .update({ email, name: contact.display_name, locale: input.locale, is_active: 1, updated_at: ts });
      user = (await trx('users').where({ id: contact.user_id }).first()) as UserRow;
    }
    if (user.id !== contact.user_id) {
      // An existing account (from another tenant) is used instead. The previous account of the
      // person is retired if it was only created for this person (e.g. an earlier, mistyped e-mail).
      const previous = (await trx('users').where({ id: contact.user_id }).first('password_hash')) as
        | { password_hash: string | null }
        | undefined;
      const shared = await trx('memberships').where({ user_id: contact.user_id }).whereNot({ id: contact.id }).first('id');
      if (previous && !previous.password_hash && !shared) {
        await trx('users')
          .where({ id: contact.user_id })
          .update({ email: `contact-${randomUUID()}${PLACEHOLDER_DOMAIN}`, is_active: 0, updated_at: ts });
      }
    }
    await trx('memberships').where({ id: contact.id }).update({
      user_id: user.id,
      tenant_role: input.tenantRole,
      default_role: input.defaultRole,
      updated_at: ts,
    });
    const { token, tenantName } = await createInvitation(trx, input.tenantId, contact.id, input.invitedByUserId, ts);
    return { membershipId: contact.id, user, tenantName, token, displayName: contact.display_name };
  });

  await sendInvitationMail(deps, prepared, prepared.displayName, input.locale);
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
