<template>
  <div
    class="todo-tile"
    draggable="true"
    @dragstart="onDragStart"
  >
    <div class="todo-tile-title">
      {{ todo.title }}
    </div>
    <div class="todo-tile-desc">
      {{ descriptionSnippet }}
    </div>
    <div class="todo-tile-meta">
      <span>
        {{ todo.teamMember ? todo.teamMember.name : "Unassigned" }}
      </span>
      <span>
        {{ formattedDueDate }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ToDo } from "../types";

const props = defineProps<{
  todo: ToDo;
}>();

const emit = defineEmits<{
  (e: "drag-start", id: number): void;
}>();

const descriptionSnippet = computed(() => {
  const desc = props.todo.description ?? "";
  const trimmed = desc.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 80) return trimmed;
  return `${trimmed.slice(0, 77)}...`;
});

const formattedDueDate = computed(() => {
  const iso = props.todo.dueDate;
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
});

function onDragStart() {
  emit("drag-start", props.todo.id);
}
</script>

