<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useSessionStore } from '../stores/session';

const { t } = useI18n();
const session = useSessionStore();
</script>

<template>
  <section class="page">
    <h1>{{ t('home.welcome', { name: session.activeTenant?.displayName ?? session.user?.name ?? '' }) }}</h1>
    <template v-if="session.activeTenant">
      <p>{{ t('home.tenantInfo', { tenant: session.activeTenant.name }) }}</p>
      <p class="muted">{{ t('home.boardSoon') }}</p>
    </template>
    <p v-else class="muted">{{ t('home.noTenant') }}</p>
  </section>
</template>
