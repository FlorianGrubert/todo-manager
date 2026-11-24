/**
 * MCP endpoint `/mcp` (documentation/mcp-server.md): Streamable HTTP, stateless.
 * Every request carries its access token (`Authorization: Bearer …`); there
 * is no MCP session on the server. The endpoint only exists with MCP_ENABLED.
 */
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createMcpHandler, type AuthInfo } from '@modelcontextprotocol/server';
import { RateWindow } from '../lib/rate-window.js';
import { authenticateToken, type TokenPrincipal } from '../modules/tokens/service.js';
import { createTodoMcpServer } from './tools.js';

const PATH = '/mcp';

function bearer(req: FastifyRequest): string | undefined {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return undefined;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match?.[1];
}

function unauthorized(reply: FastifyReply, baseUrl: string) {
  return reply
    .code(401)
    .header('www-authenticate', `Bearer realm="${new URL(baseUrl).host}"`)
    .send({ error: 'unauthorized' });
}

/** Converts the Fastify request into a web-standard Request for the SDK handler. */
function toWebRequest(req: FastifyRequest, baseUrl: string): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || name === 'content-length') continue;
    headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  // The body was already parsed by Fastify and is handed over as `parsedBody`.
  return new Request(new URL(req.url, baseUrl), { method: req.method, headers });
}

async function sendWebResponse(reply: FastifyReply, res: Response): Promise<void> {
  reply.code(res.status);
  res.headers.forEach((value, name) => {
    if (name !== 'content-length') void reply.header(name, value);
  });
  reply.header('cache-control', 'no-store');
  if (!res.body) return reply.send();
  if (res.headers.get('content-type')?.includes('text/event-stream')) {
    return reply.send(Readable.fromWeb(res.body as unknown as NodeReadableStream));
  }
  return reply.send(Buffer.from(await res.arrayBuffer()));
}

export function mcpRoutes(app: FastifyInstance): void {
  const { config } = app.deps;
  if (!config.MCP_ENABLED) return;

  const allowedOrigin = new URL(config.BASE_URL).origin;
  const failures = new RateWindow(config.AUTH_RATE_LIMIT);
  const requests = new RateWindow(config.MCP_RATE_LIMIT);
  const writes = new RateWindow(Math.max(1, Math.floor(config.MCP_RATE_LIMIT / 3)));

  const handler = createMcpHandler(
    (mcpCtx) => {
      const principal = (mcpCtx.authInfo?.extra as { principal?: TokenPrincipal } | undefined)?.principal;
      if (!principal) throw new Error('MCP request without principal');
      return createTodoMcpServer({
        deps: app.deps,
        principal,
        allowWrite: () => writes.hit(principal.token.id),
        log: app.log,
      });
    },
    { onerror: (err) => app.log.warn({ err }, 'mcp request rejected') },
  );
  app.addHook('onClose', async () => {
    await handler.close();
  });

  app.route({
    method: ['GET', 'POST', 'DELETE'],
    url: PATH,
    handler: async (req, reply) => {
      // Browsers send an Origin header; only the application's own origin may call (DNS rebinding, CSRF).
      const origin = req.headers.origin;
      if (typeof origin === 'string' && origin !== allowedOrigin) return reply.code(403).send({ error: 'forbidden' });

      const ip = req.ip;
      if (failures.exhausted(ip)) return reply.code(429).send({ error: 'rate_limited' });
      const token = bearer(req);
      const principal = token ? await authenticateToken(app.deps.db, token) : undefined;
      if (!principal) {
        failures.hit(ip);
        if (token) req.log.warn({ ip }, 'mcp: invalid access token');
        return unauthorized(reply, config.BASE_URL);
      }
      if (!requests.hit(principal.token.id)) return reply.code(429).send({ error: 'rate_limited' });

      const authInfo: AuthInfo = {
        token: principal.token.id,
        clientId: principal.token.id,
        scopes: [principal.token.scope],
        expiresAt: Math.floor(Date.parse(principal.token.expires_at) / 1000),
        extra: { principal },
      };
      const res = await handler.fetch(toWebRequest(req, config.BASE_URL), { authInfo, parsedBody: req.body });
      return sendWebResponse(reply, res);
    },
  });
}
