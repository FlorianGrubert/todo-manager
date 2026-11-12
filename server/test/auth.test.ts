import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addMembership, createTenant, createTestEnv, createUser, TestClient, tokenFromMail, type TestEnv } from './helpers.js';

describe('authentication', () => {
  let env: TestEnv;
  let tenantId: string;

  beforeEach(async () => {
    env = await createTestEnv();
    tenantId = await createTenant(env.db, 'Acme');
    const userId = await createUser(env.db, { email: 'anna@example.com', name: 'Anna' });
    await addMembership(env.db, tenantId, userId, { displayName: 'Anna A.' });
  });
  afterEach(async () => env.close());

  it('logs in with correct credentials and opens the tenant', async () => {
    const client = new TestClient(env.app);
    const me = await client.login('Anna@Example.com');
    expect(me.user.email).toBe('anna@example.com');
    expect(me.activeTenant?.id).toBe(tenantId);
    expect(me.activeTenant?.displayName).toBe('Anna A.');
    expect(me.csrfToken).toBeTruthy();

    const res = await client.get('/api/auth/me');
    expect(res.statusCode).toBe(200);
  });

  it('rejects wrong password and unknown users with the same generic error', async () => {
    const client = new TestClient(env.app);
    const wrong = await client.post('/api/auth/login', { email: 'anna@example.com', password: 'nope-nope-nope' });
    const unknown = await client.post('/api/auth/login', { email: 'nobody@example.com', password: 'nope-nope-nope' });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual({ error: 'invalid_credentials' });
    expect(unknown.json()).toEqual(wrong.json());
  });

  it('rejects users whose only membership is deactivated', async () => {
    await env.db('memberships').update({ is_active: 0 });
    const res = await new TestClient(env.app).post('/api/auth/login', {
      email: 'anna@example.com',
      password: 'correct-horse-battery',
    });
    expect(res.statusCode).toBe(401);
  });

  it('requires the CSRF token for state-changing requests', async () => {
    const client = new TestClient(env.app);
    await client.login('anna@example.com');
    client.csrf = 'forged';
    const res = await client.patch('/api/auth/me', { locale: 'en' });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'csrf' });
  });

  it('rejects non-JSON bodies', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'text/plain' },
      payload: 'email=anna@example.com',
    });
    expect(res.statusCode).toBe(415);
  });

  it('logs out and invalidates the session', async () => {
    const client = new TestClient(env.app);
    await client.login('anna@example.com');
    const cookie = client.cookie;
    expect((await client.post('/api/auth/logout')).statusCode).toBe(204);
    client.cookie = cookie;
    expect((await client.get('/api/auth/me')).statusCode).toBe(401);
  });

  it('updates the language preference', async () => {
    const client = new TestClient(env.app);
    await client.login('anna@example.com');
    const res = await client.patch('/api/auth/me', { locale: 'en' });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.locale).toBe('en');
  });

  it('resets the password via e-mail link (single use) without revealing accounts', async () => {
    const client = new TestClient(env.app);
    expect((await client.post('/api/auth/forgot', { email: 'nobody@example.com' })).statusCode).toBe(204);
    expect(env.mails).toHaveLength(0);
    expect((await client.post('/api/auth/forgot', { email: 'anna@example.com' })).statusCode).toBe(204);
    expect(env.mails).toHaveLength(1);
    const token = tokenFromMail(env.mails, '/reset/');

    expect((await client.post('/api/auth/reset', { token, password: 'short' })).json()).toEqual({
      error: 'password_too_short',
    });
    expect((await client.post('/api/auth/reset', { token, password: 'a-brand-new-password' })).statusCode).toBe(204);
    expect((await client.post('/api/auth/reset', { token, password: 'another-new-password' })).statusCode).toBe(400);
    await expect(client.login('anna@example.com')).rejects.toThrow();
    await client.login('anna@example.com', 'a-brand-new-password');
  });

  it('changes the password with the current password', async () => {
    const client = new TestClient(env.app);
    await client.login('anna@example.com');
    const bad = await client.post('/api/auth/password', { currentPassword: 'wrong', newPassword: 'new-password-123' });
    expect(bad.statusCode).toBe(401);
    const ok = await client.post('/api/auth/password', {
      currentPassword: 'correct-horse-battery',
      newPassword: 'new-password-123',
    });
    expect(ok.statusCode).toBe(204);
    await new TestClient(env.app).login('anna@example.com', 'new-password-123');
  });
});
