<script setup lang="ts">
import type { PriorityDto } from '@fg/shared';
import { refLabel } from '../stores/reference';
import PriorityIcon from './PriorityIcon.vue';

defineProps<{ priority: PriorityDto | undefined; showLabel?: boolean }>();
</script>

<template>
  <span v-if="priority" class="priority-badge">
    <PriorityIcon
      :kind="priority.iconKind"
      :arrows="priority.iconArrows"
      :direction="priority.iconDirection"
      :color="priority.iconColor"
      :label="refLabel('priority', priority)"
    />
    <span v-if="showLabel">{{ refLabel('priority', priority) }}</span>
  </span>
</template>

<style scoped>
.priority-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
</style>
