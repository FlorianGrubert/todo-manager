import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AdminMemberDto, ContactDto, MemberDto, MeResponse, ProjectMemberDto, TodoDto } from '@fg/shared';
import { runReminderJob } from '../src/modules/notifications/service.js';
import type { TenantExport } from '../src/modules/system/transfer.js';
import { addMembership, createTenant, createUser, TEST_PASSWORD, TestClient, tokenFromMail, createTestEnv, type TestEnv } from './helpers.js';
import { buildScenario, titles, type Scenario } from './scenario.js';

describe('persons without login', () => {
  let env: TestEnv;
  let s: Scenario;
  let contact: ContactDto;

  const idle = () => env.app.deps.queue.idle();

  beforeEach(async () => {
    env = await createTestEnv();
    s = await buildScenario(env);
    const res = await s.clients.padmin.post('/api/contacts', { displayName: 'Erika Extern', projectIds: [s.projectP] });
    expect(res.statusCode).toBe(201);
    contact = res.json() as ContactDto;
    await idle();
    env.mails.length = 0;
  });
  afterEach(async () => env.close());

  const assignable = async (projectId: string, who: TestClient = s.clients.editor) =>
    ((await who.get(`/api/members/assignable?projectId=${projectId}`)).json() as MemberDto[]).map((m) => m.id);

  it('is managed by tenant and project administrators only', async () => {
    expect(contact).toMatchObject({ displayName: 'Erika Extern', isActive: true, invited: false, projectIds: [s.projectP] });
    expect((await s.clients.editor.post('/api/contacts', { displayName: 'X' })).statusCode).toBe(403);
    expect((await s.clients.reader.get('/api/contacts')).statusCode).toBe(403);
    expect((await s.clients.admin.post('/api/contacts', { displayName: 'Y', projectIds: ['unknown'] })).statusCode).toBe(400);

    const list = (await s.clients.admin.get('/api/contacts')).json() as ContactDto[];
    expect(list.map((c) => c.displayName)).toEqual(['Erika Extern']);
    expect((await s.clients.padmin.patch(`/api/contacts/${contact.id}`, { displayName: 'Erika E.' })).statusCode).toBe(204);
    expect((await s.clients.padmin.patch(`/api/contacts/${s.members.editor}`, { displayName: 'no' })).statusCode).toBe(404);

    const members = (await s.clients.padmin.get(`/api/projects/${s.projectP}/members`)).json() as ProjectMemberDto[];
    expect(members.find((m) => m.membershipId === contact.id)).toMatchObject({ role: 'contact', isContact: true, displayName: 'Erika E.' });
  });

  it('can only be linked, never get a project role (and users never get the link role)', async () => {
    const put = (membershipId: string, role: string) =>
      s.clients.padmin.put(`/api/projects/${s.projectQ}/members/${membershipId}`, { role });
    expect((await put(contact.id, 'editor')).statusCode).toBe(400);
    expect((await put(s.members.reader, 'contact')).statusCode).toBe(400);
    expect((await put(contact.id, 'contact')).statusCode).toBe(204);
    expect(await assignable(s.projectQ, s.clients.admin)).toContain(contact.id);
  });

  it('is assignable only in linked projects, never without project', async () => {
    expect(await assignable(s.projectP)).toContain(contact.id);
    expect(await assignable('none')).not.toContain(contact.id);
    const admin = s.clients.admin;
    expect(await assignable(s.projectQ, admin)).not.toContain(contact.id);

    const ok = await s.clients.editor.post('/api/todos', { title: 'external', projectId: s.projectP, assigneeId: contact.id });
    expect(ok.statusCode).toBe(201);
    const todo = ok.json() as TodoDto;
    expect((await admin.post('/api/todos', { title: 'x', projectId: s.projectQ, assigneeId: contact.id })).json()).toEqual({
      error: 'invalid_assignee',
    });
    expect((await admin.post('/api/todos', { title: 'x', assigneeId: contact.id })).json()).toEqual({ error: 'invalid_assignee' });
    // moving the To-Do into a project the person is not linked to is refused
    expect((await admin.patch(`/api/todos/${todo.id}`, { projectId: s.projectQ })).json()).toEqual({ error: 'invalid_assignee' });
    // restricted editors may still only assign themselves
    expect(
      (await s.clients.restricted.post('/api/todos', { title: 'x', projectId: s.projectP, assigneeId: contact.id })).statusCode,
    ).toBe(403);

    // shown with its name for cards, lanes and filters
    const members = (await s.clients.reader.get('/api/members')).json() as MemberDto[];
    expect(members).toContainEqual({ id: contact.id, displayName: 'Erika Extern', isContact: true });
    const filtered = (await s.clients.reader.get(`/api/todos?scope=all&assignees=${contact.id}`)).json() as TodoDto[];
    expect(titles(filtered)).toEqual(['external']);

    // a deactivated person keeps its To-Dos but is no longer assignable
    await s.clients.padmin.patch(`/api/contacts/${contact.id}`, { isActive: false });
    expect(await assignable(s.projectP)).not.toContain(contact.id);
    expect(((await admin.get(`/api/todos/${todo.id}`)).json() as TodoDto).assigneeId).toBe(contact.id);
  });

  it('cannot sign in and receives no e-mails', async () => {
    const res = await s.clients.editor.post('/api/todos', {
      title: 'due',
      projectId: s.projectP,
      assigneeId: contact.id,
      dueDate: '2026-12-01',
    });
    expect(res.statusCode).toBe(201);
    await idle();
    await runReminderJob(env.app.deps, new Date('2026-12-10T11:00:00Z'));
    await idle();
    expect(env.mails).toHaveLength(0);

    const placeholder = (await env.db('memberships as m')
      .join('users as u', 'u.id', 'm.user_id')
      .where('m.id', contact.id)
      .first('u.email', 'u.is_active', 'u.password_hash')) as { email: string; is_active: number; password_hash: string | null };
    expect(placeholder.email).toMatch(/@invalid\.invalid$/);
    expect(Number(placeholder.is_active)).toBe(0);
    expect(placeholder.password_hash).toBeNull();
    expect((await new TestClient(env.app).post('/api/auth/login', { email: placeholder.email, password: '' })).statusCode).not.toBe(200);
  });

  describe('becoming a user', () => {
    let todoId: string;
    beforeEach(async () => {
      const res = await s.clients.editor.post('/api/todos', { title: 'for erika', projectId: s.projectP, assigneeId: contact.id });
      todoId = (res.json() as TodoDto).id;
      await idle();
      env.mails.length = 0;
    });

    const invite = (email: string, who: TestClient = s.clients.admin) =>
      who.post(`/api/admin/members/${contact.id}/invite`, { email, defaultRole: 'none', locale: 'en' });

    it('keeps the membership and all assigned To-Dos', async () => {
      expect((await invite('erika@extern.test', s.clients.padmin)).statusCode).toBe(403);
      const admins = (await s.clients.admin.get('/api/admin/members')).json() as AdminMemberDto[];
      expect(admins.find((m) => m.id === contact.id)).toMatchObject({ isContact: true, pending: false, email: null });

      expect((await invite('erika@extern.test')).statusCode).toBe(204);
      expect(env.mails.map((m) => m.to)).toEqual(['erika@extern.test']);
      // still assignable while the invitation is open
      expect(await assignable(s.projectP)).toContain(contact.id);
      const pending = (await s.clients.admin.get('/api/admin/members')).json() as AdminMemberDto[];
      expect(pending.find((m) => m.id === contact.id)).toMatchObject({ isContact: true, pending: true, email: 'erika@extern.test' });

      const erika = new TestClient(env.app);
      const token = tokenFromMail(env.mails, '/invite/');
      const accepted = await erika.post(`/api/invitations/${token}/accept`, { password: TEST_PASSWORD });
      expect(accepted.statusCode).toBe(200);
      expect((accepted.json() as MeResponse).activeTenant?.membershipId).toBe(contact.id);

      // same membership: the To-Do is hers, she is restricted editor in the linked project
      const mine = (await erika.get('/api/todos')).json() as TodoDto[];
      expect(mine.map((t) => t.id)).toEqual([todoId]);
      expect(mine[0]!.canEdit).toBe(true);
      const roles = (await s.clients.padmin.get(`/api/projects/${s.projectP}/members`)).json() as ProjectMemberDto[];
      expect(roles.find((m) => m.membershipId === contact.id)).toMatchObject({ role: 'restricted', isContact: false });
      expect((await s.clients.admin.get('/api/contacts')).json()).toEqual([]);
      expect(await assignable(s.projectP)).toContain(contact.id);
    });

    it('reuses an existing account of another tenant without revealing it', async () => {
      const other = await createTenant(env.db, 'Other');
      const userId = await createUser(env.db, { email: 'known@else.test' });
      await addMembership(env.db, other, userId);
      expect((await invite('known@else.test')).statusCode).toBe(204);
      expect(env.mails.at(-1)?.to).toBe('known@else.test');

      const known = new TestClient(env.app);
      await known.login('known@else.test');
      const token = tokenFromMail(env.mails, '/invite/');
      expect((await known.post(`/api/invitations/${token}/accept`, { password: TEST_PASSWORD })).statusCode).toBe(200);
      const m = (await env.db('memberships').where({ id: contact.id }).first('user_id', 'kind')) as { user_id: string; kind: string };
      expect(m).toEqual({ user_id: userId, kind: 'user' });
    });

    it('refuses e-mail addresses of existing members of the tenant', async () => {
      expect((await invite('reader@acme.test')).json()).toEqual({ error: 'already_member' });
      expect((await s.clients.admin.post(`/api/admin/members/${s.members.reader}/invite`, { email: 'new@x.test' })).statusCode).toBe(404);
    });

    it('allows correcting a mistyped address', async () => {
      await invite('erika@typo.test');
      expect((await invite('erika@extern.test')).statusCode).toBe(204);
      const typo = (await env.db('users').where({ email: 'erika@typo.test' }).first('id')) as { id: string } | undefined;
      expect(typo).toBeUndefined();
      const token = tokenFromMail(env.mails, '/invite/');
      const erika = new TestClient(env.app);
      expect((await erika.post(`/api/invitations/${token}/accept`, { password: TEST_PASSWORD })).statusCode).toBe(200);
    });
  });

  it('is invisible to other tenants', async () => {
    const b = await buildScenario(env, 'Beta');
    expect((await b.clients.admin.get('/api/contacts')).json()).toEqual([]);
    expect((await b.clients.admin.patch(`/api/contacts/${contact.id}`, { displayName: 'x' })).statusCode).toBe(404);
    expect((await b.clients.admin.put(`/api/projects/${b.projectP}/members/${contact.id}`, { role: 'contact' })).statusCode).toBe(404);
    expect(
      (await b.clients.admin.post('/api/todos', { title: 'x', projectId: b.projectP, assigneeId: contact.id })).json(),
    ).toEqual({ error: 'invalid_assignee' });
    expect((await b.clients.admin.post(`/api/admin/members/${contact.id}/invite`, { email: 'a@b.test' })).statusCode).toBe(404);
  });

  it('survives tenant export and import', async () => {
    await s.clients.editor.post('/api/todos', { title: 'external', projectId: s.projectP, assigneeId: contact.id });
    await createUser(env.db, { email: 'root@example.com', systemAdmin: true });
    const sys = new TestClient(env.app);
    await sys.login('root@example.com');
    const data = (await sys.get(`/api/system/tenants/${s.tenantId}/export`)).json() as TenantExport;
    const exported = data.members.find((m) => m.kind === 'contact')!;
    expect(exported).toMatchObject({ email: null, display_name: 'Erika Extern' });

    const res = await sys.post('/api/system/tenants/import', { name: 'Copy', data });
    expect(res.statusCode).toBe(201);
    const { id: copyId } = res.json() as { id: string };
    const copied = (await env.db('memberships').where({ tenant_id: copyId, kind: 'contact' })) as { id: string }[];
    expect(copied).toHaveLength(1);
    const todo = (await env.db('todos').where({ tenant_id: copyId, title: 'external' }).first('assignee_id')) as { assignee_id: string };
    expect(todo.assignee_id).toBe(copied[0]!.id);
    const link = await env.db('project_members').where({ tenant_id: copyId, membership_id: copied[0]!.id, role: 'contact' }).first();
    expect(link).toBeTruthy();

    // version 1 files (without persons) are still accepted
    const v1 = {
      ...data,
      version: 1,
      members: data.members.filter((m) => m.kind !== 'contact').map(({ kind: _k, ...m }) => m),
      projectMembers: data.projectMembers.filter((pm) => pm.role !== 'contact'),
      todos: data.todos.map((t) => (t.assignee_id === exported.id ? { ...t, assignee_id: null } : t)),
      history: data.history.filter((h) => h.field !== 'assignee'),
    };
    expect((await sys.post('/api/system/tenants/import', { name: 'Old', data: v1 })).statusCode).toBe(201);

    // inconsistent links are rejected
    const broken = { ...data, projectMembers: data.projectMembers.map((pm) => ({ ...pm, role: 'contact' })) };
    expect((await sys.post('/api/system/tenants/import', { name: 'Broken', data: broken })).statusCode).toBe(400);
  });
});
