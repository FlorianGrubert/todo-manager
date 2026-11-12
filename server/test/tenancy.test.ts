import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addMembership, createTenant, createTestEnv, createUser, TestClient, type TestEnv } from './helpers.js';

describe('tenants and tenant switching', () => {
  let env: TestEnv;
  let tenantA: string;
  let tenantB: string;
  let tenantC: string;

  beforeEach(async () => {
    env = await createTestEnv();
    tenantA = await createTenant(env.db, 'Alpha');
    tenantB = await createTenant(env.db, 'Beta');
    tenantC = await createTenant(env.db, 'Gamma');
    const user = await createUser(env.db, { email: 'multi@example.com' });
    await addMembership(env.db, tenantA, user);
    await addMembership(env.db, tenantB, user);
    const other = await createUser(env.db, { email: 'other@example.com' });
    await addMembership(env.db, tenantC, other);
  });
  afterEach(async () => env.close());

  it('lists only own tenants and opens the last used one', async () => {
    const client = new TestClient(env.app);
    const me = await client.login('multi@example.com');
    expect(me.tenants.map((t) => t.name)).toEqual(['Alpha', 'Beta']);
    expect(me.activeTenant?.id).toBe(tenantA);

    const switched = await client.post('/api/auth/switch-tenant', { tenantId: tenantB });
    expect(switched.statusCode).toBe(200);
    expect(switched.json().activeTenant.id).toBe(tenantB);

    const again = await new TestClient(env.app).login('multi@example.com');
    expect(again.activeTenant?.id).toBe(tenantB);
  });

  it('never switches into a foreign tenant', async () => {
    const client = new TestClient(env.app);
    await client.login('multi@example.com');
    const res = await client.post('/api/auth/switch-tenant', { tenantId: tenantC });
    expect(res.statusCode).toBe(404);
    const unknown = await client.post('/api/auth/switch-tenant', { tenantId: 'does-not-exist' });
    expect(unknown.statusCode).toBe(404);
    expect(res.json()).toEqual(unknown.json());
    expect((await client.get('/api/auth/me')).json().activeTenant.id).toBe(tenantA);
  });

  it('hides deactivated tenants', async () => {
    await env.db('tenants').where({ id: tenantA }).update({ is_active: 0 });
    const me = await new TestClient(env.app).login('multi@example.com');
    expect(me.tenants.map((t) => t.id)).toEqual([tenantB]);
    expect(me.activeTenant?.id).toBe(tenantB);
  });

  it('records the last login per membership only for the entered tenant', async () => {
    await new TestClient(env.app).login('multi@example.com');
    const rows = (await env.db('memberships').whereIn('tenant_id', [tenantA, tenantB]).select('tenant_id', 'last_login_at')) as {
      tenant_id: string;
      last_login_at: string | null;
    }[];
    expect(rows.find((r) => r.tenant_id === tenantA)?.last_login_at).toBeTruthy();
    expect(rows.find((r) => r.tenant_id === tenantB)?.last_login_at).toBeNull();
  });
});
