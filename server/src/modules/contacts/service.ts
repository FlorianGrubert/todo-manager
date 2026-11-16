import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import type { Locale } from '@fg/shared';

/** E-mail domain of placeholder accounts (reserved TLD, can never receive mail). */
export const PLACEHOLDER_DOMAIN = '@invalid.invalid';

/**
 * Creates an inactive account without password and with a unique, invalid
 * e-mail address. Used for persons without login (`contact-…`) and for
 * imported pseudonymized persons (`pseudonym-…`); such accounts can never log in.
 */
export async function createPlaceholderUser(
  trx: Knex,
  prefix: 'contact' | 'pseudonym',
  name: string,
  locale: Locale,
  ts: string,
): Promise<string> {
  const id = randomUUID();
  await trx('users').insert({
    id,
    email: `${prefix}-${randomUUID()}${PLACEHOLDER_DOMAIN}`,
    name,
    locale,
    password_hash: null,
    is_active: 0,
    created_at: ts,
    updated_at: ts,
  });
  return id;
}
