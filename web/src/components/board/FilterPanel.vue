<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { NONE, type FilterCriteria } from '@fg/shared';
import { refLabel, useReferenceStore } from '../../stores/reference';

/** Multi-select filters: OR within a group, AND between groups (§5). */
const props = defineProps<{ criteria: FilterCriteria }>();
const emit = defineEmits<{ change: [criteria: FilterCriteria] }>();
const { t } = useI18n();
const reference = useReferenceStore();

type Group = { key: keyof FilterCriteria; title: string; options: { id: string; label: string }[] };

const groups = computed<Group[]>(() => [
  {
    key: 'tagIds',
    title: t('board.filters.tags'),
    options: [{ id: NONE, label: t('board.withoutTag') }, ...reference.tags.map((tag) => ({ id: tag.id, label: tag.name }))],
  },
  {
    key: 'assigneeIds',
    title: t('board.filters.persons'),
    options: [{ id: NONE, label: t('todo.unassigned') }, ...reference.members.map((m) => ({ id: m.id, label: m.displayName }))],
  },
  {
    key: 'priorityIds',
    title: t('board.filters.priorities'),
    options: [
      { id: NONE, label: t('todo.noPriority') },
      ...reference.priorities.map((p) => ({ id: p.id, label: refLabel('priority', p) })),
    ],
  },
  {
    key: 'projectIds',
    title: t('board.filters.projects'),
    options: [
      { id: NONE, label: t('todo.noProject') },
      ...reference.projects.filter((p) => !p.archived).map((p) => ({ id: p.id, label: p.name })),
    ],
  },
]);

function toggle(key: keyof FilterCriteria, id: string, checked: boolean): void {
  const current = props.criteria[key];
  const next = checked ? [...current, id] : current.filter((v) => v !== id);
  emit('change', { ...props.criteria, [key]: next });
}
</script>

<template>
  <div class="filter-panel card">
    <fieldset v-for="group in groups" :key="group.key" class="filter-group">
      <legend>{{ group.title }}</legend>
      <div class="filter-options">
        <label v-for="option in group.options" :key="option.id" class="checkbox">
          <input
            type="checkbox"
            :checked="criteria[group.key].includes(option.id)"
            @change="toggle(group.key, option.id, ($event.target as HTMLInputElement).checked)"
          />
          {{ option.label }}
        </label>
      </div>
    </fieldset>
  </div>
</template>
