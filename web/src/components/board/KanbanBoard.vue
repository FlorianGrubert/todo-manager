<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { TodoDto } from '@fg/shared';
import DropZone from './DropZone.vue';

export interface Lane {
  key: string;
  title: string;
  color?: string;
  todos: TodoDto[];
}

defineProps<{ lanes: Lane[]; droppable: boolean }>();
const emit = defineEmits<{ open: [id: string]; move: [todoId: string, from: string, to: string] }>();
const { t } = useI18n();
</script>

<template>
  <div class="kanban">
    <section v-for="lane in lanes" :key="lane.key" class="lane" :style="lane.color ? { '--lane-color': lane.color } : undefined">
      <header class="lane-head">
        <span class="lane-title">{{ lane.title }}</span>
        <span class="lane-count" :aria-label="t('board.count', { n: lane.todos.length }, lane.todos.length)">{{ lane.todos.length }}</span>
      </header>
      <DropZone
        :zone="lane.key"
        :todos="lane.todos"
        :droppable="droppable"
        @open="emit('open', $event)"
        @drop="(id, from, to) => emit('move', id, from, to)"
      />
    </section>
  </div>
</template>
