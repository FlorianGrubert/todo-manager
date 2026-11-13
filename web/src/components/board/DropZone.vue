<script setup lang="ts">
import { ref } from 'vue';
import type { TodoDto } from '@fg/shared';
import { useDropZone } from '../../composables/useDropZone';
import TodoCard from '../TodoCard.vue';

const props = defineProps<{ zone: string; todos: TodoDto[]; droppable: boolean; compact?: boolean }>();
const emit = defineEmits<{ open: [id: string]; drop: [todoId: string, from: string, to: string] }>();
const el = ref<HTMLElement | null>(null);

useDropZone(el, {
  enabled: () => props.droppable,
  onDrop: (id, from, to) => emit('drop', id, from, to),
});
</script>

<template>
  <div ref="el" class="drop-zone" :data-zone="zone">
    <TodoCard
      v-for="todo in todos"
      :key="todo.id"
      :todo="todo"
      :compact="compact"
      :class="{ 'can-drag': droppable && todo.canEdit }"
      :data-id="todo.id"
      @open="emit('open', $event)"
    />
  </div>
</template>
