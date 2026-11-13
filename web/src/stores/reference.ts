import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { MemberDto, PriorityDto, ProjectDto, StatusDto, TagDto } from '@fg/shared';
import { ApiError, get } from '../api/client';
import { i18n } from '../i18n';
import { useOfflineStore } from './offline';

interface ReferenceSnapshot {
  statuses: StatusDto[];
  priorities: PriorityDto[];
  tags: TagDto[];
  members: MemberDto[];
  projects: ProjectDto[];
}

/** Tenant reference data (statuses, priorities, tags, members, projects). */
export const useReferenceStore = defineStore('reference', () => {
  const statuses = ref<StatusDto[]>([]);
  const priorities = ref<PriorityDto[]>([]);
  const tags = ref<TagDto[]>([]);
  const members = ref<MemberDto[]>([]);
  const projects = ref<ProjectDto[]>([]);
  const loadedFor = ref<string | null>(null);

  const statusById = computed(() => new Map(statuses.value.map((s) => [s.id, s])));
  const priorityById = computed(() => new Map(priorities.value.map((p) => [p.id, p])));
  const memberById = computed(() => new Map(members.value.map((m) => [m.id, m])));
  const projectById = computed(() => new Map(projects.value.map((p) => [p.id, p])));

  function assign(snapshot: ReferenceSnapshot): void {
    statuses.value = snapshot.statuses;
    priorities.value = snapshot.priorities;
    tags.value = snapshot.tags;
    members.value = snapshot.members;
    projects.value = snapshot.projects;
  }

  async function load(tenantId: string, force = false): Promise<void> {
    if (!force && loadedFor.value === tenantId) return;
    const offline = useOfflineStore();
    try {
      const [s, p, t, m, pr] = await Promise.all([
        get<StatusDto[]>('/api/statuses'),
        get<PriorityDto[]>('/api/priorities'),
        get<TagDto[]>('/api/tags'),
        get<MemberDto[]>('/api/members'),
        get<ProjectDto[]>('/api/projects?includeArchived=1'),
      ]);
      const snapshot = { statuses: s, priorities: p, tags: t, members: m, projects: pr };
      assign(snapshot);
      void offline.saveCache('reference', snapshot);
    } catch (err) {
      const cached = err instanceof ApiError && err.code === 'network' ? await offline.readCache<ReferenceSnapshot>('reference') : undefined;
      if (!cached) throw err;
      assign(cached.data);
    }
    loadedFor.value = tenantId;
  }

  async function reloadTags(): Promise<void> {
    tags.value = await get<TagDto[]>('/api/tags');
  }

  function reset(): void {
    loadedFor.value = null;
  }

  return {
    statuses,
    priorities,
    tags,
    members,
    projects,
    statusById,
    priorityById,
    memberById,
    projectById,
    load,
    reloadTags,
    reset,
  };
});

/** Display name of a status/priority: custom name, otherwise the translated standard name. */
export function refLabel(kind: 'status' | 'priority', item: { key: string | null; name: string | null } | undefined): string {
  if (!item) return '—';
  if (item.name) return item.name;
  return item.key ? i18n.global.t(`${kind}.${item.key}`) : '—';
}
