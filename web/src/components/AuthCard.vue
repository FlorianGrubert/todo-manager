<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { LOCALES, type Locale } from '@fg/shared';
import { useSessionStore } from '../stores/session';

defineProps<{ title: string }>();
const { t, locale } = useI18n();
const session = useSessionStore();

function onLocaleChange(event: Event): void {
  void session.updateProfile({ locale: (event.target as HTMLSelectElement).value as Locale });
}
</script>

<template>
  <section class="auth-card card">
    <div class="auth-brand">
      <img src="/favicon.svg" alt="" width="40" height="40" />
      <span>{{ t('app.name') }}</span>
    </div>
    <h1>{{ title }}</h1>
    <slot />
    <label class="auth-locale">
      <span class="sr-only">{{ t('language.label') }}</span>
      <select :value="locale" @change="onLocaleChange">
        <option v-for="l in LOCALES" :key="l" :value="l">{{ t(`language.${l}`) }}</option>
      </select>
    </label>
  </section>
</template>
