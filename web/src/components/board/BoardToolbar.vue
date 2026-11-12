<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  EMPTY_CRITERIA,
  NONE,
  SORT_FIELDS,
  VIEW_MODES,
  todoQueryToParams,
  type FilterCriteria,
  type SavedFilterDto,
  type SortField,
  type TodoQuery,
  type ViewMode,
} from '@fg/shared';
import { api, get, post } from '../../api/client';
import { errorKey } from '../../i18n';
import { useSessionStore } from '../../stores/session';
import FilterPanel from './FilterPanel.vue';

const props = defineProps<{ query: TodoQuery; view: ViewMode }>();
const emit = defineEmits<{ change: [changes: Partial<TodoQuery>]; view: [view: ViewMode]; error: [message: string] }>();
const { t } = useI18n();
const session = useSessionStore();

const showFilters = ref(false);
const savedFilters = ref<SavedFilterDto[]>([]);
const search = ref(props.query.q);
const exportOpen = ref(false);

const criteria = computed<FilterCriteria>(() => ({
  tagIds: props.query.tagIds,
  assigneeIds: props.query.assigneeIds,
  priorityIds: props.query.priorityIds,
  projectIds: props.query.projectIds,
}));
const activeCount = computed(() => Object.values(criteria.value).reduce((n, list) => n + list.length, 0));
const withoutProjectOnly = computed(() => props.query.projectIds.length === 1 && props.query.projectIds[0] === NONE);
const sameCriteria = (a: FilterCriteria, b: FilterCriteria) =>
  (Object.keys(EMPTY_CRITERIA) as (keyof FilterCriteria)[]).every(
    (k) => [...a[k]].sort().join(',') === [...b[k]].sort().join(','),
  );
const currentSaved = computed(() => savedFilters.value.find((f) => sameCriteria(f.criteria, criteria.value)));

let timer: ReturnType<typeof setTimeout> | undefined;
watch(search, (value) => {
  clearTimeout(timer);
  timer = setTimeout(() => emit('change', { q: value }), 300);
});
watch(
  () => props.query.q,
  (q) => {
    if (q !== search.value) search.value = q;
  },
);

async function loadFilters(): Promise<void> {
  try {
    savedFilters.value = await get<SavedFilterDto[]>('/api/filters');
  } catch (err) {
    emit('error', t(errorKey(err)));
  }
}

function applySaved(id: string): void {
  const filter = savedFilters.value.find((f) => f.id === id);
  emit('change', filter ? { ...filter.criteria } : { ...EMPTY_CRITERIA });
}

async function saveFilter(): Promise<void> {
  const name = window.prompt(t('board.saveFilterPrompt'))?.trim();
  if (!name) return;
  try {
    await post('/api/filters', { name, criteria: criteria.value });
    await loadFilters();
  } catch (err) {
    emit('error', t(errorKey(err)));
  }
}

async function deleteFilter(): Promise<void> {
  const filter = currentSaved.value;
  if (!filter || !window.confirm(t('board.confirmDeleteFilter', { name: filter.name }))) return;
  try {
    await api('DELETE', `/api/filters/${filter.id}`);
    await loadFilters();
  } catch (err) {
    emit('error', t(errorKey(err)));
  }
}

function exportUrl(format: 'csv' | 'xlsx'): string {
  const params = todoQueryToParams(props.query);
  params.set('format', format);
  params.set('tz', Intl.DateTimeFormat().resolvedOptions().timeZone);
  return `/api/todos/export?${params.toString()}`;
}

watch(() => session.activeTenant?.id, loadFilters);
onMounted(loadFilters);
</script>

<template>
  <div class="board-toolbar">
    <div class="toolbar">
      <div class="segmented" role="group" :aria-label="t('todos.scope')">
        <button type="button" :aria-pressed="query.scope === 'mine'" @click="emit('change', { scope: 'mine' })">{{ t('todos.mine') }}</button>
        <button type="button" :aria-pressed="query.scope === 'all'" @click="emit('change', { scope: 'all' })">{{ t('todos.all') }}</button>
      </div>

      <label class="inline-select">
        <span>{{ t('board.viewLabel') }}</span>
        <select :value="view" @change="emit('view', ($event.target as HTMLSelectElement).value as ViewMode)">
          <option v-for="v in VIEW_MODES" :key="v" :value="v">{{ t(`board.view.${v}`) }}</option>
        </select>
      </label>

      <label class="inline-select">
        <span>{{ t('board.sort.label') }}</span>
        <select :value="query.sort" @change="emit('change', { sort: ($event.target as HTMLSelectElement).value as SortField })">
          <option v-for="f in SORT_FIELDS" :key="f" :value="f">{{ t(`board.sort.${f}`) }}</option>
        </select>
      </label>
      <button
        type="button"
        class="button small"
        :title="query.dir === 'asc' ? t('board.sort.asc') : t('board.sort.desc')"
        :aria-label="query.dir === 'asc' ? t('board.sort.asc') : t('board.sort.desc')"
        @click="emit('change', { dir: query.dir === 'asc' ? 'desc' : 'asc' })"
      >
        {{ query.dir === 'asc' ? '↑' : '↓' }}
      </button>

      <label class="search">
        <span class="sr-only">{{ t('todos.search') }}</span>
        <input v-model="search" type="search" :placeholder="t('todos.search')" />
      </label>
    </div>

    <div class="toolbar">
      <button type="button" class="button small" :aria-expanded="showFilters" @click="showFilters = !showFilters">
        {{ t('board.filter') }}<span v-if="activeCount" class="count-badge">{{ activeCount }}</span>
      </button>
      <button
        type="button"
        class="button small"
        :aria-pressed="withoutProjectOnly"
        :class="{ active: withoutProjectOnly }"
        @click="emit('change', { projectIds: withoutProjectOnly ? [] : [NONE] })"
      >
        {{ t('todo.noProject') }}
      </button>
      <button v-if="activeCount" type="button" class="button small" @click="emit('change', { ...EMPTY_CRITERIA })">
        {{ t('board.filters.reset') }}
      </button>

      <label class="inline-select">
        <span class="sr-only">{{ t('board.savedFilters') }}</span>
        <select :value="currentSaved?.id ?? ''" @change="applySaved(($event.target as HTMLSelectElement).value)">
          <option value="">{{ savedFilters.length ? t('board.savedFilters') : t('board.noSavedFilters') }}</option>
          <option v-for="f in savedFilters" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
      </label>
      <button v-if="activeCount && !currentSaved" type="button" class="button small" @click="saveFilter">{{ t('board.saveFilter') }}</button>
      <button v-if="currentSaved" type="button" class="button small" @click="deleteFilter">{{ t('board.deleteFilter') }}</button>

      <label class="checkbox">
        <input type="checkbox" :checked="query.includeClosed" @change="emit('change', { includeClosed: ($event.target as HTMLInputElement).checked })" />
        {{ t('todos.showClosed') }}
      </label>

      <span class="spacer" />
      <div class="dropdown">
        <button type="button" class="button small" :aria-expanded="exportOpen" @click="exportOpen = !exportOpen">{{ t('board.export') }}</button>
        <div v-if="exportOpen" class="menu" role="menu" @click="exportOpen = false">
          <a role="menuitem" :href="exportUrl('xlsx')" download>{{ t('board.exportXlsx') }}</a>
          <a role="menuitem" :href="exportUrl('csv')" download>{{ t('board.exportCsv') }}</a>
        </div>
      </div>
    </div>

    <FilterPanel v-if="showFilters" :criteria="criteria" @change="emit('change', $event)" />
  </div>
</template>
