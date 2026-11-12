<script setup lang="ts">
import type { StatusDto, TodoDto } from '@fg/shared';
import { refLabel } from '../../stores/reference';
import DropZone from './DropZone.vue';

/** Grid view (§5): statuses as columns, persons as rows. Zone key = `<personKey>|<statusId>`. */
const props = defineProps<{
  statuses: StatusDto[];
  rows: { key: string; title: string }[];
  todos: TodoDto[];
  personKeyOf: (todo: TodoDto) => string;
}>();
const emit = defineEmits<{ open: [id: string]; move: [todoId: string, from: string, to: string] }>();

const cell = (rowKey: string, statusId: string) =>
  props.todos.filter((t) => t.statusId === statusId && props.personKeyOf(t) === rowKey);
</script>

<template>
  <div class="grid-board-wrap">
    <table class="grid-board">
      <thead>
        <tr>
          <th class="row-head" />
          <th v-for="s in statuses" :key="s.id" :style="{ '--lane-color': s.color }">
            <span class="lane-title">{{ refLabel('status', s) }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.key">
          <th class="row-head" scope="row">{{ row.title }}</th>
          <td v-for="s in statuses" :key="s.id">
            <DropZone
              :zone="`${row.key}|${s.id}`"
              :todos="cell(row.key, s.id)"
              droppable
              compact
              @open="emit('open', $event)"
              @drop="(id, from, to) => emit('move', id, from, to)"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
