<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import {
  NONE,
  VIEW_MODES,
  paramsToTodoQuery,
  todoQueryToParams,
  type TodoDto,
  type TodoInput,
  type TodoQuery,
  type ViewMode,
} from '@fg/shared';
import { get, patch } from '../api/client';
import GridBoard from '../components/board/GridBoard.vue';
import BoardToolbar from '../components/board/BoardToolbar.vue';
import KanbanBoard, { type Lane } from '../components/board/KanbanBoard.vue';
import TodoDialog from '../components/TodoDialog.vue';
import { errorKey } from '../i18n';
import { refLabel, useReferenceStore } from '../stores/reference';
import { useSessionStore } from '../stores/session';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const reference = useReferenceStore();

const todos = ref<TodoDto[]>([]);
const loading = ref(true);
const error = ref('');
const creating = ref(false);

// Board state lives in the URL (bookmarkable, shareable, survives reloads).
const query = computed<TodoQuery>(() => paramsToTodoQuery(route.query));
const view = computed<ViewMode>(() =>
  (VIEW_MODES as readonly string[]).includes(String(route.query.view)) ? (route.query.view as ViewMode) : 'status',
);
const openTodoId = computed(() => (typeof route.params.id === 'string' ? route.params.id : null));

function navigate(changes: Partial<TodoQuery>, nextView: ViewMode = view.value, todoId: string | null = openTodoId.value): void {
  const params = Object.fromEntries(todoQueryToParams({ ...query.value, ...changes }));
  if (nextView !== 'status') params.view = nextView;
  void router.replace(todoId ? { name: 'todo', params: { id: todoId }, query: params } : { name: 'todos', query: params });
}

async function load(): Promise<void> {
  if (!session.activeTenant) return;
  loading.value = true;
  error.value = '';
  try {
    await reference.load(session.activeTenant.id);
    todos.value = await get<TodoDto[]>(`/api/todos?${todoQueryToParams(query.value).toString()}`);
  } catch (err) {
    error.value = t(errorKey(err));
  } finally {
    loading.value = false;
  }
}

/** Deep link: switch to the To-Do's tenant if necessary (only if the user has access there). */
async function resolveDeepLink(id: string): Promise<void> {
  try {
    const { tenantId } = await get<{ tenantId: string }>(`/api/todos/${id}/locate`);
    if (tenantId !== session.activeTenant?.id) await session.switchTenant(tenantId);
  } catch {
    error.value = t('board.linkNotFound');
    void router.replace({ name: 'todos' });
  }
}

const statusColumns = computed(() =>
  reference.statuses.filter((s) => query.value.includeClosed || s.category === 'open'),
);

/** Person lanes: filtered persons, otherwise persons with To-Dos plus the current user; then "unassigned". */
const personRows = computed(() => {
  const me = session.activeTenant?.membershipId;
  let ids: string[];
  if (query.value.assigneeIds.length) ids = query.value.assigneeIds.filter((id) => id !== NONE);
  else if (query.value.scope === 'mine') ids = me ? [me] : [];
  else ids = [...new Set([...(me ? [me] : []), ...todos.value.map((t) => t.assigneeId).filter((v): v is string => !!v)])];
  const rows = ids
    .map((id) => ({ key: id, title: reference.memberById.get(id)?.displayName ?? '—' }))
    .sort((a, b) => (a.key === me ? -1 : b.key === me ? 1 : a.title.localeCompare(b.title)));
  const showUnassigned =
    query.value.scope === 'all' && (!query.value.assigneeIds.length || query.value.assigneeIds.includes(NONE));
  if (showUnassigned) rows.push({ key: NONE, title: t('todo.unassigned') });
  return rows;
});

const personKeyOf = (todo: TodoDto) => todo.assigneeId ?? NONE;

const lanes = computed<Lane[]>(() => {
  if (view.value === 'status') {
    return statusColumns.value.map((s) => ({
      key: s.id,
      title: refLabel('status', s),
      color: s.color,
      todos: todos.value.filter((t) => t.statusId === s.id),
    }));
  }
  if (view.value === 'person') {
    return personRows.value.map((row) => ({ ...row, todos: todos.value.filter((t) => personKeyOf(t) === row.key) }));
  }
  // Tag view: a To-Do with several tags appears in several lanes.
  const tagIds = query.value.tagIds.length
    ? query.value.tagIds.filter((id) => id !== NONE)
    : [...new Set(todos.value.flatMap((t) => t.tags.map((tag) => tag.id)))];
  const result: Lane[] = tagIds
    .map((id) => reference.tags.find((tag) => tag.id === id))
    .filter((tag) => tag !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tag) => ({
      key: tag.id,
      title: tag.name,
      color: tag.color ?? undefined,
      todos: todos.value.filter((t) => t.tags.some((x) => x.id === tag.id)),
    }));
  if (!query.value.tagIds.length || query.value.tagIds.includes(NONE)) {
    result.push({ key: NONE, title: t('board.withoutTag'), todos: todos.value.filter((t) => t.tags.length === 0) });
  }
  return result;
});

/** Drag and drop: the effect depends on the active view (§5). The server checks the permission. */
async function move(todoId: string, _from: string, to: string): Promise<void> {
  const todo = todos.value.find((t) => t.id === todoId);
  if (!todo) return;
  let changes: TodoInput;
  if (view.value === 'status') changes = { statusId: to };
  else if (view.value === 'person') changes = { assigneeId: to === NONE ? null : to };
  else if (view.value === 'grid') {
    const [person, statusId] = to.split('|');
    changes = { statusId, assigneeId: person === NONE ? null : (person ?? null) };
  } else return;

  const before = { ...todo };
  Object.assign(todo, changes); // optimistic
  error.value = '';
  try {
    const saved = await patch<TodoDto>(`/api/todos/${todoId}`, changes);
    todos.value = todos.value.map((t) => (t.id === todoId ? saved : t));
  } catch (err) {
    Object.assign(todo, before);
    error.value = t(errorKey(err));
  }
}

function openTodo(id: string): void {
  navigate({}, view.value, id);
}

function closeTodo(): void {
  navigate({}, view.value, null);
}

const canCreate = computed(
  () =>
    session.activeTenant?.role === 'admin' ||
    ['editor', 'restricted'].includes(session.activeTenant?.defaultRole ?? 'none') ||
    reference.projects.some((p) => !p.archived && (p.myRole === 'editor' || p.myRole === 'restricted')),
);
const createDefaults = computed<Partial<TodoInput>>(() => {
  const projects = query.value.projectIds.filter((id) => id !== NONE);
  return projects.length === 1 ? { projectId: projects[0] } : {};
});

watch(
  () => [todoQueryToParams(query.value).toString(), session.activeTenant?.id],
  () => void load(),
);
onMounted(async () => {
  if (openTodoId.value) await resolveDeepLink(openTodoId.value);
  await load();
});
</script>

<template>
  <section class="page board-page">
    <p v-if="!session.activeTenant" class="muted">{{ t('home.noTenant') }}</p>
    <template v-else>
      <div class="page-head">
        <h1>{{ t('todos.title') }}</h1>
        <button v-if="canCreate" type="button" class="button primary" @click="creating = true">+ {{ t('todo.new') }}</button>
      </div>

      <BoardToolbar :query="query" :view="view" @change="navigate($event)" @view="navigate({}, $event)" @error="error = $event" />

      <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
      <p v-if="loading && todos.length === 0" class="muted">{{ t('common.loading') }}</p>
      <template v-else>
        <p v-if="todos.length === 0" class="empty muted">{{ t('todos.empty') }}</p>
        <GridBoard
          v-if="view === 'grid'"
          :statuses="statusColumns"
          :rows="personRows"
          :todos="todos"
          :person-key-of="personKeyOf"
          @open="openTodo"
          @move="move"
        />
        <KanbanBoard v-else :lanes="lanes" :droppable="view !== 'tag'" @open="openTodo" @move="move" />
      </template>
    </template>

    <TodoDialog v-if="creating" :todo-id="null" :defaults="createDefaults" @close="creating = false" @saved="load" />
    <TodoDialog v-if="openTodoId && session.activeTenant" :key="openTodoId" :todo-id="openTodoId" @close="closeTodo" @saved="load" />
  </section>
</template>
