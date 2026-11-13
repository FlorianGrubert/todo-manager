<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  PRIORITY_ICON_COLORS,
  type PriorityIconColor,
  type PriorityIconDirection,
  type PriorityIconKind,
} from '@fg/shared';
import PriorityIcon from './PriorityIcon.vue';

export interface PriorityIconValue {
  iconKind: PriorityIconKind;
  iconArrows: number;
  iconDirection: PriorityIconDirection;
  iconColor: PriorityIconColor;
}

/**
 * Single dropdown for the priority icon (§7): opens a table with the number and
 * direction of the arrows as rows, the colors as columns and an extra row for
 * the red exclamation mark.
 */
const props = defineProps<{ modelValue: PriorityIconValue; label: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: PriorityIconValue] }>();
const { t } = useI18n();

const ROWS: { arrows: number; direction: PriorityIconDirection }[] = [
  { arrows: 3, direction: 'up' },
  { arrows: 2, direction: 'up' },
  { arrows: 1, direction: 'up' },
  { arrows: 1, direction: 'down' },
  { arrows: 2, direction: 'down' },
  { arrows: 3, direction: 'down' },
];

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const position = ref({ top: 0, left: 0 });

function describe(value: PriorityIconValue): string {
  if (value.iconKind === 'exclamation') return t('admin.priorities.kinds.exclamation');
  return t(
    'admin.priorities.option',
    {
      count: value.iconArrows,
      direction: t(`admin.priorities.directions.${value.iconDirection}`),
      color: t(`admin.priorities.colors.${value.iconColor}`),
    },
    value.iconArrows,
  );
}

const current = computed(() => describe(props.modelValue));

function arrowValue(row: (typeof ROWS)[number], color: PriorityIconColor): PriorityIconValue {
  return { iconKind: 'arrows', iconArrows: row.arrows, iconDirection: row.direction, iconColor: color };
}

const exclamationValue = computed<PriorityIconValue>(() => ({ ...props.modelValue, iconKind: 'exclamation' }));

function isSelected(value: PriorityIconValue): boolean {
  const m = props.modelValue;
  if (value.iconKind === 'exclamation') return m.iconKind === 'exclamation';
  return m.iconKind === 'arrows' && m.iconArrows === value.iconArrows && m.iconDirection === value.iconDirection && m.iconColor === value.iconColor;
}

function onOutside(event: MouseEvent): void {
  const target = event.target as Node;
  if (!root.value?.contains(target) && !panel.value?.contains(target)) close(false);
}

/** Places the panel below the trigger (or above it) and keeps it inside the viewport. */
function place(): void {
  const rect = trigger.value?.getBoundingClientRect();
  const box = panel.value?.getBoundingClientRect();
  if (!rect) return;
  const margin = 8;
  const width = box?.width ?? 0;
  const height = box?.height ?? 0;
  const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
  const below = rect.bottom + 4;
  const top = below + height > window.innerHeight - margin ? Math.max(margin, rect.top - height - 4) : below;
  position.value = { top, left };
}

function listen(on: boolean): void {
  if (on) {
    document.addEventListener('mousedown', onOutside);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
  } else {
    document.removeEventListener('mousedown', onOutside);
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
  }
}

async function toggle(): Promise<void> {
  if (open.value) {
    close(true);
    return;
  }
  open.value = true;
  place();
  await nextTick();
  place();
  const selected = panel.value?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]') ?? panel.value?.querySelector('button');
  selected?.focus({ preventScroll: true });
  // Registered after the opening click has been handled.
  setTimeout(() => {
    if (open.value) listen(true);
  });
}

function close(focusTrigger: boolean): void {
  open.value = false;
  listen(false);
  if (focusTrigger) trigger.value?.focus();
}

function choose(value: PriorityIconValue): void {
  close(true);
  if (!isSelected(value)) emit('update:modelValue', value);
}

/** Arrow keys move between the cells of the table. */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    close(true);
    return;
  }
  const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  const move = moves[event.key];
  const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-row]');
  if (!move || !cell || !panel.value) return;
  event.preventDefault();
  const row = Number(cell.dataset.row) + move[0];
  const col = Number(cell.dataset.col) + move[1];
  const exact = panel.value.querySelector<HTMLButtonElement>(`[data-row="${row}"][data-col="${col}"]`);
  // The exclamation row has a single cell: vertical moves land on it from any column.
  const fallback = panel.value.querySelector<HTMLButtonElement>(`[data-row="${row}"]`);
  (exact ?? (move[0] !== 0 ? fallback : null))?.focus();
}

onBeforeUnmount(() => listen(false));
</script>

<template>
  <span ref="root" class="icon-picker">
    <button
      ref="trigger"
      type="button"
      class="icon-picker-trigger"
      aria-haspopup="true"
      :aria-expanded="open"
      :aria-label="`${label}: ${current}`"
      :title="current"
      @click="toggle"
    >
      <PriorityIcon
        :kind="modelValue.iconKind"
        :arrows="modelValue.iconArrows"
        :direction="modelValue.iconDirection"
        :color="modelValue.iconColor"
      />
      <svg class="caret" viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
        <path d="M2 4 L5 7 L8 4" fill="none" stroke="currentColor" stroke-width="1.5" />
      </svg>
    </button>
    <Teleport to="body">
      <div
        v-if="open"
        ref="panel"
        class="icon-picker-panel"
        role="dialog"
        :aria-label="label"
        :style="{ top: `${position.top}px`, left: `${position.left}px` }"
        @keydown="onKeydown"
      >
        <table>
          <thead>
            <tr>
              <th />
              <th v-for="color in PRIORITY_ICON_COLORS" :key="color" scope="col">{{ t(`admin.priorities.colors.${color}`) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, r) in ROWS" :key="`${row.arrows}-${row.direction}`">
              <th scope="row">{{ t(`admin.priorities.rows.${row.direction}`, { count: row.arrows }, row.arrows) }}</th>
              <td v-for="(color, c) in PRIORITY_ICON_COLORS" :key="color">
                <button
                  type="button"
                  :data-row="r"
                  :data-col="c"
                  :aria-pressed="isSelected(arrowValue(row, color))"
                  :aria-label="describe(arrowValue(row, color))"
                  :title="describe(arrowValue(row, color))"
                  @click="choose(arrowValue(row, color))"
                >
                  <PriorityIcon kind="arrows" :arrows="row.arrows" :direction="row.direction" :color="color" />
                </button>
              </td>
            </tr>
            <tr class="exclamation-row">
              <th scope="row">{{ t('admin.priorities.rows.exclamation') }}</th>
              <td />
              <td />
              <td>
                <button
                  type="button"
                  :data-row="ROWS.length"
                  :data-col="2"
                  :aria-pressed="isSelected(exclamationValue)"
                  :aria-label="describe(exclamationValue)"
                  :title="describe(exclamationValue)"
                  @click="choose(exclamationValue)"
                >
                  <PriorityIcon kind="exclamation" :arrows="1" direction="up" color="red" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Teleport>
  </span>
</template>

<style scoped>
.icon-picker {
  display: inline-block;
}

.icon-picker-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 2.25rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: inherit;
  cursor: pointer;
}

.icon-picker-trigger:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}

.caret {
  opacity: 0.7;
}

.icon-picker-panel {
  position: fixed;
  z-index: 1000;
  padding: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
}

.icon-picker-panel table {
  border-collapse: collapse;
}

.icon-picker-panel th {
  padding: 0.15rem 0.4rem;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}

.icon-picker-panel th[scope='row'] {
  text-align: right;
}

.icon-picker-panel td {
  padding: 2px;
  text-align: center;
}

.exclamation-row th,
.exclamation-row td {
  padding-top: 0.4rem;
  border-top: 1px solid var(--border);
}

.icon-picker-panel td button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.25rem;
  border: 2px solid transparent;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}

.icon-picker-panel td button:hover {
  background: var(--surface-2);
}

.icon-picker-panel td button:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}

.icon-picker-panel td button[aria-pressed='true'] {
  border-color: var(--primary);
  background: var(--surface-2);
}
</style>
