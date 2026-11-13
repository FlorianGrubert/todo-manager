<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { HistoryEntryDto, HistoryResponse } from '@fg/shared';
import { refLabel } from '../stores/reference';

const props = defineProps<{ history: HistoryResponse | null }>();
const { t, d } = useI18n();

/** Turns stored IDs into readable names using the references delivered with the history. */
function display(entry: HistoryEntryDto, value: string | null): string {
  if (value === null || value === '') return '—';
  const refs = props.history?.refs;
  switch (entry.field) {
    case 'status':
      return refLabel('status', refs?.statuses.find((s) => s.id === value));
    case 'priority':
      return refLabel('priority', refs?.priorities.find((p) => p.id === value));
    case 'assignee':
      return refs?.members.find((m) => m.id === value)?.displayName ?? '—';
    case 'project':
      return refs?.projects.find((p) => p.id === value)?.name ?? '—';
    case 'dueDate':
      return d(new Date(`${value}T00:00:00`));
    default:
      return value;
  }
}
</script>

<template>
  <section class="history">
    <p v-if="!history" class="muted">{{ t('common.loading') }}</p>
    <p v-else-if="history.entries.length === 0" class="muted">{{ t('history.empty') }}</p>
    <ol v-else class="history-list">
      <li v-for="e in history.entries" :key="e.id">
        <div class="muted small">{{ d(new Date(e.changedAt), 'long') }} · {{ e.changedBy.displayName }}</div>
        <div v-if="e.field === 'created'">{{ t('history.created') }}</div>
        <div v-else>
          <strong>{{ t(`history.field.${e.field}`) }}:</strong>
          <span class="history-value old">{{ display(e, e.oldValue) }}</span>
          →
          <span class="history-value">{{ display(e, e.newValue) }}</span>
        </div>
      </li>
    </ol>
  </section>
</template>
