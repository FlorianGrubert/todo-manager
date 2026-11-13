import { afterEach, beforeAll, describe, expect, it, afterAll } from 'vitest';
import type { PriorityDto, TagDto, TodoDto } from '@fg/shared';
import { createTestEnv, type TestEnv } from './helpers.js';
import { buildScenario, titles, type Scenario } from './scenario.js';

/**
 * Zero Trust: an administrator of tenant A must never read or change data of
 * tenant B, no matter which IDs are sent (§11, §13).
 */
describe('tenant isolation', () => {
  let env: TestEnv;
  let a: Scenario;
  let b: Scenario;
  let bTag: TagDto;
  let bPriority: PriorityDto;

  beforeAll(async () => {
    env = await createTestEnv();
    a = await buildScenario(env, 'Alpha');
    b = await buildScenario(env, 'Beta');
    await b.clients.editor.patch(`/api/todos/${b.todos.t1}`, { tags: ['secret-b'] });
    await b.clients.reader.post(`/api/todos/${b.todos.t1}/comments`, { body: 'secret comment' });
    bTag = ((await b.clients.admin.get('/api/tags')).json() as TagDto[])[0]!;
    bPriority = ((await b.clients.admin.get('/api/priorities')).json() as PriorityDto[])[0]!;
  });
  afterAll(async () => env.close());
  afterEach(() => undefined);

  it('lists only own tenant data', async () => {
    const c = a.clients.admin;
    expect(titles((await c.get('/api/todos?scope=all&closed=1&archived=1')).json() as TodoDto[])).toEqual([
      't1',
      't2',
      't3',
      't4',
      't5',
    ]);
    const ids = ((await c.get('/api/todos?scope=all')).json() as TodoDto[]).map((t) => t.id);
    expect(ids.some((id) => Object.values(b.todos).includes(id))).toBe(false);
    expect(((await c.get('/api/tags')).json() as TagDto[]).map((t) => t.name)).not.toContain('secret-b');
    const statusIds = ((await c.get('/api/statuses')).json() as { id: string }[]).map((st) => st.id);
    expect(statusIds.some((id) => b.statuses.some((st) => st.id === id))).toBe(false);
    const memberNames = ((await c.get('/api/members')).json() as { displayName: string }[]).map((m) => m.displayName);
    expect(memberNames.every((n) => n.includes('(Alpha)'))).toBe(true);
    const adminMembers = ((await c.get('/api/admin/members')).json() as { displayName: string }[]).map((m) => m.displayName);
    expect(adminMembers.every((n) => n.includes('(Alpha)'))).toBe(true);
    const projects = ((await c.get('/api/projects?includeArchived=1')).json() as { name: string }[]).map((p) => p.name);
    expect(projects.sort()).toEqual(['P Alpha', 'Q Alpha']);
  });

  it('answers 404 for every foreign object ID', async () => {
    const c = a.clients.admin;
    const t = b.todos.t1;
    const requests: [string, Promise<{ statusCode: number }>][] = [
      ['get todo', c.get(`/api/todos/${t}`)],
      ['patch todo', c.patch(`/api/todos/${t}`, { title: 'hacked' })],
      ['cancel todo', c.post(`/api/todos/${t}/cancel`)],
      ['comments', c.get(`/api/todos/${t}/comments`)],
      ['add comment', c.post(`/api/todos/${t}/comments`, { body: 'x' })],
      ['history', c.get(`/api/todos/${t}/history`)],
      ['patch project', c.patch(`/api/projects/${b.projectP}`, { name: 'x' })],
      ['archive project', c.post(`/api/projects/${b.projectP}/archive`)],
      ['restore project', c.post(`/api/projects/${b.projectP}/restore`)],
      ['project members', c.get(`/api/projects/${b.projectP}/members`)],
      ['set project member', c.put(`/api/projects/${b.projectP}/members/${b.members.editor}`, { role: 'editor' })],
      ['foreign member in own project', c.put(`/api/projects/${a.projectP}/members/${b.members.editor}`, { role: 'editor' })],
      ['remove project member', c.delete(`/api/projects/${b.projectP}/members/${b.members.editor}`)],
      ['assignable', c.get(`/api/members/assignable?projectId=${b.projectP}`)],
      ['patch status', c.patch(`/api/statuses/${b.statuses[0]!.id}`, { color: '#000000' })],
      ['remove status', c.post(`/api/statuses/${b.statuses[1]!.id}/remove`, { replacementId: a.statuses[0]!.id })],
      ['patch priority', c.patch(`/api/priorities/${bPriority.id}`, { rank: 9 })],
      ['remove priority', c.post(`/api/priorities/${bPriority.id}/remove`, { replacementId: null })],
      ['patch tag', c.patch(`/api/tags/${bTag.id}`, { name: 'x' })],
      ['delete tag', c.delete(`/api/tags/${bTag.id}`)],
      ['patch member', c.patch(`/api/admin/members/${b.members.editor}`, { isActive: false })],
      ['pseudonymize member', c.post(`/api/admin/members/${b.members.editor}/pseudonymize`)],
      ['resend invitation', c.post(`/api/admin/members/${b.members.editor}/resend`)],
      ['create todo in foreign project', c.post('/api/todos', { title: 'x', projectId: b.projectP })],
      ['move todo to foreign project', c.patch(`/api/todos/${a.todos.t1}`, { projectId: b.projectP })],
    ];
    for (const [name, promise] of requests) {
      const res = await promise;
      expect({ name, status: res.statusCode }).toEqual({ name, status: 404 });
    }
  });

  it('rejects foreign references inside own objects', async () => {
    const c = a.clients.admin;
    expect((await c.post('/api/todos', { title: 'x', statusId: b.statuses[0]!.id })).statusCode).toBe(400);
    expect((await c.post('/api/todos', { title: 'x', priorityId: bPriority.id })).statusCode).toBe(400);
    expect((await c.post('/api/todos', { title: 'x', assigneeId: b.members.admin })).json()).toEqual({
      error: 'invalid_assignee',
    });
    expect((await c.post(`/api/statuses/${a.statuses[1]!.id}/remove`, { replacementId: b.statuses[0]!.id })).statusCode).toBe(400);
  });

  it('left tenant B unchanged', async () => {
    const t1 = (await b.clients.admin.get(`/api/todos/${b.todos.t1}`)).json() as TodoDto;
    expect(t1.title).toBe('t1');
    expect(t1.commentCount).toBe(1);
    expect(t1.tags.map((t) => t.name)).toEqual(['secret-b']);
    expect((await b.clients.editor.get('/api/todos')).statusCode).toBe(200);
  });
});
