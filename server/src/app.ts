import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { authRoutes } from './auth/routes.js';
import type { Config } from './config.js';
import type { Db } from './db/knex.js';
import { EventBus } from './events/bus.js';
import { ApiError } from './lib/errors.js';
import { TaskQueue } from './lib/queue.js';
import { createMailer, type Mailer } from './mail/mailer.js';
import { eventRoutes, publishReferenceChanges } from './modules/events/routes.js';
import { memberRoutes } from './modules/members/routes.js';
import { projectRoutes } from './modules/projects/routes.js';
import { referenceRoutes } from './modules/reference/routes.js';
import { systemRoutes } from './modules/system/routes.js';
import { todoExtraRoutes } from './modules/todos/extra-routes.js';
import { todoRoutes } from './modules/todos/routes.js';
import { registerAuthContext } from './tenancy/context.js';
import './types.js';

export interface BuildAppOptions {
  config: Config;
  db: Db;
  mailer?: Mailer;
  logger?: FastifyServerOptions['logger'];
}

const defaultWebDist = fileURLToPath(new URL('../../web/dist', import.meta.url));

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config, db } = options;
  const app = Fastify({
    logger: options.logger ?? { level: config.LOG_LEVEL },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
  });

  const mailer = options.mailer ?? createMailer(config, app.log);
  const events = new EventBus();
  const queue = new TaskQueue(app.log);
  app.decorate('deps', { config, db, mailer, events, queue });
  app.addHook('onClose', async () => {
    await queue.idle();
  });

  // Only JSON bodies are accepted; plain text/form posts from foreign sites are rejected.
  app.removeContentTypeParser('text/plain');

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.cookieSecure ? [] : null,
      },
    },
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => new ApiError(429, 'rate_limited'),
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ApiError) return reply.code(err.statusCode).send({ error: err.code });
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 429) return reply.code(429).send({ error: 'rate_limited' });
    if (status && status >= 400 && status < 500) return reply.code(status).send({ error: 'bad_request' });
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: 'internal' });
  });

  registerAuthContext(app);

  app.get('/api/health', async () => ({ status: 'ok', version: config.version }));
  authRoutes(app);
  systemRoutes(app);
  referenceRoutes(app);
  projectRoutes(app);
  memberRoutes(app);
  todoExtraRoutes(app);
  todoRoutes(app);
  eventRoutes(app);
  publishReferenceChanges(app);

  const webDist = resolve(config.WEB_DIST ?? defaultWebDist);
  const serveWeb = existsSync(resolve(webDist, 'index.html'));
  if (serveWeb) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false, index: false });
  }

  app.setNotFoundHandler((req, reply) => {
    if (serveWeb && req.method === 'GET' && !req.url.startsWith('/api/')) {
      // Single page app: unknown paths are client routes (e.g. deep links to To-Dos).
      return reply.header('cache-control', 'no-cache').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not_found' });
  });

  return app;
}
