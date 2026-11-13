<script setup lang="ts">
import { computed } from 'vue';
import type { PriorityIconColor, PriorityIconDirection, PriorityIconKind } from '@fg/shared';

const props = defineProps<{
  kind: PriorityIconKind;
  arrows: number;
  direction: PriorityIconDirection;
  color: PriorityIconColor;
  label?: string;
}>();

const COLORS: Record<PriorityIconColor, string> = { green: '#16a34a', yellow: '#ca8a04', red: '#dc2626' };
const fill = computed(() => (props.kind === 'exclamation' ? COLORS.red : COLORS[props.color]));
// Chevron offsets for 1–3 stacked arrows.
const offsets = computed(() => [0, 5, 10].slice(0, Math.min(Math.max(props.arrows, 1), 3)));
const yBase = computed(() => 8 - (offsets.value.length - 1) * 2.5);
</script>

<template>
  <svg
    class="priority-icon"
    viewBox="0 0 20 20"
    width="18"
    height="18"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
  >
    <title v-if="label">{{ label }}</title>
    <template v-if="kind === 'exclamation'">
      <rect x="8" y="2" width="4" height="11" rx="2" :fill="fill" />
      <circle cx="10" cy="17" r="2.2" :fill="fill" />
    </template>
    <g v-else :transform="direction === 'down' ? 'rotate(180 10 10)' : undefined">
      <path
        v-for="o in offsets"
        :key="o"
        :d="`M4 ${yBase + o + 4} L10 ${yBase + o - 2} L16 ${yBase + o + 4}`"
        fill="none"
        :stroke="fill"
        stroke-width="2.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </g>
  </svg>
</template>

<style scoped>
.priority-icon {
  flex: none;
  vertical-align: middle;
}
</style>
