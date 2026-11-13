import { inflateRawSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PriorityDto, SavedFilterDto, TagDto, TodoDto } from '@fg/shared';
import { addMembership, createTenant, createTestEnv, createUser, TestClient, type TestEnv } from './helpers.js';
import { buildScenario, type Scenario } from './scenario.js';

/** Reads one file from a ZIP buffer (enough for checking generated XLSX files). */
function unzipEntry(zip: Buffer, name: string): string {
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const size = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extra = zip.readUInt16LE(offset + 28);
    const entryName = zip.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extra;
    if (entryName === name) return inflateRawSync(zip.subarray(start, start + size)).toString('utf8');
    offset = start + size;
  }
  throw new Error(`${name} not found`);
}

describe('board: filters, sorting, saved filters, deep links, export', () => {
  let env: TestEnv;
  let s: Scenario;
  let prio: Record<string, string>;
  let tags: Record<string, string>;

  const titles = async (query: string, who: keyof Scenario['clients'] = 'admin') => {
    const res = await s.clients[who].get(`/api/todos?${query}`);
    expect(res.statusCode).toBe(200);
    return (res.json() as TodoDto[]).map((t) => t.title);
  };

  beforeEach(async () => {
    env = await createTestEnv();
    s = await buildScenario(env);
    const priorities = (await s.clients.admin.get('/api/priorities')).json() as PriorityDto[];
    prio = Object.fromEntries(priorities.map((p) => [p.key, p.id]));
    const e = s.clients.editor;
    await e.patch(`/api/todos/${s.todos.t1}`, { priorityId: prio.low, dueDate: '2026-12-20', tags: ['ui', 'web'] });
    await e.patch(`/api/todos/${s.todos.t2}`, { priorityId: prio.critical, dueDate: '2026-12-01', tags: ['api'] });
    await e.patch(`/api/todos/${s.todos.t3}`, { priorityId: prio.high, tags: ['ui'] });
    await e.patch(`/api/todos/${s.todos.t5}`, { dueDate: '2026-11-30' });
    tags = Object.fromEntries(((await s.clients.admin.get('/api/tags')).json() as TagDto[]).map((t) => [t.name, t.id]));
  });
  afterEach(async () => env.close());

  it('combines values of one criterion with OR and criteria with AND', async () => {
    expect((await titles(`scope=all&tags=${tags.ui}`)).sort()).toEqual(['t1', 't3']);
    expect((await titles(`scope=all&tags=${tags.ui},${tags.api}`)).sort()).toEqual(['t1', 't2', 't3']);
    expect((await titles(`scope=all&tags=none`)).sort()).toEqual(['t4', 't5']);
    expect((await titles(`scope=all&tags=${tags.ui}&priorities=${prio.high}`)).sort()).toEqual(['t3']);
    expect((await titles(`scope=all&priorities=none`)).sort()).toEqual(['t4', 't5']);
    expect((await titles(`scope=all&assignees=${s.members.editor},none`)).sort()).toEqual(['t1', 't2', 't4', 't5']);
    expect((await titles(`scope=all&projects=${s.projectQ},none`)).sort()).toEqual(['t4', 't5']);
    expect(await titles(`scope=all&tags=${tags.ui}&projects=none`)).toEqual([]);
  });

  it('never widens visibility through filters', async () => {
    expect((await titles(`scope=all&projects=${s.projectQ}`, 'editor')).sort()).toEqual([]);
    expect((await titles(`scope=all&tags=${tags.ui},${tags.api}`, 'restricted')).sort()).toEqual(['t2', 't3']);
  });

  it('sorts by priority, due date and status in both directions (empty values last)', async () => {
    expect(await titles('scope=all&sort=priority')).toEqual(['t2', 't3', 't1', expect.any(String), expect.any(String)]);
    expect((await titles('scope=all&sort=priority&dir=desc')).slice(0, 3)).toEqual(['t1', 't3', 't2']);
    expect((await titles('scope=all&sort=dueDate')).slice(0, 3)).toEqual(['t5', 't2', 't1']);
    expect((await titles('scope=all&sort=dueDate&dir=desc')).slice(0, 3)).toEqual(['t1', 't2', 't5']);
    await s.clients.admin.patch(`/api/todos/${s.todos.t4}`, { statusId: s.statuses.find((st) => st.key === 'under_review')!.id });
    expect((await titles('scope=all&sort=status&dir=desc'))[0]).toBe('t4');
  });

  it('stores saved filters per member', async () => {
    const created = await s.clients.editor.post('/api/filters', {
      name: 'UI work',
      criteria: { tagIds: [tags.ui], priorityIds: [prio.high, prio.low] },
    });
    expect(created.statusCode).toBe(201);
    const filter = created.json() as SavedFilterDto;
    expect(filter.criteria).toEqual({ tagIds: [tags.ui], assigneeIds: [], priorityIds: [prio.high, prio.low], projectIds: [] });
    expect(((await s.clients.editor.get('/api/filters')).json() as SavedFilterDto[]).map((f) => f.name)).toEqual(['UI work']);
    // other members neither see nor change it
    expect((await s.clients.reader.get('/api/filters')).json()).toEqual([]);
    expect((await s.clients.reader.patch(`/api/filters/${filter.id}`, { name: 'x' })).statusCode).toBe(404);
    expect((await s.clients.admin.delete(`/api/filters/${filter.id}`)).statusCode).toBe(404);
    expect((await s.clients.editor.patch(`/api/filters/${filter.id}`, { name: 'Renamed' })).json()).toMatchObject({ name: 'Renamed' });
    expect((await s.clients.editor.delete(`/api/filters/${filter.id}`)).statusCode).toBe(204);
  });

  it('resolves deep links only for To-Dos the user may see, switching tenants if needed', async () => {
    expect((await s.clients.reader.get(`/api/todos/${s.todos.t1}/locate`)).json()).toEqual({ tenantId: s.tenantId });
    expect((await s.clients.restricted.get(`/api/todos/${s.todos.t1}/locate`)).statusCode).toBe(404);
    expect((await s.clients.restricted.get('/api/todos/00000000-0000-0000-0000-000000000000/locate')).statusCode).toBe(404);

    // Second tenant: the editor is also member there and sees a To-Do
    const other = await createTenant(env.db, 'Other');
    const editorUser = (await env.db('users').where({ email: 'editor@acme.test' }).first()) as { id: string };
    await addMembership(env.db, other, editorUser.id, { defaultRole: 'editor' });
    const owner = await createUser(env.db, { email: 'owner@other.test' });
    await addMembership(env.db, other, owner, { tenantRole: 'admin' });
    const ownerClient = new TestClient(env.app);
    await ownerClient.login('owner@other.test');
    const foreign = (await ownerClient.post('/api/todos', { title: 'other tenant' })).json() as TodoDto;

    expect((await s.clients.editor.get(`/api/todos/${foreign.id}/locate`)).json()).toEqual({ tenantId: other });
    // Not a member of the other tenant → same answer as for an unknown To-Do
    const denied = await s.clients.reader.get(`/api/todos/${foreign.id}/locate`);
    expect(denied.statusCode).toBe(404);
    expect(denied.json()).toEqual({ error: 'not_found' });
  });

  it('exports the current view as CSV with only visible To-Dos', async () => {
    await s.clients.editor.patch(`/api/todos/${s.todos.t1}`, { title: '=HYPERLINK("x")' });
    const res = await s.clients.restricted.get('/api/todos/export?format=csv&scope=all&sort=priority');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="to-dos-\d{4}-\d{2}-\d{2}\.csv"/);
    const lines = res.body.replace(new RegExp(`^${String.fromCharCode(0xfeff)}`), '').trim().split('\r\n');
    expect(lines[0]).toContain('Titel;Beschreibung;Projekt;Status;Priorität');
    expect(lines.slice(1).map((l) => l.split(';')[0])).toEqual(['t2', 't3']);
    expect(lines[1]).toContain('Kritisch');

    const all = await s.clients.admin.get('/api/todos/export?format=csv&scope=all');
    expect(all.body).toContain(`'=HYPERLINK(""x"")`);
  });

  it('exports XLSX in the language of the user', async () => {
    await s.clients.admin.patch('/api/auth/me', { locale: 'en' });
    const res = await s.clients.admin.get('/api/todos/export?format=xlsx&scope=all&tags=' + tags.ui);
    expect(res.statusCode).toBe(200);
    const body = res.rawPayload;
    expect(body.subarray(0, 2).toString()).toBe('PK');
    const sheet = unzipEntry(body, 'xl/worksheets/sheet1.xml');
    expect(sheet).toContain('>Title<');
    expect(sheet).toContain('>t1<');
    expect(sheet).toContain('>t3<');
    expect(sheet).not.toContain('>t2<');
    expect(unzipEntry(body, '[Content_Types].xml')).toContain('spreadsheetml');
  });
});
