<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import type { TodoDto } from '@fg/shared';
import { get } from '../api/client';
import TodoCard from '../components/TodoCard.vue';
import TodoDialog from '../components/TodoDialog.vue';
import { errorKey } from '../i18n';
import { useReferenceStore } from '../stores/reference';
import { useSessionStore } from '../stores/session';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const reference = useReferenceStore();

const todos = ref<TodoDto[]>([]);
const loading = ref(true);
const error = ref('');
const dialog = ref<{ id: string | null } | null>(null);

// Filters are kept in the URL so views can be bookmarked and shared.
const scope = computed(() => (route.query.scope === 'all' ? 'all' : 'mine'));
const projectId = computed(() => (typeof route.query.projectId === 'string' ? route.query.projectId : ''));
const includeClosed = computed(() => route.query.closed === '1');
const search = ref(typeof route.query.q === 'string' ? route.query.q : '');

function setQuery(changes: Record<string, string | undefined>): void {
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...route.query, ...changes })) {
    if (typeof v === 'string' && v !== '') query[k] = v;
  }
  void router.replace({ query });
}

async function load(): Promise<void> {
  if (!session.activeTenant) return;
  loading.value = true;
  error.value = '';
  try {
    await reference.load(session.activeTenant.id);
    const params = new URLSearchParams();
    if (scope.value === 'mine') params.set('assignee', 'me');
    if (projectId.value) params.set('projectId', projectId.value);
    if (includeClosed.value) params.set('includeClosed', '1');
    if (search.value.trim()) params.set('q', search.value.trim());
    todos.value = await get<TodoDto[]>(`/api/todos?${params.toString()}`);
  } catch (err) {
    error.value = t(errorKey(err));
  } finally {
    loading.value = false;
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(search, (value) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => setQuery({ q: value.trim() || undefined }), 300);
});
watch(() => [route.query, session.activeTenant?.id], load);
onMounted(load);

const canCreate = computed(
  () =>
    session.activeTenant?.role === 'admin' ||
    ['editor', 'restricted'].includes(session.activeTenant?.defaultRole ?? 'none') ||
    reference.projects.some((p) => !p.archived && (p.myRole === 'editor' || p.myRole === 'restricted')),
);
const activeProjects = computed(() => reference.projects.filter((p) => !p.archived));
</script>

<template>
  <section class="page">
    <p v-if="!session.activeTenant" class="muted">{{ t('home.noTenant') }}</p>
    <template v-else>
      <div class="page-head">
        <h1>{{ t('todos.title') }}</h1>
        <button v-if="canCreate" type="button" class="button primary" @click="dialog = { id: null }">+ {{ t('todo.new') }}</button>
      </div>

      <div class="toolbar">
        <div class="segmented" role="group" :aria-label="t('todos.scope')">
          <button type="button" :aria-pressed="scope === 'mine'" @click="setQuery({ scope: undefined })">{{ t('todos.mine') }}</button>
          <button type="button" :aria-pressed="scope === 'all'" @click="setQuery({ scope: 'all' })">{{ t('todos.all') }}</button>
        </div>
        <label>
          <span class="sr-only">{{ t('todo.project') }}</span>
          <select :value="projectId" @change="setQuery({ projectId: ($event.target as HTMLSelectElement).value || undefined })">
            <option value="">{{ t('todos.allProjects') }}</option>
            <option value="none">{{ t('todo.noProject') }}</option>
            <option v-for="p in activeProjects" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="search">
          <span class="sr-only">{{ t('todos.search') }}</span>
          <input v-model="search" type="search" :placeholder="t('todos.search')" />
        </label>
        <label class="checkbox">
          <input type="checkbox" :checked="includeClosed" @change="setQuery({ closed: ($event.target as HTMLInputElement).checked ? '1' : undefined })" />
          {{ t('todos.showClosed') }}
        </label>
      </div>

      <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
      <p v-if="loading" class="muted">{{ t('common.loading') }}</p>
      <p v-else-if="todos.length === 0" class="empty muted">{{ t('todos.empty') }}</p>
      <div v-else class="todo-grid">
        <TodoCard v-for="todo in todos" :key="todo.id" :todo="todo" @open="dialog = { id: $event }" />
      </div>
    </template>

    <TodoDialog
      v-if="dialog"
      :todo-id="dialog.id"
      :defaults="projectId && projectId !== 'none' ? { projectId } : undefined"
      @close="dialog = null"
      @saved="load"
    />
  </section>
</template>
