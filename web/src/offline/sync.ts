import type { TodoInput } from '@fg/shared';
import { ApiError, api } from '../api/client';
import { outboxAdd, outboxList, outboxPut, outboxRemove, type OutboxEntry } from './db';

export const ownerKey = (userId: string, tenantId: string) => `${userId}:${tenantId}`;

export function newClientId(): string {
  return crypto.randomUUID();
}

export async function enqueue(userId: string, tenantId: string, tenantName: string, input: TodoInput): Promise<OutboxEntry> {
  const entry: OutboxEntry = {
    clientId: newClientId(),
    owner: ownerKey(userId, tenantId),
    tenantId,
    tenantName,
    input,
    createdAt: new Date().toISOString(),
  };
  await outboxAdd(entry);
  return entry;
}

export interface SyncResult {
  synced: number;
  failed: number;
  /** true when the server could not be reached (try again later). */
  unreachable: boolean;
}

type Sender = (entry: OutboxEntry) => Promise<unknown>;

const defaultSender: Sender = (entry) =>
  api('POST', '/api/todos', { ...entry.input, clientId: entry.clientId }, { 'x-expect-tenant': entry.tenantId });

/**
 * Sends the outbox entries of the active user and tenant to the server.
 * The server creates each To-Do only once (clientId), so retries are safe.
 */
export async function syncOutbox(userId: string, tenantId: string, send: Sender = defaultSender): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, unreachable: false };
  for (const entry of await outboxList(ownerKey(userId, tenantId))) {
    if (entry.error) continue; // rejected entries wait for the user
    try {
      await send(entry);
      await outboxRemove(entry.clientId);
      result.synced++;
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      const code = err instanceof ApiError ? err.code : 'network';
      // Not reachable, signed out, server error or tenant switched meanwhile: retry later.
      if (status === 0 || status === 401 || status >= 500 || code === 'tenant_mismatch' || code === 'csrf') {
        result.unreachable = status === 0 || status >= 500;
        break;
      }
      await outboxPut({ ...entry, error: code });
      result.failed++;
    }
  }
  return result;
}

/** Puts a rejected entry back into the queue (e.g. after the user fixed access rights). */
export async function retryEntry(entry: OutboxEntry): Promise<void> {
  const { error: _error, ...rest } = entry;
  await outboxPut(rest);
}
