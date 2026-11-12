import type { ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import type { BoardEvent } from '../../events/bus.js';
import { loadProjectRoles } from '../../permissions/index.js';
import { getAuth, getTenant, loadMembership, requireTenant } from '../../tenancy/context.js';
import type { TenantContext } from '../../types.js';
import { loadVisibleTodo } from '../todos/service.js';

const HEARTBEAT_MS = 25_000;

/** Prefixes of routes that change tenant reference data (statuses, projects, members …). */
const REFERENCE_ROUTES = ['/api/statuses', '/api/priorities', '/api/tags', '/api/projects', '/api/admin/members'];

/**
 * Server-Sent Events stream for live updates (§9).
 *
 * Every event is checked per subscriber: the session and membership must still
 * be valid, and a To-Do ID is only sent to members who may see that To-Do.
 * Others just learn "To-Dos changed" and reload their view.
 */
export function eventRoutes(app: FastifyInstance): void {
  const streams = new Set<ServerResponse>();

  app.addHook('preClose', async () => {
    for (const stream of streams) stream.end();
    streams.clear();
  });

  app.get('/api/events', { preHandler: requireTenant }, async (req, reply) => {
    const ctx = getTenant(req);
    const auth = getAuth(req);
    const { db, events } = app.deps;

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('retry: 5000\n\n');
    streams.add(res);

    const send = (event: BoardEvent) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const close = () => {
      clearInterval(heartbeat);
      unsubscribe();
      streams.delete(res);
      if (!res.writableEnded) res.end();
    };

    const stillAllowed = async (): Promise<TenantContext | null> => {
      const session = await db('sessions').where({ id: auth.sessionId }).where('expires_at', '>', new Date().toISOString()).first('id');
      if (!session) return null;
      const m = await loadMembership(db, ctx.userId, ctx.tenantId);
      if (!m) return null;
      return { ...ctx, tenantRole: m.tenant_role, defaultRole: m.default_role, displayName: m.display_name };
    };

    const unsubscribe = events.subscribe(ctx.tenantId, async (event) => {
      const current = await stillAllowed();
      if (!current) return close();
      if (event.type === 'todos' && event.todoId) {
        const roles = await loadProjectRoles(db, current);
        const visible = await loadVisibleTodo(db, current, roles, event.todoId).then(
          () => true,
          () => false,
        );
        send(visible ? event : { type: 'todos' });
      } else {
        send(event);
      }
    });

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n');
    }, HEARTBEAT_MS);
    req.raw.on('close', close);
  });
}

/** Publishes a reference-data event after every successful change of reference data. */
export function publishReferenceChanges(app: FastifyInstance): void {
  app.addHook('onResponse', async (req, reply) => {
    if (req.method === 'GET' || reply.statusCode >= 400 || !req.tenant) return;
    const path = req.url.split('?')[0] ?? '';
    if (REFERENCE_ROUTES.some((prefix) => path.startsWith(prefix))) {
      app.deps.events.publish(req.tenant.tenantId, { type: 'reference' });
      // Removing a status/priority also changes To-Dos.
      if (path.endsWith('/remove') || path.includes('/archive') || path.includes('/restore')) {
        app.deps.events.publish(req.tenant.tenantId, { type: 'todos' });
      }
    }
  });
}
