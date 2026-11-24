import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CommentDto, HistoryResponse, TodoDto } from '@fg/shared';
import { now } from '../src/db/knex.js';
import { createTestEnv, type TestEnv } from './helpers.js';
import { allowTokens, call, connectMcp, createToken } from './mcp-helpers.js';
import { buildScenario, type Scenario } from './scenario.js';

const INIT = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'raw', version: '1' } },
};
const MCP_HEADERS = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };

describe('MCP server', () => {
  let env: TestEnv;
  let s: Scenario;

  beforeEach(async () => {
    env = await createTestEnv({ MCP_ENABLED: 'true' });
    s = await buildScenario(env);
    await allowTokens(s.clients.admin);
  });
  afterEach(async () => env.close());

  const mcpFor = async (who: keyof Scenario['clients'], body: Parameters<typeof createToken>[1] = {}) =>
    connectMcp(env.app, (await createToken(s.clients[who], body)).token);

  it('offers the tools according to the token scope', async () => {
    const names = async (scope: 'read' | 'write') =>
      (await (await mcpFor('editor', { scope })).listTools()).tools.map((t) => t.name).sort();
    expect(await names('read')).toEqual(['get_changes_since', 'get_overview', 'get_todo', 'list_reference_data', 'search_todos']);
    expect(await names('write')).toEqual([
      'add_comment',
      'cancel_todo',
      'create_todo',
      'get_changes_since',
      'get_overview',
      'get_todo',
      'list_reference_data',
      'search_todos',
      'update_todo',
    ]);
    const tools = (await (await mcpFor('editor')).listTools()).tools;
    expect(tools.find((t) => t.name === 'cancel_todo')?.annotations?.destructiveHint).toBe(true);
    expect(tools.find((t) => t.name === 'search_todos')?.annotations?.readOnlyHint).toBe(true);
  });

  it('lists the reference data with names in the user language', async () => {
    const data = await call(await mcpFor('editor'), 'list_reference_data');
    expect(data.statuses.map((x: { name: string }) => x.name)).toContain('In Arbeit');
    expect(data.priorities.map((x: { name: string }) => x.name)).toEqual(['Kritisch', 'Hoch', 'Mittel', 'Niedrig']);
    // Only visible projects: editor has a role in P, not in Q.
    expect(data.projects.map((x: { name: string }) => x.name)).toEqual(['P Acme']);
  });

  it('creates To-Dos by names, marks them as made via MCP and is idempotent', async () => {
    const mcp = await mcpFor('editor', { name: 'Claude Laptop' });
    const args = { title: 'Impressum prüfen', project: 'p acme', priority: 'Hoch', assignee: 'me', dueDate: '2030-01-31', tags: ['Web'], idempotencyKey: 'k1' };
    const first = await call(mcp, 'create_todo', args);
    expect(first.created).toBe(true);
    expect(first.todo).toMatchObject({
      title: 'Impressum prüfen',
      project: 'P Acme',
      priority: 'Hoch',
      status: 'Backlog',
      assignee: 'editor (Acme)',
      tags: ['Web'],
      link: `http://localhost:3000/todos/${first.todo.id}`,
    });
    const again = await call(mcp, 'create_todo', args);
    expect(again).toMatchObject({ created: false, todo: { id: first.todo.id } });

    const history = (await s.clients.editor.get(`/api/todos/${first.todo.id}/history`)).json() as HistoryResponse;
    expect(history.entries[0]).toMatchObject({ field: 'created', via: 'Claude Laptop' });
  });

  it('answers unknown names with the valid values', async () => {
    const res = await call(await mcpFor('editor'), 'create_todo', { title: 'x', status: 'Fertig' });
    expect(res.error).toContain('Fertig');
    expect(res.error).toContain('In Arbeit');
  });

  it('updates, comments and cancels with history and comment marked via MCP', async () => {
    const mcp = await mcpFor('editor', { name: 'Bot' });
    const updated = await call(mcp, 'update_todo', { id: `http://localhost:3000/todos/${s.todos.t1}`, status: 'in arbeit', description: 'Neu' });
    expect(updated.todo).toMatchObject({ status: 'In Arbeit', description: 'Neu' });
    expect(await call(mcp, 'add_comment', { id: s.todos.t1, text: 'Warte auf Rückmeldung' })).toHaveProperty('commentId');
    const comments = (await s.clients.editor.get(`/api/todos/${s.todos.t1}/comments`)).json() as CommentDto[];
    expect(comments.at(-1)).toMatchObject({ body: 'Warte auf Rückmeldung', via: 'Bot' });

    const cancelled = await call(mcp, 'cancel_todo', { id: s.todos.t1 });
    expect(cancelled.category).toBe('cancelled');

    const full = await call(mcp, 'get_todo', { id: s.todos.t1, includeHistory: true });
    expect(full.comments[0]).toMatchObject({ text: 'Warte auf Rückmeldung', viaMcp: 'Bot' });
    expect(full.history.find((h: { field: string; to: string }) => h.field === 'status' && h.to === 'In Arbeit')).toMatchObject({
      from: 'Backlog',
      viaMcp: 'Bot',
    });
  });

  it('respects project roles and treats invisible To-Dos as not found', async () => {
    const restricted = await mcpFor('restricted');
    expect((await call(restricted, 'get_todo', { id: s.todos.t1 })).error).toMatch(/Nicht gefunden/);
    const search = await call(restricted, 'search_todos', {});
    expect(search.todos.map((t: { title: string }) => t.title).sort()).toEqual(['t2', 't3']);
    // Restricted editors may only assign themselves.
    expect((await call(restricted, 'update_todo', { id: s.todos.t3, assignee: 'editor (Acme)' })).error).toMatch(/Berechtigung/);

    const reader = await mcpFor('reader');
    expect((await call(reader, 'update_todo', { id: s.todos.t1, title: 'x' })).error).toMatch(/Berechtigung/);
    // Readers may comment like in the user interface.
    expect(await call(reader, 'add_comment', { id: s.todos.t1, text: 'Frage' })).toHaveProperty('commentId');
  });

  it('restricts "own To-Dos only" tokens to To-Dos assigned to or created by the member', async () => {
    const mcp = await mcpFor('editor', { ownOnly: true });
    // t1: assigned to editor, t3: created by editor, t2: created by restricted and unassigned.
    expect((await call(mcp, 'update_todo', { id: s.todos.t1, title: 'ok' })).todo.title).toBe('ok');
    expect((await call(mcp, 'update_todo', { id: s.todos.t3, title: 'ok too' })).todo.title).toBe('ok too');
    expect((await call(mcp, 'update_todo', { id: s.todos.t2, title: 'no' })).error).toMatch(/Berechtigung/);
    expect((await call(mcp, 'add_comment', { id: s.todos.t2, text: 'no' })).error).toMatch(/Berechtigung/);
    expect((await call(mcp, 'create_todo', { title: 'x', assignee: 'reader (Acme)' })).error).toMatch(/Berechtigung/);
    // Reading is not restricted.
    expect((await call(mcp, 'get_todo', { id: s.todos.t2 })).todo.title).toBe('t2');
  });

  it('never shows data of another tenant', async () => {
    const other = await buildScenario(env, 'Other');
    const mcp = await mcpFor('admin');
    expect((await call(mcp, 'get_todo', { id: other.todos.t1 })).error).toMatch(/Nicht gefunden/);
    expect((await call(mcp, 'update_todo', { id: other.todos.t1, title: 'x' })).error).toMatch(/Nicht gefunden/);
    const all = await call(mcp, 'search_todos', { limit: 100 });
    expect(all.todos.map((t: { title: string }) => t.title).sort()).toEqual(['t1', 't2', 't3', 't4', 't5']);
    expect((await call(mcp, 'create_todo', { title: 'x', project: `P Other` })).error).toMatch(/P Other/);
  });

  it('searches with filters and pages with a cursor', async () => {
    const mcp = await mcpFor('admin');
    await s.clients.admin.patch(`/api/todos/${s.todos.t1}`, { dueDate: '2000-01-01' });
    expect((await call(mcp, 'search_todos', { overdue: true })).todos.map((t: { title: string }) => t.title)).toEqual(['t1']);
    expect((await call(mcp, 'search_todos', { project: ['none'] })).todos.map((t: { title: string }) => t.title)).toEqual(['t5']);
    expect((await call(mcp, 'search_todos', { scope: 'mine' })).todos).toEqual([]);

    const page1 = await call(mcp, 'search_todos', { limit: 2, sort: 'createdAt' });
    expect(page1).toMatchObject({ hasMore: true, nextCursor: '2' });
    const page2 = await call(mcp, 'search_todos', { limit: 2, sort: 'createdAt', cursor: page1.nextCursor });
    const page3 = await call(mcp, 'search_todos', { limit: 2, sort: 'createdAt', cursor: page2.nextCursor });
    expect(page3.hasMore).toBe(false);
    const seen = [...page1.todos, ...page2.todos, ...page3.todos].map((t: { title: string }) => t.title);
    expect(seen).toEqual(['t1', 't2', 't3', 't4', 't5']);

    await call(mcp, 'cancel_todo', { id: s.todos.t5 });
    expect((await call(mcp, 'search_todos', { project: ['none'] })).todos).toEqual([]);
    expect((await call(mcp, 'search_todos', { project: ['none'], category: ['cancelled'] })).todos).toHaveLength(1);
  });

  it('gives an overview of due To-Dos', async () => {
    const mcp = await mcpFor('editor');
    const today = (await call(mcp, 'list_reference_data')).today as string;
    await s.clients.editor.patch(`/api/todos/${s.todos.t1}`, { dueDate: '2000-01-01' });
    const t = await call(mcp, 'create_todo', { title: 'heute', assignee: 'me', dueDate: today });
    const overview = await call(mcp, 'get_overview', {});
    expect(overview.overdue.todos.map((x: { title: string }) => x.title)).toEqual(['t1']);
    expect(overview.dueToday.todos.map((x: { id: string }) => x.id)).toEqual([t.todo.id]);
    expect(overview.openTotal).toBe(2);
    expect(overview.byStatus).toEqual([{ status: 'Backlog', count: 2 }]);
  });

  it('reports changes and comments since a point in time', async () => {
    const mcp = await mcpFor('editor', { name: 'Bot' });
    const since = new Date(Date.now() - 1000).toISOString();
    await call(mcp, 'update_todo', { id: s.todos.t1, priority: 'Kritisch' });
    await s.clients.reader.post(`/api/todos/${s.todos.t1}/comments`, { body: 'Hallo' });
    const changes = await call(mcp, 'get_changes_since', { since });
    expect(changes.changes.find((c: { field: string }) => c.field === 'priority')).toMatchObject({ to: 'Kritisch', viaMcp: 'Bot', title: 't1' });
    expect(changes.comments).toEqual([expect.objectContaining({ text: 'Hallo', viaMcp: null, by: 'reader (Acme)' })]);
    // The restricted editor does not learn about t1.
    const restricted = await call(await mcpFor('restricted'), 'get_changes_since', { since });
    expect(restricted.changes.map((c: { title: string }) => c.title).sort()).toEqual(['t2', 't3']);
    expect(restricted.comments).toEqual([]);
    expect((await call(mcp, 'get_changes_since', { since: '2000-01-01T00:00:00Z' })).error).toMatch(/30 Tage/);
  });

  it('works for clients speaking the 2025 protocol without session', async () => {
    const { token } = await createToken(s.clients.editor);
    const res = await env.app.inject({ method: 'POST', url: '/mcp', headers: { ...MCP_HEADERS, authorization: `Bearer ${token}` }, payload: INIT });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('fg-todo-manager');
    expect(res.headers['mcp-session-id']).toBeUndefined();
  });

  it('rejects requests without a valid token or from foreign origins', async () => {
    const post = (headers: Record<string, string>) => env.app.inject({ method: 'POST', url: '/mcp', headers: { ...MCP_HEADERS, ...headers }, payload: INIT });
    const none = await post({});
    expect(none.statusCode).toBe(401);
    expect(none.headers['www-authenticate']).toContain('Bearer');
    expect((await post({ authorization: 'Bearer fgtm_pat_invalid' })).statusCode).toBe(401);
    const { token } = await createToken(s.clients.editor);
    expect((await post({ authorization: `Bearer ${token}`, origin: 'https://evil.example' })).statusCode).toBe(403);
    // A token is no session: it does not work for the REST API.
    expect((await env.app.inject({ method: 'GET', url: '/api/todos', headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(401);
  });
});

describe('MCP rate limits', () => {
  let env: TestEnv;
  afterEach(async () => env.close());

  it('limits writing calls to a third of the request limit', async () => {
    env = await createTestEnv({ MCP_ENABLED: 'true', MCP_RATE_LIMIT: '6' });
    const s = await buildScenario(env);
    await allowTokens(s.clients.admin);
    const mcp = await connectMcp(env.app, (await createToken(s.clients.editor)).token);
    expect((await call(mcp, 'create_todo', { title: 'a' })).todo).toBeDefined();
    expect((await call(mcp, 'create_todo', { title: 'b' })).todo).toBeDefined();
    expect((await call(mcp, 'create_todo', { title: 'c' })).error).toMatch(/Zu viele/);
  });
});

describe('access tokens', () => {
  let env: TestEnv;
  let s: Scenario;

  beforeEach(async () => {
    env = await createTestEnv({ MCP_ENABLED: 'true' });
    s = await buildScenario(env);
  });
  afterEach(async () => env.close());

  const initWith = (token: string) =>
    env.app.inject({ method: 'POST', url: '/mcp', headers: { ...MCP_HEADERS, authorization: `Bearer ${token}` }, payload: INIT });

  it('can only be created when the tenant administrator allows them', async () => {
    expect((await s.clients.editor.get('/api/auth/me')).json().mcp).toMatchObject({ enabled: true, tenantAllowed: false });
    const denied = await s.clients.editor.post('/api/tokens', { name: 'x', scope: 'read' });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({ error: 'tokens_not_allowed' });
    expect((await s.clients.editor.put('/api/admin/tokens/settings', { allowed: true })).statusCode).toBe(403);
    await allowTokens(s.clients.admin);
    expect((await s.clients.editor.get('/api/auth/me')).json().mcp.tenantAllowed).toBe(true);

    const created = await createToken(s.clients.editor, { name: 'Laptop', scope: 'read', days: 10 });
    expect(created.token).toMatch(/^fgtm_pat_/);
    const list = (await s.clients.editor.get('/api/tokens')).json();
    expect(list).toEqual([expect.objectContaining({ name: 'Laptop', scope: 'read', tenantName: 'Acme', expired: false })]);
    expect(JSON.stringify(list)).not.toContain(created.token);
    expect((await env.db('access_tokens').first('token_hash')).token_hash).not.toBe(created.token);
    // Longer than MCP_TOKEN_MAX_DAYS is rejected.
    expect((await s.clients.editor.post('/api/tokens', { name: 'x', scope: 'read', days: 9999 })).statusCode).toBe(400);
  });

  it('become invalid on revocation, expiry, deactivation, tenant setting and password reset', async () => {
    await allowTokens(s.clients.admin);
    const valid = async (token: string) => (await initWith(token)).statusCode === 200;

    const revoked = await createToken(s.clients.editor);
    expect(await valid(revoked.token)).toBe(true);
    expect((await s.clients.editor.delete(`/api/tokens/${revoked.id}`)).statusCode).toBe(204);
    expect(await valid(revoked.token)).toBe(false);

    const expired = await createToken(s.clients.editor);
    await env.db('access_tokens').where({ id: expired.id }).update({ expires_at: '2000-01-01T00:00:00.000Z' });
    expect(await valid(expired.token)).toBe(false);

    const byAdmin = await createToken(s.clients.reader);
    const adminList = (await s.clients.admin.get('/api/admin/tokens')).json();
    expect(adminList.find((t: { id: string }) => t.id === byAdmin.id)).toMatchObject({ member: { displayName: 'reader (Acme)' } });
    expect((await s.clients.editor.get('/api/admin/tokens')).statusCode).toBe(403);
    expect((await s.clients.admin.delete(`/api/admin/tokens/${byAdmin.id}`)).statusCode).toBe(204);
    expect(await valid(byAdmin.token)).toBe(false);

    const deactivated = await createToken(s.clients.reader);
    await env.db('memberships').where({ id: s.members.reader }).update({ is_active: 0 });
    expect(await valid(deactivated.token)).toBe(false);

    const tenantOff = await createToken(s.clients.editor);
    await s.clients.admin.put('/api/admin/tokens/settings', { allowed: false });
    expect(await valid(tenantOff.token)).toBe(false);
    await allowTokens(s.clients.admin);
    expect(await valid(tenantOff.token)).toBe(true);

    const userId = (await env.db('memberships').where({ id: s.members.editor }).first('user_id')).user_id as string;
    await env.db('password_resets').insert({
      id: randomUUID(),
      user_id: userId,
      token_hash: (await import('../src/lib/tokens.js')).sha256('reset-token'),
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      created_at: now(),
    });
    const reset = await env.app.inject({ method: 'POST', url: '/api/auth/reset', payload: { token: 'reset-token', password: 'another-long-password' } });
    expect(reset.statusCode).toBe(204);
    expect(await valid(tenantOff.token)).toBe(false);
  });

  it('marks changes in the REST history only when made via MCP', async () => {
    await s.clients.editor.patch(`/api/todos/${s.todos.t1}`, { title: 'by hand' });
    const history = (await s.clients.editor.get(`/api/todos/${s.todos.t1}/history`)).json() as HistoryResponse;
    expect(history.entries.every((e) => e.via === null)).toBe(true);
    const todo = (await s.clients.editor.get(`/api/todos/${s.todos.t1}`)).json() as TodoDto;
    expect(todo.title).toBe('by hand');
  });
});

describe('MCP disabled', () => {
  it('offers neither the endpoint nor token creation', async () => {
    const env = await createTestEnv();
    try {
      const s = await buildScenario(env);
      await allowTokens(s.clients.admin);
      expect((await s.clients.editor.post('/api/tokens', { name: 'x', scope: 'read' })).statusCode).toBe(404);
      expect((await env.app.inject({ method: 'POST', url: '/mcp', headers: MCP_HEADERS, payload: INIT })).statusCode).toBe(404);
      expect((await s.clients.editor.get('/api/auth/me')).json().mcp.enabled).toBe(false);
    } finally {
      await env.close();
    }
  });
});
