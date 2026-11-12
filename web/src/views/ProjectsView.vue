<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { PROJECT_ROLES, type MemberDto, type ProjectDto, type ProjectMemberDto, type ProjectRole } from '@fg/shared';
import { api, get, patch, post } from '../api/client';
import AppModal from '../components/AppModal.vue';
import { errorKey } from '../i18n';
import { useReferenceStore } from '../stores/reference';
import { useSessionStore } from '../stores/session';

const { t } = useI18n();
const session = useSessionStore();
const reference = useReferenceStore();

const projects = ref<ProjectDto[]>([]);
const showArchived = ref(false);
const error = ref('');
const loading = ref(true);
const editing = ref<{ id: string | null; name: string; description: string } | null>(null);
const membersOf = ref<ProjectDto | null>(null);
const projectMembers = ref<ProjectMemberDto[]>([]);
const allMembers = ref<MemberDto[]>([]);
const addMember = reactive({ membershipId: '', role: 'editor' as ProjectRole });

const isManager = computed(() => ['admin', 'project_admin'].includes(session.activeTenant?.role ?? ''));
const visible = computed(() => projects.value.filter((p) => showArchived.value || !p.archived));
const addable = computed(() => allMembers.value.filter((m) => !projectMembers.value.some((pm) => pm.membershipId === m.id)));

async function run(action: () => Promise<unknown>): Promise<void> {
  error.value = '';
  try {
    await action();
  } catch (err) {
    error.value = t(errorKey(err));
  }
}

async function load(): Promise<void> {
  loading.value = true;
  await run(async () => {
    projects.value = await get<ProjectDto[]>('/api/projects?includeArchived=1');
  });
  loading.value = false;
}

async function refreshAll(): Promise<void> {
  await load();
  if (session.activeTenant) await reference.load(session.activeTenant.id, true);
}

async function saveProject(): Promise<void> {
  if (!editing.value) return;
  const body = { name: editing.value.name.trim(), description: editing.value.description.trim() || null };
  await run(async () => {
    if (editing.value?.id) await patch(`/api/projects/${editing.value.id}`, body);
    else await post('/api/projects', body);
    editing.value = null;
    await refreshAll();
  });
}

async function archive(project: ProjectDto): Promise<void> {
  if (!window.confirm(t('projects.confirmArchive', { name: project.name }))) return;
  await run(async () => {
    await post(`/api/projects/${project.id}/archive`);
    await refreshAll();
  });
}

async function restore(project: ProjectDto): Promise<void> {
  await run(async () => {
    await post(`/api/projects/${project.id}/restore`);
    await refreshAll();
  });
}

async function openMembers(project: ProjectDto): Promise<void> {
  membersOf.value = project;
  await run(async () => {
    [projectMembers.value, allMembers.value] = await Promise.all([
      get<ProjectMemberDto[]>(`/api/projects/${project.id}/members`),
      get<MemberDto[]>('/api/members'),
    ]);
  });
}

async function setRole(membershipId: string, role: ProjectRole): Promise<void> {
  if (!membersOf.value) return;
  const project = membersOf.value;
  await run(async () => {
    await api('PUT', `/api/projects/${project.id}/members/${membershipId}`, { role });
    await openMembers(project);
  });
}

async function removeMember(membershipId: string): Promise<void> {
  if (!membersOf.value) return;
  const project = membersOf.value;
  await run(async () => {
    await api('DELETE', `/api/projects/${project.id}/members/${membershipId}`);
    await openMembers(project);
  });
}

async function add(): Promise<void> {
  if (!addMember.membershipId) return;
  await setRole(addMember.membershipId, addMember.role);
  addMember.membershipId = '';
}

onMounted(load);
</script>

<template>
  <section class="page">
    <div class="page-head">
      <h1>{{ t('projects.title') }}</h1>
      <button v-if="isManager" type="button" class="button primary" @click="editing = { id: null, name: '', description: '' }">
        + {{ t('projects.new') }}
      </button>
    </div>
    <div class="toolbar">
      <label class="checkbox">
        <input v-model="showArchived" type="checkbox" />
        {{ t('projects.showArchived') }}
      </label>
    </div>
    <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
    <p v-if="loading" class="muted">{{ t('common.loading') }}</p>
    <p v-else-if="visible.length === 0" class="muted">{{ t('projects.empty') }}</p>
    <ul v-else class="project-list">
      <li v-for="p in visible" :key="p.id" class="card project-item" :class="{ archived: p.archived }">
        <div class="project-main">
          <RouterLink :to="{ name: 'todos', query: { scope: 'all', projectId: p.id } }" class="project-name">{{ p.name }}</RouterLink>
          <span v-if="p.archived" class="badge badge-off">{{ t('projects.archived') }}</span>
          <span v-if="p.myRole" class="badge">{{ t(`role.${p.myRole}`) }}</span>
          <p v-if="p.description" class="muted project-description">{{ p.description }}</p>
        </div>
        <div v-if="isManager" class="project-actions">
          <button type="button" class="button small" @click="editing = { id: p.id, name: p.name, description: p.description ?? '' }">
            {{ t('common.edit') }}
          </button>
          <button type="button" class="button small" @click="openMembers(p)">{{ t('projects.members') }}</button>
          <button v-if="!p.archived" type="button" class="button small" @click="archive(p)">{{ t('projects.archive') }}</button>
          <button v-else type="button" class="button small" @click="restore(p)">{{ t('projects.restore') }}</button>
        </div>
      </li>
    </ul>

    <AppModal v-if="editing" :title="editing.id ? t('projects.edit') : t('projects.new')" @close="editing = null">
      <form id="project-form" class="form" @submit.prevent="saveProject">
        <label class="field">
          <span>{{ t('projects.name') }}</span>
          <input v-model="editing.name" type="text" maxlength="200" required />
        </label>
        <label class="field">
          <span>{{ t('projects.description') }}</span>
          <textarea v-model="editing.description" rows="3" maxlength="10000" />
        </label>
      </form>
      <template #footer>
        <span class="spacer" />
        <button type="button" class="button" @click="editing = null">{{ t('common.cancel') }}</button>
        <button type="submit" form="project-form" class="button primary">{{ t('common.save') }}</button>
      </template>
    </AppModal>

    <AppModal v-if="membersOf" :title="t('projects.membersOf', { name: membersOf.name })" @close="membersOf = null">
      <p v-if="projectMembers.length === 0" class="muted">{{ t('projects.noMembers') }}</p>
      <table v-else class="table">
        <tbody>
          <tr v-for="m in projectMembers" :key="m.membershipId">
            <td>{{ m.displayName }}</td>
            <td>
              <label>
                <span class="sr-only">{{ t('projects.role') }}</span>
                <select :value="m.role" @change="setRole(m.membershipId, ($event.target as HTMLSelectElement).value as ProjectRole)">
                  <option v-for="r in PROJECT_ROLES" :key="r" :value="r">{{ t(`role.${r}`) }}</option>
                </select>
              </label>
            </td>
            <td class="actions">
              <button type="button" class="button small" @click="removeMember(m.membershipId)">{{ t('common.remove') }}</button>
            </td>
          </tr>
        </tbody>
      </table>
      <form class="inline-form" @submit.prevent="add">
        <label>
          <span class="sr-only">{{ t('projects.addMember') }}</span>
          <select v-model="addMember.membershipId" required>
            <option value="" disabled>{{ t('projects.addMember') }}</option>
            <option v-for="m in addable" :key="m.id" :value="m.id">{{ m.displayName }}</option>
          </select>
        </label>
        <label>
          <span class="sr-only">{{ t('projects.role') }}</span>
          <select v-model="addMember.role">
            <option v-for="r in PROJECT_ROLES" :key="r" :value="r">{{ t(`role.${r}`) }}</option>
          </select>
        </label>
        <button type="submit" class="button primary small">{{ t('common.add') }}</button>
      </form>
    </AppModal>
  </section>
</template>
