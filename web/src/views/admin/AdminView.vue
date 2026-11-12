<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const tabs = ['members', 'statuses', 'priorities', 'tags'] as const;
</script>

<template>
  <section class="page">
    <h1>{{ t('admin.title') }}</h1>
    <nav class="tabs">
      <RouterLink v-for="tab in tabs" :key="tab" :to="{ name: `admin-${tab}` }">{{ t(`admin.tab.${tab}`) }}</RouterLink>
    </nav>
    <RouterView />
  </section>
</template>
