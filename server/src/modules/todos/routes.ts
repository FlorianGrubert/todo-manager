import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { paramsToTodoQuery, type CommentDto, type HistoryResponse, type TodoDto } from '@fg/shared';
import { badRequest } from '../../lib/errors.js';
import { idParam } from '../../lib/http.js';
import { parse } from '../../lib/validate.js';
import { loadProjectRoles } from '../../permissions/index.js';
import { getTenant, requireTenant } from '../../tenancy/context.js';
import { addComment, cancelTodo, createTodo, getHistory, listComments, updateTodo } from './operations.js';
import { listTodoRows } from './query.js';
import { loadVisibleTodo, todoInputSchema, toTodoDtos } from './service.js';

/** REST API for To-Dos; the logic lives in `operations.ts` (shared with the MCP server). */
export function todoRoutes(app: FastifyInstance): void {
  const opts = { preHandler: requireTenant };
  const db = () => app.deps.db;

  app.get('/api/todos', opts, async (req): Promise<TodoDto[]> => {
    const ctx = getTenant(req);
    const filters = paramsToTodoQuery(req.query as Record<string, unknown>);
    const roles = await loadProjectRoles(db(), ctx);
    return toTodoDtos(db(), ctx, roles, await listTodoRows(db(), ctx, roles, filters));
  });

  app.get('/api/todos/:id', opts, async (req): Promise<TodoDto> => {
    const ctx = getTenant(req);
    const { id } = parse(idParam, req.params);
    const roles = await loadProjectRoles(db(), ctx);
    const row = await loadVisibleTodo(db(), ctx, roles, id);
    const [dto] = await toTodoDtos(db(), ctx, roles, [row]);
    return dto!;
  });

  app.post('/api/todos', opts, async (req, reply) => {
    const ctx = getTenant(req);
    const input = parse(todoInputSchema, req.body);
    if (!input.title) throw badRequest();
    const result = await createTodo(app.deps, ctx, { ...input, title: input.title });
    if (!result.created) return reply.code(200).send(result.todo);
    // A restricted editor may create a To-Do that is no longer "own" (cannot happen with assignment rules, but be safe).
    return reply.code(201).send(result.todo ?? { id: result.id });
  });

  app.patch('/api/todos/:id', opts, async (req): Promise<TodoDto> => {
    const ctx = getTenant(req);
    const { id } = parse(idParam, req.params);
    const input = parse(todoInputSchema.omit({ clientId: true }), req.body);
    return updateTodo(app.deps, ctx, id, input);
  });

  /** Cancels a To-Do: sets the status marked as cancel target (§5). */
  app.post('/api/todos/:id/cancel', opts, async (req): Promise<TodoDto> => {
    const ctx = getTenant(req);
    const { id } = parse(idParam, req.params);
    return cancelTodo(app.deps, ctx, id);
  });

  // ---------------- comments (all roles that can see the To-Do) ----------------
  app.get('/api/todos/:id/comments', opts, async (req): Promise<CommentDto[]> => {
    const ctx = getTenant(req);
    const { id } = parse(idParam, req.params);
    return listComments(app.deps, ctx, id);
  });

  app.post('/api/todos/:id/comments', opts, async (req, reply) => {
    const ctx = getTenant(req);
    const { id } = parse(idParam, req.params);
    const { body } = parse(z.object({ body: z.string().trim().min(1).max(10_000) }), req.body);
    return reply.code(201).send(await addComment(app.deps, ctx, id, body));
  });

  // ---------------- history ----------------
  app.get('/api/todos/:id/history', opts, async (req): Promise<HistoryResponse> => {
    const ctx = getTenant(req);
    const { id } = parse(idParam, req.params);
    return getHistory(app.deps, ctx, id);
  });
}
