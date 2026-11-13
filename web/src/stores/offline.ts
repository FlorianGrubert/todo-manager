import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { TodoInput } from '@fg/shared';
import { get, onReachability } from '../api/client';
import { cacheGet, cachePut, clearOfflineData, outboxList, outboxRemove, type OutboxEntry } from '../offline/db';
import { enqueue, ownerKey, retryEntry, syncOutbox } from '../offline/sync';
import { useSessionStore } from './session';

const SYNC_INTERVAL_MS = 30_000;
const PROBE_INTERVAL_MS = 15_000;

/**
 * Offline capability (§5): connectivity state, the outbox of To-Dos captured
 * offline (synced automatically) and the read-only cache of the last data.
 */
export const useOfflineStore = defineStore('offline', () => {
  const browserOnline = ref(typeof navigator === 'undefined' ? true : navigator.onLine);
  const serverReachable = ref(true);
  const entries = ref<OutboxEntry[]>([]);
  const syncing = ref(false);
  let started = false;

  const online = computed(() => browserOnline.value && serverReachable.value);
  const pending = computed(() => entries.value.filter((e) => !e.error));
  const failed = computed(() => entries.value.filter((e) => e.error));

  function owner(): string | null {
    const session = useSessionStore();
    return session.user && session.activeTenant ? ownerKey(session.user.id, session.activeTenant.id) : null;
  }

  /** Cache key per user and tenant, so other accounts on the device never see the data. */
  function cacheKey(name: string): string | null {
    const key = owner();
    return key ? `${key}:${name}` : null;
  }

  async function refresh(): Promise<void> {
    entries.value = await outboxList();
  }

  async function sync(): Promise<void> {
    const session = useSessionStore();
    if (syncing.value || !online.value || !session.user || !session.activeTenant) return;
    syncing.value = true;
    try {
      // After being offline the CSRF token may be missing – reload the session first.
      if (!session.me?.csrfToken) await session.load();
      if (!session.user || !session.activeTenant) return;
      await syncOutbox(session.user.id, session.activeTenant.id);
    } finally {
      syncing.value = false;
      await refresh();
    }
  }

  async function capture(input: TodoInput): Promise<'synced' | 'queued'> {
    const session = useSessionStore();
    if (!session.user || !session.activeTenant) throw new Error('no tenant');
    const entry = await enqueue(session.user.id, session.activeTenant.id, session.activeTenant.name, input);
    await refresh();
    await sync();
    return entries.value.some((e) => e.clientId === entry.clientId) ? 'queued' : 'synced';
  }

  async function discard(entry: OutboxEntry): Promise<void> {
    await outboxRemove(entry.clientId);
    await refresh();
  }

  async function retry(entry: OutboxEntry): Promise<void> {
    await retryEntry(entry);
    await refresh();
    await sync();
  }

  async function saveCache(name: string, data: unknown): Promise<void> {
    const key = cacheKey(name);
    if (key) await cachePut(key, data);
  }

  async function readCache<T>(name: string): Promise<{ data: T; savedAt: string } | undefined> {
    const key = cacheKey(name);
    return key ? cacheGet<T>(key) : undefined;
  }

  async function clearAll(): Promise<void> {
    await clearOfflineData();
    entries.value = [];
  }

  /** Starts listening for connectivity changes and the periodic sync (once per app). */
  function start(): void {
    if (started || typeof window === 'undefined') return;
    started = true;
    onReachability((reachable) => {
      const wasOnline = online.value;
      serverReachable.value = reachable;
      if (!wasOnline && online.value) void sync();
    });
    window.addEventListener('online', () => {
      browserOnline.value = true;
      void probe();
    });
    window.addEventListener('offline', () => {
      browserOnline.value = false;
    });
    setInterval(() => void sync(), SYNC_INTERVAL_MS);
    // While the server is unreachable, check regularly whether it is back.
    setInterval(() => {
      if (browserOnline.value && !serverReachable.value) void probe();
    }, PROBE_INTERVAL_MS);
    void refresh();
  }

  async function probe(): Promise<void> {
    try {
      await get('/api/health');
      await sync();
    } catch {
      // still offline
    }
  }

  return { online, entries, pending, failed, syncing, start, sync, capture, discard, retry, refresh, saveCache, readCache, clearAll };
});
