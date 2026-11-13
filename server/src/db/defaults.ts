import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import type { PriorityIconColor, PriorityIconDirection, PriorityIconKind, StatusCategory } from '@fg/shared';
import { now } from './knex.js';

interface DefaultStatus {
  key: string;
  rank: number;
  color: string;
  category: StatusCategory;
  isNewDefault?: boolean;
  isCancelTarget?: boolean;
}

/** Standard status set (§5). Names are shown through translation keys until renamed. */
export const DEFAULT_STATUSES: DefaultStatus[] = [
  { key: 'backlog', rank: 10, color: '#94a3b8', category: 'open', isNewDefault: true },
  { key: 'in_progress', rank: 20, color: '#3b82f6', category: 'open' },
  { key: 'under_review', rank: 30, color: '#a855f7', category: 'open' },
  { key: 'done', rank: 40, color: '#22c55e', category: 'done' },
  { key: 'rejected', rank: 50, color: '#ef4444', category: 'cancelled', isCancelTarget: true },
  { key: 'deleted', rank: 60, color: '#475569', category: 'cancelled' },
];

interface DefaultPriority {
  key: string;
  rank: number;
  kind: PriorityIconKind;
  arrows: number;
  direction: PriorityIconDirection;
  color: PriorityIconColor;
}

/** Standard priorities (§12): rank 1 = highest. */
export const DEFAULT_PRIORITIES: DefaultPriority[] = [
  { key: 'critical', rank: 1, kind: 'exclamation', arrows: 1, direction: 'up', color: 'red' },
  { key: 'high', rank: 2, kind: 'arrows', arrows: 2, direction: 'up', color: 'red' },
  { key: 'medium', rank: 3, kind: 'arrows', arrows: 1, direction: 'up', color: 'yellow' },
  { key: 'low', rank: 4, kind: 'arrows', arrows: 1, direction: 'down', color: 'green' },
];

/** Seeds standard statuses and priorities for a new tenant. */
export async function seedTenantDefaults(trx: Knex, tenantId: string): Promise<void> {
  const ts = now();
  await trx('statuses').insert(
    DEFAULT_STATUSES.map((s) => ({
      id: randomUUID(),
      tenant_id: tenantId,
      system_key: s.key,
      name: null,
      rank: s.rank,
      color: s.color,
      category: s.category,
      is_new_default: s.isNewDefault ? 1 : 0,
      is_cancel_target: s.isCancelTarget ? 1 : 0,
      created_at: ts,
      updated_at: ts,
    })),
  );
  await trx('priorities').insert(
    DEFAULT_PRIORITIES.map((p) => ({
      id: randomUUID(),
      tenant_id: tenantId,
      system_key: p.key,
      name: null,
      rank: p.rank,
      icon_kind: p.kind,
      icon_arrows: p.arrows,
      icon_direction: p.direction,
      icon_color: p.color,
      created_at: ts,
      updated_at: ts,
    })),
  );
}
