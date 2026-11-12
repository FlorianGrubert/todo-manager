import { randomUUID } from 'node:crypto';
import type { StatusDto, TodoDto } from '@fg/shared';
import { now } from '../src/db/knex.js';
import { addMembership, createTenant, createUser, TestClient, type TestEnv } from './helpers.js';

export interface Scenario {
  tenantId: string;
  projectP: string;
  projectQ: string;
  members: Record<'admin' | 'padmin' | 'editor' | 'restricted' | 'reader' | 'outsider', string>;
  clients: Record<'admin' | 'padmin' | 'editor' | 'restricted' | 'reader' | 'outsider', TestClient>;
  todos: Record<'t1' | 't2' | 't3' | 't4' | 't5', string>;
  statuses: StatusDto[];
}

/**
 * Tenant with one member per role:
 * - P: editor=editor, restricted=restricted, reader=reader; Q: nobody (only admin)
 * - default roles (To-Dos without project): editor→editor, restricted→restricted, reader→reader
 * To-Dos: t1 (P, assigned editor), t2 (P, created by restricted, unassigned),
 * t3 (P, assigned restricted, created by editor), t4 (Q), t5 (no project, by editor)
 */
export async function buildScenario(env: TestEnv, name = 'Acme'): Promise<Scenario> {
  const { db, app } = env;
  const prefix = name.toLowerCase();
  const tenantId = await createTenant(db, name);
  const make = async (key: string, tenantRole: string, defaultRole: string) => {
    const userId = await createUser(db, { email: `${key}@${prefix}.test`, name: key });
    return addMembership(db, tenantId, userId, { tenantRole, defaultRole, displayName: `${key} (${name})` });
  };
  const members = {
    admin: await make('admin', 'admin', 'editor'),
    padmin: await make('padmin', 'project_admin', 'none'),
    editor: await make('editor', 'member', 'editor'),
    restricted: await make('restricted', 'member', 'restricted'),
    reader: await make('reader', 'member', 'reader'),
    outsider: await make('outsider', 'member', 'none'),
  };

  const projectP = randomUUID();
  const projectQ = randomUUID();
  const ts = now();
  await db('projects').insert([
    { id: projectP, tenant_id: tenantId, name: `P ${name}`, created_at: ts, updated_at: ts },
    { id: projectQ, tenant_id: tenantId, name: `Q ${name}`, created_at: ts, updated_at: ts },
  ]);
  await db('project_members').insert(
    (['editor', 'restricted', 'reader'] as const).map((role) => ({
      id: randomUUID(),
      tenant_id: tenantId,
      project_id: projectP,
      membership_id: members[role],
      role,
      created_at: ts,
    })),
  );

  const clients = {} as Scenario['clients'];
  for (const key of Object.keys(members) as (keyof typeof members)[]) {
    clients[key] = new TestClient(app);
    await clients[key].login(`${key}@${prefix}.test`);
  }

  const create = async (client: TestClient, body: object) => {
    const res = await client.post('/api/todos', body);
    if (res.statusCode !== 201) throw new Error(`create failed ${res.statusCode} ${res.body}`);
    return (res.json() as TodoDto).id;
  };
  const todos = {
    t1: await create(clients.editor, { title: 't1', projectId: projectP, assigneeId: members.editor }),
    t2: await create(clients.restricted, { title: 't2', projectId: projectP }),
    t3: await create(clients.editor, { title: 't3', projectId: projectP, assigneeId: members.restricted }),
    t4: await create(clients.admin, { title: 't4', projectId: projectQ }),
    t5: await create(clients.editor, { title: 't5' }),
  };
  const statuses = (await clients.admin.get('/api/statuses')).json() as StatusDto[];
  return { tenantId, projectP, projectQ, members, clients, todos, statuses };
}

export const titles = (list: TodoDto[]) => list.map((t) => t.title).sort();
