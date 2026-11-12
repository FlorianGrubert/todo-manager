<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TodoDto } from '@fg/shared';
import { refLabel, useReferenceStore } from '../stores/reference';
import PriorityBadge from './PriorityBadge.vue';

const props = defineProps<{ todo: TodoDto }>();
const emit = defineEmits<{ open: [id: string] }>();
const { t, d } = useI18n();
const reference = useReferenceStore();

const status = computed(() => reference.statusById.get(props.todo.statusId));
const priority = computed(() => (props.todo.priorityId ? reference.priorityById.get(props.todo.priorityId) : undefined));
const assignee = computed(() => (props.todo.assigneeId ? reference.memberById.get(props.todo.assigneeId) : undefined));
const project = computed(() => (props.todo.projectId ? reference.projectById.get(props.todo.projectId) : undefined));
const overdue = computed(() => {
  if (!props.todo.dueDate || status.value?.category !== 'open') return false;
  return props.todo.dueDate < new Date().toISOString().slice(0, 10);
});
</script>

<template>
  <article
    class="todo-card"
    :style="{ '--status-color': status?.color ?? '#94a3b8' }"
    tabindex="0"
    @click="emit('open', todo.id)"
    @keydown.enter="emit('open', todo.id)"
  >
    <header class="todo-card-head">
      <PriorityBadge :priority="priority" />
      <h3>{{ todo.title }}</h3>
    </header>
    <div class="todo-card-meta">
      <span class="status-chip">{{ refLabel('status', status) }}</span>
      <span v-if="project" class="muted">{{ project.name }}</span>
      <span v-if="todo.dueDate" class="due" :class="{ overdue }">{{ t('todo.dueShort', { date: d(new Date(`${todo.dueDate}T00:00:00`)) }) }}</span>
    </div>
    <div v-if="todo.tags.length" class="tag-list">
      <span v-for="tag in todo.tags" :key="tag.id" class="tag" :style="tag.color ? { '--tag-color': tag.color } : undefined">{{ tag.name }}</span>
    </div>
    <footer class="todo-card-foot">
      <span class="assignee">{{ assignee?.displayName ?? t('todo.unassigned') }}</span>
      <span v-if="todo.commentCount" class="comment-count muted" :title="t('todo.tabComments')">{{ todo.commentCount }}</span>
    </footer>
  </article>
</template>
