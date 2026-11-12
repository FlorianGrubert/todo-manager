<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useOfflineStore } from '../stores/offline';

/** Clearly shows when the app is offline (§5) and whether captured To-Dos are still waiting. */
const { t } = useI18n();
const offline = useOfflineStore();
</script>

<template>
  <div v-if="!offline.online" class="status-banner offline" role="status">
    <strong>{{ t('offline.title') }}</strong>
    <span>{{ t('offline.text') }}</span>
    <RouterLink v-if="offline.pending.length" :to="{ name: 'quick' }">{{ t('offline.pending', { n: offline.pending.length }, offline.pending.length) }}</RouterLink>
  </div>
  <div v-else-if="offline.failed.length || offline.pending.length" class="status-banner pending" role="status">
    <span v-if="offline.failed.length">{{ t('offline.failed', { n: offline.failed.length }, offline.failed.length) }}</span>
    <span v-else>{{ t('offline.syncing', { n: offline.pending.length }, offline.pending.length) }}</span>
    <RouterLink :to="{ name: 'quick' }">{{ t('offline.show') }}</RouterLink>
  </div>
</template>
