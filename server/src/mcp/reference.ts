/**
 * Reference data of the tenant as the MCP tools see it: names in the user's
 * language, resolution of names (or IDs) given by the AI, and the compact
 * To-Do representation returned by the tools.
 */
import { NONE, type Locale, type StatusCategory, type TodoDto } from '@fg/shared';
import type { Db } from '../db/knex.js';
import { t } from '../i18n/index.js';
import { effectiveRole, isProjectManager, type RoleMap } from '../permissions/index.js';
import { scoped } from '../tenancy/context.js';
import type { TenantContext } from '../types.js';
import { McpUserError } from './errors.js';

export interface RefStatus {
  id: string;
  name: string;
  category: StatusCategory;
  rank: number;
  isNewDefault: boolean;
  isCancelTarget: boolean;
  removed: boolean;
}
export interface RefPriority {
  id: string;
  name: string;
  rank: number;
  removed: boolean;
}
export interface RefProject {
  id: string;
  name: string;
  archived: boolean;
}
export interface RefPerson {
  id: string;
  name: string;
  isContact: boolean;
  /** Active and assignable in principle (users: accepted; persons without login). */
  active: boolean;
}

export interface Refs {
  locale: Locale;
  statuses: RefStatus[];
  priorities: RefPriority[];
  /** Projects the member may see (§14). */
  projects: RefProject[];
  tags: { id: string; name: string }[];
  /** All memberships of the tenant (names are needed for history and assignees). */
  people: RefPerson[];
}

/** Loads the reference data of the tenant once per tool call. */
export async function loadRefs(db: Db, ctx: TenantContext, roles: RoleMap, locale: Locale): Promise<Refs> {
  const statuses = (await scoped(db, ctx, 'statuses').orderBy('rank')) as {
    id: string;
    system_key: string | null;
    name: string | null;
    rank: number;
    category: StatusCategory;
    is_new_default: number;
    is_cancel_target: number;
    removed_at: string | null;
  }[];
  const priorities = (await scoped(db, ctx, 'priorities').orderBy('rank')) as {
    id: string;
    system_key: string | null;
    name: string | null;
    rank: number;
    removed_at: string | null;
  }[];
  const projectQuery = scoped(db, ctx, 'projects').orderBy('name');
  if (!isProjectManager(ctx)) projectQuery.whereIn('id', [...roles.keys()]);
  const projects = (await projectQuery.select('id', 'name', 'archived_at')) as { id: string; name: string; archived_at: string | null }[];
  const tags = (await scoped(db, ctx, 'tags').orderBy('name').select('id', 'name')) as { id: string; name: string }[];
  const people = (await scoped(db, ctx, 'memberships')
    .orderBy('display_name')
    .select('id', 'display_name', 'kind', 'is_active', 'accepted_at')) as {
    id: string;
    display_name: string;
    kind: string;
    is_active: number;
    accepted_at: string | null;
  }[];
  return {
    locale,
    statuses: statuses.map((s) => ({
      id: s.id,
      name: s.name ?? t(locale, `status.${s.system_key ?? ''}`),
      category: s.category,
      rank: Number(s.rank),
      isNewDefault: Number(s.is_new_default) === 1,
      isCancelTarget: Number(s.is_cancel_target) === 1,
      removed: s.removed_at !== null,
    })),
    priorities: priorities.map((p) => ({
      id: p.id,
      name: p.name ?? t(locale, `priority.${p.system_key ?? ''}`),
      rank: Number(p.rank),
      removed: p.removed_at !== null,
    })),
    // Project administrators see all projects, but may lack To-Do rights in some of them.
    projects: projects
      .filter((p) => isProjectManager(ctx) || effectiveRole(ctx, roles, p.id) !== null)
      .map((p) => ({ id: p.id, name: p.name, archived: p.archived_at !== null })),
    tags,
    people: people.map((m) => ({
      id: m.id,
      name: m.display_name,
      isContact: m.kind === 'contact',
      active: Number(m.is_active) === 1 && (m.kind === 'contact' || m.accepted_at !== null),
    })),
  };
}

const norm = (v: string) => v.trim().toLocaleLowerCase();

/**
 * Finds one entry by ID or (case-insensitive) name. Unknown or ambiguous names
 * produce an error that lists the valid values, so the AI can correct itself.
 */
function pick<T extends { id: string; name: string }>(refs: Refs, kind: string, items: T[], value: string): T {
  const byId = items.find((i) => i.id === value);
  if (byId) return byId;
  const matches = items.filter((i) => norm(i.name) === norm(value));
  if (matches.length === 1) return matches[0]!;
  const valid = [...new Set(items.map((i) => i.name))].join(', ') || '–';
  const kindName = t(refs.locale, `mcp.kinds.${kind}`);
  if (matches.length > 1) {
    throw new McpUserError(t(refs.locale, 'mcp.errors.ambiguous', { kind: kindName, value, ids: matches.map((m) => m.id).join(', ') }));
  }
  throw new McpUserError(t(refs.locale, 'mcp.errors.unknown', { kind: kindName, value, valid }));
}

export const resolveStatus = (refs: Refs, value: string) =>
  pick(refs, 'status', refs.statuses.filter((s) => !s.removed), value).id;

export const resolvePriority = (refs: Refs, value: string) =>
  pick(refs, 'priority', refs.priorities.filter((p) => !p.removed), value).id;

export const resolveProject = (refs: Refs, value: string) => pick(refs, 'project', refs.projects, value).id;

/** `me` (or `ich`) stands for the member itself. */
export function resolvePerson(refs: Refs, ctx: TenantContext, value: string): string {
  if (['me', 'ich'].includes(norm(value))) return ctx.membershipId;
  return pick(refs, 'person', refs.people.filter((p) => p.active), value).id;
}

export const resolveTag = (refs: Refs, value: string) => pick(refs, 'tag', refs.tags, value).id;

/** Resolves a filter list; `none` stands for "without" (§14). */
export function resolveFilter(values: string[] | undefined, resolve: (v: string) => string): string[] {
  return (values ?? []).map((v) => (norm(v) === NONE ? NONE : resolve(v)));
}

/** Accepts a To-Do ID or its deep link (`<BASE_URL>/todos/<ID>`). */
export function todoIdFrom(value: string): string {
  const match = value.trim().match(/\/todos\/([^/?#\s]+)/);
  return match ? match[1]! : value.trim();
}

export const deepLink = (baseUrl: string, id: string) => `${baseUrl.replace(/\/$/, '')}/todos/${id}`;

const nameOf = <T extends { id: string; name: string }>(items: T[], id: string | null) =>
  id === null ? null : (items.find((i) => i.id === id)?.name ?? null);

export function statusOf(refs: Refs, id: string) {
  return refs.statuses.find((s) => s.id === id);
}

/** Compact To-Do for lists. */
export function compactTodo(refs: Refs, baseUrl: string, dto: TodoDto) {
  return {
    id: dto.id,
    title: dto.title,
    status: nameOf(refs.statuses, dto.statusId),
    priority: nameOf(refs.priorities, dto.priorityId),
    project: nameOf(refs.projects, dto.projectId),
    assignee: nameOf(refs.people, dto.assigneeId),
    dueDate: dto.dueDate,
    tags: dto.tags.map((tag) => tag.name),
    link: deepLink(baseUrl, dto.id),
  };
}

/** Full To-Do for `get_todo` and as answer of the writing tools. */
export function fullTodo(refs: Refs, baseUrl: string, dto: TodoDto) {
  return {
    ...compactTodo(refs, baseUrl, dto),
    statusCategory: statusOf(refs, dto.statusId)?.category ?? null,
    description: dto.description,
    links: dto.links,
    createdAt: dto.createdAt,
    createdBy: dto.createdBy.displayName,
    updatedAt: dto.updatedAt,
    updatedBy: dto.updatedBy.displayName,
    commentCount: dto.commentCount,
    canEdit: dto.canEdit,
  };
}

/** Translates IDs in history values into names; project names only for visible projects. */
export function historyValue(refs: Refs, field: string, value: string | null): string | null {
  if (value === null) return null;
  switch (field) {
    case 'status':
      return nameOf(refs.statuses, value) ?? value;
    case 'priority':
      return nameOf(refs.priorities, value) ?? value;
    case 'assignee':
      return nameOf(refs.people, value) ?? value;
    case 'project':
      return nameOf(refs.projects, value) ?? t(refs.locale, 'mcp.hiddenProject');
    default:
      return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }
}
