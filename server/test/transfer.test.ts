import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HistoryResponse, MeResponse, SavedFilterDto, TodoDto } from '@fg/shared';
import type { TenantExport } from '../src/modules/system/transfer.js';
import { createTestEnv, createUser, TEST_PASSWORD, TestClient, tokenFromMail, type TestEnv } from './helpers.js';
import { buildScenario, type Scenario } from './scenario.js';

const TABLES = ['memberships', 'projects', 'project_members', 'statuses', 'priorities', 'tags', 'todos', 'todo_links', 'todo_tags', 'comments', 'todo_history', 'saved_filters'];

async function counts(env: TestEnv, tenantId: string): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const table of TABLES) {
    const row = (await env.db(table).where({ tenant_id: tenantId }).count({ c: '*' }).first()) as { c: number | string };
    result[table] = Number(row.c);
  }
  return result;
}

describe('tenant export and import', () => {
  let env: TestEnv;
  let s: Scenario;
  let sys: TestClient;

  beforeEach(async () => {
    env = await createTestEnv();
    s = await buildScenario(env);
    const e = s.clients.editor;
    await e.patch(`/api/todos/${s.todos.t1}`, { title: 'renamed', tags: ['ui'], links: [{ url: 'https://example.com', label: 'Spec' }] });
    await e.patch(`/api/todos/${s.todos.t1}`, { statusId: s.statuses.find((st) => st.key === 'in_progress')!.id });
    await s.clients.reader.post(`/api/todos/${s.todos.t1}/comments`, { body: 'Looks good' });
    const tags = (await s.clients.admin.get('/api/tags')).json() as { id: string }[];
    await e.post('/api/filters', { name: 'UI', criteria: { tagIds: [tags[0]!.id, 'none'], projectIds: [s.projectP] } });
    await createUser(env.db, { email: 'root@example.com', systemAdmin: true });
    sys = new TestClient(env.app);
    await sys.login('root@example.com');
  });
  afterEach(async () => env.close());

  const exportTenant = async () => {
    const res = await sys.get(`/api/system/tenants/${s.tenantId}/export`);
    expect(res.statusCode).toBe(200);
    return res.json() as TenantExport;
  };

  it('exports all data of the tenant, only for system administrators', async () => {
    expect((await s.clients.admin.get(`/api/system/tenants/${s.tenantId}/export`)).statusCode).toBe(403);
    const res = await sys.get(`/api/system/tenants/${s.tenantId}/export`);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="Acme-\d{4}-\d{2}-\d{2}\.json"/);
    const data = res.json() as TenantExport;
    expect(data).toMatchObject({ format: 'fg-todo-manager/tenant', version: 1, tenant: { name: 'Acme' } });
    expect(data.todos).toHaveLength(5);
    expect(data.members.map((m) => m.email).sort()).toContain('editor@acme.test');
    expect(data.comments).toHaveLength(1);
    expect(data.history.length).toBeGreaterThan(5);
    expect(JSON.stringify(data)).not.toContain('tenant_id');
    expect(JSON.stringify(data)).not.toContain('password');
    expect((await sys.get('/api/system/tenants/unknown/export')).statusCode).toBe(404);
  });

  it('exports pseudonymized persons without personal data', async () => {
    await s.clients.admin.post(`/api/admin/members/${s.members.reader}/pseudonymize`);
    const data = await exportTenant();
    const pseudo = data.members.find((m) => m.pseudonymized === 1)!;
    expect(pseudo.email).toBeNull();
    expect(pseudo.name).toMatch(/^Pseudonym /);
  });

  it('imports an export as a new tenant with new IDs and intact references', async () => {
    const data = await exportTenant();
    const res = await sys.post('/api/system/tenants/import', { name: 'Acme Copy', data });
    expect(res.statusCode).toBe(201);
    const { id: copyId } = res.json() as { id: string };
    expect(await counts(env, copyId)).toEqual(await counts(env, s.tenantId));

    // no ID was reused
    const copyTodoIds = (await env.db('todos').where({ tenant_id: copyId }).pluck('id')) as string[];
    expect(copyTodoIds.some((id) => Object.values(s.todos).includes(id))).toBe(false);

    // existing accounts got a second membership and see the copy
    const editor = new TestClient(env.app);
    const me = await editor.login('editor@acme.test');
    expect(me.tenants.map((t) => t.name)).toEqual(['Acme', 'Acme Copy']);
    await editor.post('/api/auth/switch-tenant', { tenantId: copyId });
    const todos = (await editor.get('/api/todos?scope=all')).json() as TodoDto[];
    const renamed = todos.find((t) => t.title === 'renamed')!;
    expect(renamed.tags.map((t) => t.name)).toEqual(['ui']);
    expect(renamed.links).toEqual([{ url: 'https://example.com', label: 'Spec' }]);
    expect(renamed.commentCount).toBe(1);
    const history = (await editor.get(`/api/todos/${renamed.id}/history`)).json() as HistoryResponse;
    expect(history.refs.statuses.map((st) => st.key).sort()).toEqual(['backlog', 'in_progress']);
    const filters = (await editor.get('/api/filters')).json() as SavedFilterDto[];
    const projects = (await editor.get('/api/projects')).json() as { id: string; name: string }[];
    expect(filters[0]?.criteria.projectIds).toEqual([projects.find((p) => p.name === 'P Acme')!.id]);
    expect(filters[0]?.criteria.tagIds).toContain('none');

    // the original tenant is untouched
    await editor.post('/api/auth/switch-tenant', { tenantId: s.tenantId });
    expect(((await editor.get(`/api/todos/${s.todos.t1}`)).json() as TodoDto).title).toBe('renamed');
  });

  it('replaces an existing tenant only with the exact name as confirmation', async () => {
    const data = await exportTenant();
    const before = await counts(env, s.tenantId);
    await s.clients.editor.post('/api/todos', { title: 'after export' });

    expect((await sys.post(`/api/system/tenants/${s.tenantId}/replace`, { confirmName: 'acme', data })).statusCode).toBe(400);
    expect((await sys.post(`/api/system/tenants/${s.tenantId}/replace`, { confirmName: 'Acme', data })).statusCode).toBe(204);
    expect(await counts(env, s.tenantId)).toEqual(before);

    const editor = new TestClient(env.app);
    await editor.login('editor@acme.test');
    const titles = ((await editor.get('/api/todos?scope=all')).json() as TodoDto[]).map((t) => t.title);
    expect(titles).not.toContain('after export');
    expect(titles).toContain('renamed');
  });

  it('rejects invalid or inconsistent files without changing anything', async () => {
    const data = await exportTenant();
    const tenantsBefore = Number(((await env.db('tenants').count({ c: '*' }).first()) as { c: number | string }).c);
    expect((await sys.post('/api/system/tenants/import', { data: { format: 'other' } })).statusCode).toBe(400);
    const broken = { ...data, todos: data.todos.map((t, i) => (i === 0 ? { ...t, status_id: 'missing' } : t)) };
    expect((await sys.post('/api/system/tenants/import', { data: broken })).statusCode).toBe(400);
    expect((await sys.post(`/api/system/tenants/${s.tenantId}/replace`, { confirmName: 'Acme', data: broken })).statusCode).toBe(400);
    const tenantsAfter = Number(((await env.db('tenants').count({ c: '*' }).first()) as { c: number | string }).c);
    expect(tenantsAfter).toBe(tenantsBefore);
    expect((await counts(env, s.tenantId)).todos).toBe(5);
  });

  it('imports into another installation; persons set their password via "forgot password"', async () => {
    const data = await exportTenant();
    const other = await createTestEnv();
    try {
      await createUser(other.db, { email: 'root@example.com', systemAdmin: true });
      const root = new TestClient(other.app);
      await root.login('root@example.com');
      expect((await root.post('/api/system/tenants/import', { data })).statusCode).toBe(201);

      const anon = new TestClient(other.app);
      expect((await anon.post('/api/auth/login', { email: 'editor@acme.test', password: TEST_PASSWORD })).statusCode).toBe(401);
      await anon.post('/api/auth/forgot', { email: 'editor@acme.test' });
      const token = tokenFromMail(other.mails, '/reset/');
      expect((await anon.post('/api/auth/reset', { token, password: 'new-password-123' })).statusCode).toBe(204);
      const me = (await new TestClient(other.app).login('editor@acme.test', 'new-password-123')) as MeResponse;
      expect(me.activeTenant?.name).toBe('Acme');
    } finally {
      await other.close();
    }
  });
});
