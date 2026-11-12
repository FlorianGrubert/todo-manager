import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { TodoInput } from '@fg/shared';

/** A To-Do captured on the device that still has to be sent to the server. */
export interface OutboxEntry {
  /** Client-generated ID; the server uses it to create the To-Do only once. */
  clientId: string;
  /** `<userId>:<tenantId>` – entries are only synced for this user and tenant. */
  owner: string;
  tenantId: string;
  tenantName: string;
  input: TodoInput;
  createdAt: string;
  /** Error code when the server rejected the entry (it then needs user action). */
  error?: string;
}

interface CacheEntry {
  key: string;
  savedAt: string;
  data: unknown;
}

interface OfflineSchema extends DBSchema {
  outbox: { key: string; value: OutboxEntry; indexes: { byOwner: string } };
  cache: { key: string; value: CacheEntry };
}

const DB_NAME = 'fg-todo-manager';
let dbPromise: Promise<IDBPDatabase<OfflineSchema>> | undefined;

function db(): Promise<IDBPDatabase<OfflineSchema>> {
  dbPromise ??= openDB<OfflineSchema>(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore('outbox', { keyPath: 'clientId' }).createIndex('byOwner', 'owner');
      database.createObjectStore('cache', { keyPath: 'key' });
    },
  });
  return dbPromise;
}

export async function cachePut(key: string, data: unknown): Promise<void> {
  try {
    // Plain copy: reactive Vue proxies cannot be stored in IndexedDB (structured clone).
    const plain = JSON.parse(JSON.stringify(data)) as unknown;
    await (await db()).put('cache', { key, data: plain, savedAt: new Date().toISOString() });
  } catch {
    // storage unavailable (private mode) – the app still works online
  }
}

export async function cacheGet<T>(key: string): Promise<{ data: T; savedAt: string } | undefined> {
  try {
    const entry = await (await db()).get('cache', key);
    return entry ? { data: entry.data as T, savedAt: entry.savedAt } : undefined;
  } catch {
    return undefined;
  }
}

export async function outboxAdd(entry: OutboxEntry): Promise<void> {
  await (await db()).put('outbox', JSON.parse(JSON.stringify(entry)) as OutboxEntry);
}

export async function outboxList(owner?: string): Promise<OutboxEntry[]> {
  try {
    const database = await db();
    const entries = owner ? await database.getAllFromIndex('outbox', 'byOwner', owner) : await database.getAll('outbox');
    return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

export async function outboxPut(entry: OutboxEntry): Promise<void> {
  await (await db()).put('outbox', JSON.parse(JSON.stringify(entry)) as OutboxEntry);
}

export async function outboxRemove(clientId: string): Promise<void> {
  await (await db()).delete('outbox', clientId);
}

/** Removes all locally stored data (on logout – the device may be shared). */
export async function clearOfflineData(): Promise<void> {
  try {
    const database = await db();
    await database.clear('outbox');
    await database.clear('cache');
  } catch {
    // ignore
  }
}
