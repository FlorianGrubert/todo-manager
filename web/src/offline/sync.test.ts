import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { ApiError } from '../api/client';
import { cacheGet, cachePut, clearOfflineData, outboxList } from './db';
import { enqueue, ownerKey, retryEntry, syncOutbox } from './sync';

describe('offline outbox', () => {
  beforeEach(async () => {
    await clearOfflineData();
  });

  it('sends queued To-Dos once and removes them', async () => {
    await enqueue('u1', 't1', 'Acme', { title: 'first' });
    await enqueue('u1', 't1', 'Acme', { title: 'second' });
    const send = vi.fn().mockResolvedValue({});
    expect(await syncOutbox('u1', 't1', send)).toEqual({ synced: 2, failed: 0, unreachable: false });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([entry]) => entry.input.title)).toEqual(['first', 'second']);
    expect(send.mock.calls[0]?.[0].clientId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await outboxList()).toEqual([]);
  });

  it('keeps entries while the server is unreachable', async () => {
    await enqueue('u1', 't1', 'Acme', { title: 'offline' });
    const send = vi.fn().mockRejectedValue(new ApiError(0, 'network'));
    expect(await syncOutbox('u1', 't1', send)).toEqual({ synced: 0, failed: 0, unreachable: true });
    expect((await outboxList()).map((e) => e.input.title)).toEqual(['offline']);
  });

  it('marks rejected entries and does not resend them until retried', async () => {
    await enqueue('u1', 't1', 'Acme', { title: 'forbidden' });
    const send = vi.fn().mockRejectedValue(new ApiError(403, 'forbidden'));
    expect(await syncOutbox('u1', 't1', send)).toEqual({ synced: 0, failed: 1, unreachable: false });
    const [entry] = await outboxList();
    expect(entry?.error).toBe('forbidden');
    expect(await syncOutbox('u1', 't1', send)).toEqual({ synced: 0, failed: 0, unreachable: false });
    expect(send).toHaveBeenCalledTimes(1);

    await retryEntry(entry!);
    send.mockResolvedValue({});
    expect(await syncOutbox('u1', 't1', send)).toMatchObject({ synced: 1 });
  });

  it('only syncs entries of the active user and tenant', async () => {
    await enqueue('u1', 't1', 'Acme', { title: 'acme' });
    await enqueue('u1', 't2', 'Beta', { title: 'beta' });
    const send = vi.fn().mockResolvedValue({});
    await syncOutbox('u1', 't1', send);
    expect(send).toHaveBeenCalledTimes(1);
    expect((await outboxList()).map((e) => e.owner)).toEqual([ownerKey('u1', 't2')]);
  });

  it('stops on a tenant switch and keeps the entry', async () => {
    await enqueue('u1', 't1', 'Acme', { title: 'later' });
    const send = vi.fn().mockRejectedValue(new ApiError(409, 'tenant_mismatch'));
    await syncOutbox('u1', 't1', send);
    expect((await outboxList())[0]?.error).toBeUndefined();
  });

  it('stores reactive Vue data in the cache', async () => {
    await cachePut('u1:t1:board:last', reactive([{ id: 'a', tags: [{ id: 't' }] }]));
    expect((await cacheGet('u1:t1:board:last'))?.data).toEqual([{ id: 'a', tags: [{ id: 't' }] }]);
  });

  it('clears cache and outbox (logout)', async () => {
    await cachePut('u1:t1:board:last', [{ id: 'x' }]);
    await enqueue('u1', 't1', 'Acme', { title: 'x' });
    await clearOfflineData();
    expect(await cacheGet('u1:t1:board:last')).toBeUndefined();
    expect(await outboxList()).toEqual([]);
  });
});
