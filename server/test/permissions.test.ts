import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HistoryResponse, ProjectDto, TodoDto } from '@fg/shared';
import { createTestEnv, type TestEnv } from './helpers.js';
import { buildScenario, titles, type Scenario } from './scenario.js';

describe('permissions', () => {
  let env: TestEnv;
  let s: Scenario;

  beforeEach(async () => {
    env = await createTestEnv();
    s = await buildScenario(env);
  });
  afterEach(async () => env.close());

  const list = async (who: keyof Scenario['clients'], query = '') => {
    const params = new URLSearchParams(query);
    if (!params.has('scope')) params.set('scope', 'all');
    const res = await s.clients[who].get(`/api/todos?${params.toString()}`);
    expect(res.statusCode).toBe(200);
    return titles(res.json() as TodoDto[]);
  };

  it('shows each role exactly the To-Dos it may see', async () => {
    expect(await list('admin')).toEqual(['t1', 't2', 't3', 't4', 't5']);
    expect(await list('editor')).toEqual(['t1', 't2', 't3', 't5']);
    expect(await list('restricted')).toEqual(['t2', 't3']);
    expect(await list('reader')).toEqual(['t1', 't2', 't3', 't5']);
    expect(await list('padmin')).toEqual([]);
    expect(await list('outsider')).toEqual([]);
  });

  it('filters by project, "without project", assignee and search text', async () => {
    expect(await list('admin', `?projects=${s.projectP}`)).toEqual(['t1', 't2', 't3']);
    expect(await list('admin', '?projects=none')).toEqual(['t5']);
    expect(await list('editor', '?scope=mine')).toEqual(['t1']);
    expect(await list('admin', '?q=T4')).toEqual(['t4']);
    expect(await list('admin', '?q=%25')).toEqual([]);
  });

  it('hides To-Dos the member may not see on direct access (404)', async () => {
    expect((await s.clients.restricted.get(`/api/todos/${s.todos.t1}`)).statusCode).toBe(404);
    expect((await s.clients.reader.get(`/api/todos/${s.todos.t4}`)).statusCode).toBe(404);
    expect((await s.clients.outsider.get(`/api/todos/${s.todos.t1}`)).statusCode).toBe(404);
    expect((await s.clients.restricted.get(`/api/todos/${s.todos.t3}`)).statusCode).toBe(200);
  });

  it('allows editing according to role', async () => {
    const patch = (who: keyof Scenario['clients'], id: string) => s.clients[who].patch(`/api/todos/${id}`, { title: `${who}-edit` });
    expect((await patch('reader', s.todos.t1)).statusCode).toBe(403);
    expect((await patch('restricted', s.todos.t1)).statusCode).toBe(404);
    expect((await patch('restricted', s.todos.t3)).statusCode).toBe(200);
    expect((await patch('restricted', s.todos.t2)).statusCode).toBe(200);
    expect((await patch('editor', s.todos.t4)).statusCode).toBe(404);
    expect((await patch('editor', s.todos.t1)).statusCode).toBe(200);
    expect((await patch('admin', s.todos.t4)).statusCode).toBe(200);

    const t3 = (await s.clients.restricted.get(`/api/todos/${s.todos.t3}`)).json() as TodoDto;
    expect(t3.canEdit).toBe(true);
    const t1 = (await s.clients.reader.get(`/api/todos/${s.todos.t1}`)).json() as TodoDto;
    expect(t1.canEdit).toBe(false);
  });

  it('enforces creation and assignment rules', async () => {
    const c = s.clients;
    expect((await c.reader.post('/api/todos', { title: 'x', projectId: s.projectP })).statusCode).toBe(403);
    expect((await c.outsider.post('/api/todos', { title: 'x', projectId: s.projectP })).statusCode).toBe(404);
    expect((await c.outsider.post('/api/todos', { title: 'x' })).statusCode).toBe(403);
    expect((await c.editor.post('/api/todos', { title: 'x', projectId: s.projectQ })).statusCode).toBe(404);
    expect(
      (await c.restricted.post('/api/todos', { title: 'x', projectId: s.projectP, assigneeId: s.members.editor })).statusCode,
    ).toBe(403);
    expect(
      (await c.restricted.post('/api/todos', { title: 'x', projectId: s.projectP, assigneeId: s.members.restricted }))
        .statusCode,
    ).toBe(201);
    const readerAssign = await c.editor.post('/api/todos', { title: 'x', projectId: s.projectP, assigneeId: s.members.reader });
    expect(readerAssign.json()).toEqual({ error: 'invalid_assignee' });
    // restricted editors may not hand their own To-Do to someone else
    expect((await c.restricted.patch(`/api/todos/${s.todos.t2}`, { assigneeId: s.members.editor })).statusCode).toBe(403);
    // the admin can always be assigned
    expect(
      (await c.editor.post('/api/todos', { title: 'x', projectId: s.projectP, assigneeId: s.members.admin })).statusCode,
    ).toBe(201);
  });

  it('lists only assignable members of a project', async () => {
    const res = await s.clients.editor.get(`/api/members/assignable?projectId=${s.projectP}`);
    const names = (res.json() as { displayName: string }[]).map((m) => m.displayName).sort();
    expect(names).toEqual(['admin (Acme)', 'editor (Acme)', 'restricted (Acme)']);
    expect((await s.clients.editor.get(`/api/members/assignable?projectId=${s.projectQ}`)).statusCode).toBe(404);
  });

  it('lets every role comment on visible To-Dos only', async () => {
    expect((await s.clients.reader.post(`/api/todos/${s.todos.t1}/comments`, { body: 'Hi' })).statusCode).toBe(201);
    expect((await s.clients.restricted.post(`/api/todos/${s.todos.t1}/comments`, { body: 'Hi' })).statusCode).toBe(404);
    const comments = (await s.clients.editor.get(`/api/todos/${s.todos.t1}/comments`)).json() as { body: string; author: { displayName: string } }[];
    expect(comments).toEqual([expect.objectContaining({ body: 'Hi', author: expect.objectContaining({ displayName: 'reader (Acme)' }) })]);
    expect(((await s.clients.editor.get(`/api/todos/${s.todos.t1}`)).json() as TodoDto).commentCount).toBe(1);
  });

  it('records the change history and cancels To-Dos', async () => {
    await s.clients.editor.patch(`/api/todos/${s.todos.t1}`, {
      title: 'renamed',
      dueDate: '2026-12-24',
      tags: ['Frontend', 'urgent'],
      links: [{ url: 'https://example.com', label: 'Spec' }],
    });
    const cancelled = (await s.clients.editor.post(`/api/todos/${s.todos.t1}/cancel`)).json() as TodoDto;
    const rejected = s.statuses.find((st) => st.key === 'rejected');
    expect(cancelled.statusId).toBe(rejected?.id);
    expect(cancelled.tags.map((t) => t.name)).toEqual(['Frontend', 'urgent']);
    expect(cancelled.links).toEqual([{ url: 'https://example.com', label: 'Spec' }]);

    const history = (await s.clients.reader.get(`/api/todos/${s.todos.t1}/history`)).json() as HistoryResponse;
    const fields = history.entries.map((e) => e.field).sort();
    expect(fields).toEqual(['created', 'dueDate', 'links', 'status', 'tags', 'title']);
    const title = history.entries.find((e) => e.field === 'title');
    expect(title).toMatchObject({ oldValue: 't1', newValue: 'renamed', changedBy: { displayName: 'editor (Acme)' } });
    expect(history.refs.statuses.map((st) => st.key).sort()).toEqual(['backlog', 'rejected']);

    // closed To-Dos are hidden by default
    expect(await list('editor')).not.toContain('renamed');
    expect(await list('editor', '?closed=1')).toContain('renamed');
  });

  it('rejects unsafe link schemes', async () => {
    const res = await s.clients.editor.patch(`/api/todos/${s.todos.t1}`, { links: [{ url: 'javascript:alert(1)' }] });
    expect(res.statusCode).toBe(400);
  });

  it('returns the existing To-Do for a repeated clientId', async () => {
    const first = await s.clients.editor.post('/api/todos', { title: 'offline', clientId: 'abc-1' });
    const second = await s.clients.editor.post('/api/todos', { title: 'offline', clientId: 'abc-1' });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect((second.json() as TodoDto).id).toBe((first.json() as TodoDto).id);
  });

  describe('projects', () => {
    it('lets only admins and project admins manage projects', async () => {
      expect((await s.clients.editor.post('/api/projects', { name: 'New' })).statusCode).toBe(403);
      const created = await s.clients.padmin.post('/api/projects', { name: 'New' });
      expect(created.statusCode).toBe(201);
      const { id } = created.json() as { id: string };
      expect((await s.clients.padmin.put(`/api/projects/${id}/members/${s.members.reader}`, { role: 'reader' })).statusCode).toBe(204);
      const visible = (await s.clients.reader.get('/api/projects')).json() as ProjectDto[];
      expect(visible.map((p) => p.name).sort()).toEqual(['New', 'P Acme']);
      expect(visible.find((p) => p.name === 'New')?.myRole).toBe('reader');
      expect((await s.clients.padmin.get('/api/projects')).json()).toHaveLength(3);
    });

    it('archives a project with its To-Dos and restores it', async () => {
      expect((await s.clients.editor.post(`/api/projects/${s.projectP}/archive`)).statusCode).toBe(403);
      expect((await s.clients.padmin.post(`/api/projects/${s.projectP}/archive`)).statusCode).toBe(204);
      expect(await list('editor')).toEqual(['t5']);
      expect(await list('editor', '?archived=1')).toEqual(['t1', 't2', 't3', 't5']);
      const edit = await s.clients.editor.patch(`/api/todos/${s.todos.t1}`, { title: 'x' });
      expect(edit.json()).toEqual({ error: 'archived' });
      expect((await s.clients.editor.post('/api/todos', { title: 'x', projectId: s.projectP })).statusCode).toBe(409);
      expect((await s.clients.admin.post(`/api/projects/${s.projectP}/restore`)).statusCode).toBe(204);
      expect(await list('editor')).toEqual(['t1', 't2', 't3', 't5']);
    });
  });

  describe('tenant administration', () => {
    it('is restricted to tenant administrators', async () => {
      for (const who of ['padmin', 'editor', 'reader'] as const) {
        expect((await s.clients[who].get('/api/admin/members')).statusCode).toBe(403);
        expect((await s.clients[who].post('/api/statuses', { name: 'X', rank: 1, color: '#000000', category: 'open' })).statusCode).toBe(403);
        expect((await s.clients[who].patch(`/api/statuses/${s.statuses[0]!.id}`, { color: '#000000' })).statusCode).toBe(403);
      }
    });

    it('keeps at least one active administrator', async () => {
      const res = await s.clients.admin.patch(`/api/admin/members/${s.members.admin}`, { tenantRole: 'member' });
      expect(res.json()).toEqual({ error: 'last_admin' });
      expect((await s.clients.admin.patch(`/api/admin/members/${s.members.admin}`, { isActive: false })).statusCode).toBe(409);
      expect((await s.clients.admin.post(`/api/admin/members/${s.members.admin}/pseudonymize`)).statusCode).toBe(409);
      await s.clients.admin.patch(`/api/admin/members/${s.members.editor}`, { tenantRole: 'admin' });
      expect((await s.clients.admin.patch(`/api/admin/members/${s.members.admin}`, { tenantRole: 'member' })).statusCode).toBe(204);
    });

    it('deactivates members so they cannot open the tenant any more', async () => {
      expect((await s.clients.admin.patch(`/api/admin/members/${s.members.reader}`, { isActive: false })).statusCode).toBe(204);
      expect((await s.clients.reader.get('/api/todos')).statusCode).toBe(403);
    });

    it('pseudonymizes members while keeping references', async () => {
      const res = await s.clients.admin.post(`/api/admin/members/${s.members.editor}/pseudonymize`);
      expect(res.statusCode).toBe(200);
      const member = res.json() as { displayName: string; email: string | null; isActive: boolean };
      expect(member.displayName).toMatch(/^Pseudonym /);
      expect(member.email).toBeNull();
      expect(member.isActive).toBe(false);
      const t1 = (await s.clients.admin.get(`/api/todos/${s.todos.t1}`)).json() as TodoDto;
      expect(t1.createdBy.displayName).toBe(member.displayName);
      expect(t1.assigneeId).toBe(s.members.editor);
      // account existed only in this tenant → it is anonymised and cannot log in
      const user = await env.db('users').where({ email: 'editor@acme.test' }).first();
      expect(user).toBeUndefined();
    });

    it('invites members and lists them with last login', async () => {
      const res = await s.clients.admin.post('/api/admin/members', {
        email: 'new@acme.test',
        displayName: 'Newbie',
        tenantRole: 'member',
        defaultRole: 'reader',
      });
      expect(res.statusCode).toBe(201);
      const again = await s.clients.admin.post('/api/admin/members', { email: 'editor@acme.test', displayName: 'Dup' });
      expect(again.json()).toEqual({ error: 'already_member' });
      const members = (await s.clients.admin.get('/api/admin/members')).json() as {
        displayName: string;
        pending: boolean;
        lastLoginAt: string | null;
      }[];
      const newbie = members.find((m) => m.displayName === 'Newbie');
      expect(newbie).toMatchObject({ pending: true, lastLoginAt: null });
      expect(members.find((m) => m.displayName === 'editor (Acme)')?.lastLoginAt).toBeTruthy();
      expect((await s.clients.admin.post(`/api/admin/members/${(res.json() as { id: string }).id}/resend`)).statusCode).toBe(204);
    });
  });

  describe('statuses and priorities', () => {
    it('lets the admin add, rename and remove statuses with replacement', async () => {
      const backlog = s.statuses.find((st) => st.key === 'backlog')!;
      const inProgress = s.statuses.find((st) => st.key === 'in_progress')!;
      const created = await s.clients.admin.post('/api/statuses', { name: 'Blocked', rank: 25, color: '#ff8800', category: 'open' });
      expect(created.statusCode).toBe(201);
      expect((await s.clients.admin.patch(`/api/statuses/${inProgress.id}`, { name: 'Doing' })).statusCode).toBe(204);
      // the default status for new To-Dos cannot be removed
      expect((await s.clients.admin.post(`/api/statuses/${backlog.id}/remove`, { replacementId: inProgress.id })).json()).toEqual({
        error: 'in_use',
      });
      await s.clients.admin.patch(`/api/statuses/${inProgress.id}`, { isNewDefault: true });
      expect((await s.clients.admin.post(`/api/statuses/${backlog.id}/remove`, { replacementId: inProgress.id })).statusCode).toBe(204);
      const t1 = (await s.clients.admin.get(`/api/todos/${s.todos.t1}`)).json() as TodoDto;
      expect(t1.statusId).toBe(inProgress.id);
      const names = ((await s.clients.editor.get('/api/statuses')).json() as { name: string | null; key: string | null }[]).map(
        (st) => st.name ?? st.key,
      );
      expect(names).toEqual(['Doing', 'Blocked', 'under_review', 'done', 'rejected', 'deleted']);
      // cancel target must have category "cancelled"
      expect((await s.clients.admin.patch(`/api/statuses/${inProgress.id}`, { isCancelTarget: true })).statusCode).toBe(409);
    });

    it('lets the admin configure priorities and remove them', async () => {
      const prios = (await s.clients.admin.get('/api/priorities')).json() as { id: string; key: string }[];
      const high = prios.find((p) => p.key === 'high')!;
      await s.clients.editor.patch(`/api/todos/${s.todos.t1}`, { priorityId: high.id });
      expect(
        (await s.clients.admin.patch(`/api/priorities/${high.id}`, { iconArrows: 3, iconColor: 'red', iconDirection: 'up' })).statusCode,
      ).toBe(204);
      expect((await s.clients.admin.post(`/api/priorities/${high.id}/remove`, { replacementId: null })).statusCode).toBe(204);
      const t1 = (await s.clients.admin.get(`/api/todos/${s.todos.t1}`)).json() as TodoDto;
      expect(t1.priorityId).toBeNull();
    });
  });
});
