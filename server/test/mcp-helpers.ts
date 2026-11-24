import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { FastifyInstance } from 'fastify';
import type { CreatedAccessTokenDto } from '@fg/shared';
import type { TestClient } from './helpers.js';

/** Routes the fetch calls of the MCP client to the Fastify app (no network). */
function injectFetch(app: FastifyInstance) {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const req = input instanceof Request ? input : new Request(input, init);
    const url = new URL(req.url);
    const headers: Record<string, string> = {};
    req.headers.forEach((value, name) => {
      headers[name] = value;
    });
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text();
    const res = await app.inject({
      method: req.method as 'GET' | 'POST' | 'DELETE',
      url: url.pathname + url.search,
      headers,
      ...(body ? { payload: body } : {}),
    });
    const out = new Headers();
    for (const [name, value] of Object.entries(res.headers)) {
      if (value !== undefined) out.set(name, Array.isArray(value) ? value.join(', ') : String(value));
    }
    const status = res.statusCode;
    return new Response(status === 204 || status === 202 ? null : res.rawPayload, { status, headers: out });
  };
}

/** Connected MCP client using the given access token. */
export async function connectMcp(app: FastifyInstance, token: string): Promise<Client> {
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3000/mcp'), {
    fetch: injectFetch(app),
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
}

/** Calls a tool and parses the JSON text answer; `isError` answers are returned as `{ error }`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tool answers are checked field by field in the tests
export async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<any> {
  const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { type: string; text: string }[] };
  const text = res.content[0]?.text ?? '';
  if (res.isError) return { error: text };
  return JSON.parse(text);
}

/** Allows access tokens in the active tenant (as tenant admin) and creates a token for `who`. */
export async function allowTokens(admin: TestClient): Promise<void> {
  const res = await admin.put('/api/admin/tokens/settings', { allowed: true });
  if (res.statusCode !== 200) throw new Error(`allow tokens failed: ${res.statusCode} ${res.body}`);
}

export async function createToken(
  who: TestClient,
  body: { name?: string; scope?: 'read' | 'write'; ownOnly?: boolean; days?: number } = {},
): Promise<CreatedAccessTokenDto> {
  const res = await who.post('/api/tokens', { name: 'Test', scope: 'write', ...body });
  if (res.statusCode !== 201) throw new Error(`create token failed: ${res.statusCode} ${res.body}`);
  return res.json() as CreatedAccessTokenDto;
}
