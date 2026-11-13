import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import type { HistoryField } from '@fg/shared';
import { now } from '../../db/knex.js';
import type { TenantContext } from '../../types.js';

export interface HistoryChange {
  field: HistoryField;
  oldValue: string | null;
  newValue: string | null;
}

/** Writes change history entries (who changed which field from which to which value). */
export async function recordHistory(
  trx: Knex,
  ctx: Pick<TenantContext, 'tenantId' | 'membershipId'>,
  todoId: string,
  changes: HistoryChange[],
  at: string = now(),
): Promise<void> {
  if (changes.length === 0) return;
  await trx('todo_history').insert(
    changes.map((c) => ({
      id: randomUUID(),
      tenant_id: ctx.tenantId,
      todo_id: todoId,
      changed_by: ctx.membershipId,
      changed_at: at,
      field: c.field,
      old_value: c.oldValue,
      new_value: c.newValue,
    })),
  );
}

/**
 * Replaces a status/priority on all To-Dos of the tenant (used when an
 * administrator removes one) and records the change in each To-Do's history.
 */
export async function reassignTodos(
  trx: Knex,
  ctx: TenantContext,
  column: 'status_id' | 'priority_id',
  field: HistoryField,
  fromId: string,
  toId: string | null,
): Promise<void> {
  const todos = (await trx('todos').where({ tenant_id: ctx.tenantId, [column]: fromId }).select('id')) as { id: string }[];
  if (todos.length === 0) return;
  const ts = now();
  await trx('todos')
    .where({ tenant_id: ctx.tenantId, [column]: fromId })
    .update({ [column]: toId, updated_at: ts, updated_by: ctx.membershipId });
  for (const todo of todos) {
    await recordHistory(trx, ctx, todo.id, [{ field, oldValue: fromId, newValue: toId }], ts);
  }
}
