import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PROJECT_ROLES, type ProjectDto, type ProjectMemberDto } from '@fg/shared';
import { now } from '../../db/knex.js';
import { notFound } from '../../lib/errors.js';
import { idParam, pickDefined } from '../../lib/http.js';
import { parse } from '../../lib/validate.js';
import {
  effectiveRole,
  isProjectManager,
  loadProjectRoles,
  requireProjectManager,
} from '../../permissions/index.js';
import { getTenant, requireTenant, scoped } from '../../tenancy/context.js';
import type { TenantContext } from '../../types.js';

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  archived_at: string | null;
}

const projectBody = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).nullable().optional(),
});

/** Projects (§7): create, edit, archive/restore and project roles of members. */
export function projectRoutes(app: FastifyInstance): void {
  const opts = { preHandler: requireTenant };
  const db = () => app.deps.db;

  const findProject = async (ctx: TenantContext, id: string) => {
    const project = (await scoped(db(), ctx, 'projects').where({ id }).first()) as ProjectRow | undefined;
    if (!project) throw notFound();
    return project;
  };

  app.get('/api/projects', opts, async (req): Promise<ProjectDto[]> => {
    const ctx = getTenant(req);
    const { includeArchived } = parse(z.object({ includeArchived: z.enum(['0', '1']).optional() }), req.query);
    const roles = await loadProjectRoles(db(), ctx);
    const query = scoped(db(), ctx, 'projects').orderBy('name');
    if (includeArchived !== '1') query.whereNull('archived_at');
    // Members only see projects with a role; project managers see all projects.
    if (!isProjectManager(ctx)) query.whereIn('id', [...roles.keys()]);
    const rows = (await query.select('id', 'name', 'description', 'archived_at')) as ProjectRow[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      archived: r.archived_at !== null,
      myRole: effectiveRole(ctx, roles, r.id),
    }));
  });

  app.post('/api/projects', opts, async (req, reply) => {
    const ctx = getTenant(req);
    requireProjectManager(ctx);
    const body = parse(projectBody, req.body);
    const id = randomUUID();
    const ts = now();
    await db()('projects').insert({
      id,
      tenant_id: ctx.tenantId,
      name: body.name,
      description: body.description ?? null,
      created_by: ctx.membershipId,
      created_at: ts,
      updated_at: ts,
    });
    return reply.code(201).send({ id });
  });

  app.patch('/api/projects/:id', opts, async (req, reply) => {
    const ctx = getTenant(req);
    requireProjectManager(ctx);
    const { id } = parse(idParam, req.params);
    const body = parse(projectBody.partial(), req.body);
    await findProject(ctx, id);
    await scoped(db(), ctx, 'projects')
      .where({ id })
      .update({ ...pickDefined(body, { name: 'name', description: 'description' }), updated_at: now() });
    return reply.code(204).send();
  });

  // Archiving hides the project and all its To-Dos; nothing is deleted.
  app.post('/api/projects/:id/archive', opts, async (req, reply) => {
    const ctx = getTenant(req);
    requireProjectManager(ctx);
    const { id } = parse(idParam, req.params);
    await findProject(ctx, id);
    await scoped(db(), ctx, 'projects').where({ id }).update({ archived_at: now(), updated_at: now() });
    return reply.code(204).send();
  });

  app.post('/api/projects/:id/restore', opts, async (req, reply) => {
    const ctx = getTenant(req);
    requireProjectManager(ctx);
    const { id } = parse(idParam, req.params);
    await findProject(ctx, id);
    await scoped(db(), ctx, 'projects').where({ id }).update({ archived_at: null, updated_at: now() });
    return reply.code(204).send();
  });

  app.get('/api/projects/:id/members', opts, async (req): Promise<ProjectMemberDto[]> => {
    const ctx = getTenant(req);
    requireProjectManager(ctx);
    const { id } = parse(idParam, req.params);
    await findProject(ctx, id);
    return (await scoped(db(), ctx, 'project_members', 'pm')
      .join('memberships as m', 'm.id', 'pm.membership_id')
      .where({ 'pm.project_id': id })
      .orderBy('m.display_name')
      .select('pm.membership_id as membershipId', 'm.display_name as displayName', 'pm.role')) as ProjectMemberDto[];
  });

  app.put('/api/projects/:id/members/:membershipId', opts, async (req, reply) => {
    const ctx = getTenant(req);
    requireProjectManager(ctx);
    const { id, membershipId } = parse(
      z.object({ id: z.string().max(64), membershipId: z.string().max(64) }),
      req.params,
    );
    const { role } = parse(z.object({ role: z.enum(PROJECT_ROLES) }), req.body);
    await findProject(ctx, id);
    const membership = await scoped(db(), ctx, 'memberships').where({ id: membershipId }).first();
    if (!membership) throw notFound();
    const existing = await scoped(db(), ctx, 'project_members').where({ project_id: id, membership_id: membershipId }).first();
    if (existing) {
      await scoped(db(), ctx, 'project_members').where({ project_id: id, membership_id: membershipId }).update({ role });
    } else {
      await db()('project_members').insert({
        id: randomUUID(),
        tenant_id: ctx.tenantId,
        project_id: id,
        membership_id: membershipId,
        role,
        created_at: now(),
      });
    }
    return reply.code(204).send();
  });

  app.delete('/api/projects/:id/members/:membershipId', opts, async (req, reply) => {
    const ctx = getTenant(req);
    requireProjectManager(ctx);
    const { id, membershipId } = parse(
      z.object({ id: z.string().max(64), membershipId: z.string().max(64) }),
      req.params,
    );
    await findProject(ctx, id);
    const count = await scoped(db(), ctx, 'project_members').where({ project_id: id, membership_id: membershipId }).delete();
    if (count === 0) throw notFound();
    return reply.code(204).send();
  });
}
