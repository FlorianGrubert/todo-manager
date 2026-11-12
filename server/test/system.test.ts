import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addMembership,
  createTenant,
  createTestEnv,
  createUser,
  TEST_PASSWORD,
  TestClient,
  tokenFromMail,
  type TestEnv,
} from './helpers.js';

describe('system administration and invitations', () => {
  let env: TestEnv;
  let sys: TestClient;

  beforeEach(async () => {
    env = await createTestEnv();
    await createUser(env.db, { email: 'root@example.com', systemAdmin: true });
    sys = new TestClient(env.app);
    const me = await sys.login('root@example.com');
    expect(me.user.isSystemAdmin).toBe(true);
    expect(me.activeTenant).toBeNull();
  });
  afterEach(async () => env.close());

  it('forbids system routes for normal users', async () => {
    const tenant = await createTenant(env.db, 'Acme');
    const user = await createUser(env.db, { email: 'admin@acme.test' });
    await addMembership(env.db, tenant, user, { tenantRole: 'admin' });
    const client = new TestClient(env.app);
    await client.login('admin@acme.test');
    expect((await client.get('/api/system/tenants')).statusCode).toBe(403);
    expect((await client.post('/api/system/tenants', { name: 'X', adminEmail: 'x@x.de', adminName: 'X' })).statusCode).toBe(403);
    expect((await new TestClient(env.app).get('/api/system/tenants')).statusCode).toBe(401);
  });

  it('creates a tenant with default statuses/priorities and invites the first admin', async () => {
    const res = await sys.post('/api/system/tenants', { name: 'Acme', adminEmail: 'Boss@Acme.test', adminName: 'Boss', locale: 'en' });
    expect(res.statusCode).toBe(201);
    const { id } = res.json() as { id: string };

    const statuses = await env.db('statuses').where({ tenant_id: id }).orderBy('rank');
    expect(statuses.map((s: { system_key: string }) => s.system_key)).toEqual([
      'backlog',
      'in_progress',
      'under_review',
      'done',
      'rejected',
      'deleted',
    ]);
    const priorities = await env.db('priorities').where({ tenant_id: id }).orderBy('rank');
    expect(priorities.map((p: { system_key: string }) => p.system_key)).toEqual(['critical', 'high', 'medium', 'low']);

    expect(env.mails).toHaveLength(1);
    expect(env.mails[0]?.to).toBe('boss@acme.test');
    expect(env.mails[0]?.subject).toContain('Invitation');

    const list = (await sys.get('/api/system/tenants')).json() as { name: string; memberCount: number }[];
    expect(list).toEqual([expect.objectContaining({ name: 'Acme', memberCount: 1 })]);

    // Accept invitation as new user
    const token = tokenFromMail(env.mails, '/invite/');
    const anon = new TestClient(env.app);
    const info = await anon.get(`/api/invitations/${token}`);
    expect(info.json()).toEqual({ tenantName: 'Acme', email: 'boss@acme.test', needsPassword: true });
    expect((await anon.post(`/api/invitations/${token}/accept`, { password: 'short' })).json()).toEqual({
      error: 'password_too_short',
    });
    const accepted = await anon.post(`/api/invitations/${token}/accept`, { password: 'boss-password-1', name: 'The Boss' });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().activeTenant).toMatchObject({ id, role: 'admin', name: 'Acme' });

    // single use
    expect((await new TestClient(env.app).get(`/api/invitations/${token}`)).statusCode).toBe(404);
    await new TestClient(env.app).login('boss@acme.test', 'boss-password-1');
  });

  it('handles invitations of existing accounts identically for the inviter', async () => {
    const other = await createTenant(env.db, 'Other');
    const existing = await createUser(env.db, { email: 'known@example.com', name: 'Known' });
    await addMembership(env.db, other, existing);

    const resNew = await sys.post('/api/system/tenants', { name: 'T1', adminEmail: 'fresh@example.com', adminName: 'Fresh' });
    const resExisting = await sys.post('/api/system/tenants', { name: 'T2', adminEmail: 'known@example.com', adminName: 'Known' });
    expect(resNew.statusCode).toBe(resExisting.statusCode);
    expect(Object.keys(resNew.json())).toEqual(Object.keys(resExisting.json()));

    // No second user row was created
    const users = await env.db('users').where({ email: 'known@example.com' });
    expect(users).toHaveLength(1);

    // Existing user accepts with the existing password; wrong password is rejected
    const token = tokenFromMail(env.mails, '/invite/');
    const anon = new TestClient(env.app);
    expect((await anon.get(`/api/invitations/${token}`)).json().needsPassword).toBe(false);
    expect((await anon.post(`/api/invitations/${token}/accept`, { password: 'wrong-password' })).statusCode).toBe(401);
    const accepted = await anon.post(`/api/invitations/${token}/accept`, { password: TEST_PASSWORD });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().tenants.map((t: { name: string }) => t.name)).toEqual(['Other', 'T2']);
  });

  it('rejects expired invitations', async () => {
    await sys.post('/api/system/tenants', { name: 'Acme', adminEmail: 'late@example.com', adminName: 'Late' });
    const token = tokenFromMail(env.mails, '/invite/');
    await env.db('invitations').update({ expires_at: new Date(Date.now() - 1000).toISOString() });
    expect((await new TestClient(env.app).get(`/api/invitations/${token}`)).statusCode).toBe(404);
  });

  it('deactivates tenants', async () => {
    const { id } = (await sys.post('/api/system/tenants', { name: 'Acme', adminEmail: 'a@example.com', adminName: 'A' })).json() as {
      id: string;
    };
    expect((await sys.patch(`/api/system/tenants/${id}`, { isActive: false })).statusCode).toBe(204);
    expect((await sys.patch('/api/system/tenants/unknown', { isActive: false })).statusCode).toBe(404);
    const token = tokenFromMail(env.mails, '/invite/');
    expect((await new TestClient(env.app).get(`/api/invitations/${token}`)).statusCode).toBe(404);
  });
});
