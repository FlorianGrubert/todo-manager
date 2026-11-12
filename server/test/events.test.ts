import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BoardEvent } from '../src/events/bus.js';
import { createTestEnv, TestClient, type TestEnv } from './helpers.js';
import { buildScenario, type Scenario } from './scenario.js';

/** Opens a real SSE connection and collects the events. */
async function connect(baseUrl: string, client: TestClient) {
  const controller = new AbortController();
  const res = await fetch(`${baseUrl}/api/events`, { headers: { cookie: client.cookie ?? '' }, signal: controller.signal });
  const events: BoardEvent[] = [];
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let index: number;
        while ((index = buffer.indexOf('\n\n')) >= 0) {
          const chunk = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const data = chunk.split('\n').find((l) => l.startsWith('data: '));
          if (data) events.push(JSON.parse(data.slice(6)) as BoardEvent);
        }
      }
    } catch {
      // aborted
    }
  })();
  return { status: res.status, type: res.headers.get('content-type'), events, close: () => controller.abort() };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

describe('live updates (SSE)', () => {
  let env: TestEnv;
  let a: Scenario;
  let b: Scenario;
  let baseUrl: string;

  beforeEach(async () => {
    env = await createTestEnv();
    a = await buildScenario(env, 'Alpha');
    b = await buildScenario(env, 'Beta');
    baseUrl = await env.app.listen({ port: 0, host: '127.0.0.1' });
  });
  afterEach(async () => env.close());

  it('requires a session', async () => {
    const res = await fetch(`${baseUrl}/api/events`);
    expect(res.status).toBe(401);
  });

  it('sends To-Do IDs only to members who may see them and nothing to other tenants', async () => {
    const reader = await connect(baseUrl, a.clients.reader);
    const restricted = await connect(baseUrl, a.clients.restricted);
    const foreign = await connect(baseUrl, b.clients.admin);
    expect(reader.status).toBe(200);
    expect(reader.type).toContain('text/event-stream');
    await settle();

    await a.clients.editor.patch(`/api/todos/${a.todos.t1}`, { title: 'changed' });
    await settle();
    expect(reader.events).toEqual([{ type: 'todos', todoId: a.todos.t1 }]);
    expect(restricted.events).toEqual([{ type: 'todos' }]);
    expect(foreign.events).toEqual([]);

    await a.clients.admin.post('/api/statuses', { name: 'New', rank: 5, color: '#123456', category: 'open' });
    await settle();
    expect(reader.events.at(-1)).toEqual({ type: 'reference' });
    expect(foreign.events).toEqual([]);

    reader.close();
    restricted.close();
    foreign.close();
  });

  it('stops sending after logout', async () => {
    const stream = await connect(baseUrl, a.clients.reader);
    await settle();
    await a.clients.reader.post('/api/auth/logout');
    await a.clients.editor.patch(`/api/todos/${a.todos.t1}`, { title: 'after logout' });
    await settle();
    expect(stream.events).toEqual([]);
    stream.close();
  });
});
