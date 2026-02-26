<template>
  <section class="board-container">
    <div class="board-header-row">
      <div class="board-header-cell">
        Unassigned
      </div>
      <div
        v-for="member in teamMembers"
        :key="member.id"
        class="board-header-cell"
      >
        {{ member.name }}
      </div>
    </div>

    <div class="board-body">
      <div
        v-for="status in sortedStatuses"
        :key="status.name"
        class="board-row"
      >
        <div class="board-status-label">
          {{ status.name }}
        </div>

        <div
          v-for="column in columns"
          :key="column.key"
          class="board-cell"
          :class="{
            'drop-target': isDropTarget(status.name, column.memberId)
          }"
          @dragover.prevent="onDragOver(status.name, column.memberId)"
          @dragleave="onDragLeave(status.name, column.memberId)"
          @drop="onDrop(status.name, column.memberId)"
        >
          <TodoTile
            v-for="todo in todosForCell(status.name, column.memberId)"
            :key="todo.id"
            :todo="todo"
            @drag-start="onTileDragStart"
          />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { Status, TeamMember, ToDo } from "../types";
import TodoTile from "./TodoTile.vue";

const props = defineProps<{
  statuses: Status[];
  teamMembers: TeamMember[];
  todos: ToDo[];
}>();

const emit = defineEmits<{
  (e: "move-todo", payload: {
    id: number;
    statusName: string;
    teamMemberId: number | null;
  }): void;
}>();

const draggingTodoId = ref<number | null>(null);

const sortedStatuses = computed(() =>
  [...props.statuses].sort((a, b) => a.rank - b.rank)
);

const columns = computed(() => {
  return [
    { key: "unassigned", memberId: null as number | null },
    ...props.teamMembers.map((m) => ({
      key: `member-${m.id}`,
      memberId: m.id as number | null
    }))
  ];
});

const currentDropTarget = ref<{
  statusName: string;
  memberId: number | null;
} | null>(null);

function todosForCell(statusName: string, memberId: number | null): ToDo[] {
  return props.todos.filter((todo) => {
    const statusMatch = todo.status && todo.status.name === statusName;
    const memberMatch =
      (memberId == null && !todo.teamMember) ||
      (memberId != null &&
        todo.teamMember &&
        todo.teamMember.id === memberId);
    return statusMatch && memberMatch;
  });
}

function onTileDragStart(id: number) {
  draggingTodoId.value = id;
}

function onDragOver(statusName: string, memberId: number | null) {
  currentDropTarget.value = { statusName, memberId };
}

function onDragLeave(statusName: string, memberId: number | null) {
  if (
    currentDropTarget.value &&
    currentDropTarget.value.statusName === statusName &&
    currentDropTarget.value.memberId === memberId
  ) {
    currentDropTarget.value = null;
  }
}

function onDrop(statusName: string, memberId: number | null) {
  if (draggingTodoId.value == null) return;
  emit("move-todo", {
    id: draggingTodoId.value,
    statusName,
    teamMemberId: memberId
  });
  currentDropTarget.value = null;
  draggingTodoId.value = null;
}

function isDropTarget(statusName: string, memberId: number | null): boolean {
  return (
    !!currentDropTarget.value &&
    currentDropTarget.value.statusName === statusName &&
    currentDropTarget.value.memberId === memberId
  );
}
</script>

