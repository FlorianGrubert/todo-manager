<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { LOCALES, type Locale } from '@fg/shared';
import { errorKey } from '../i18n';
import { useSessionStore } from '../stores/session';

const { t, locale } = useI18n();
const router = useRouter();
const session = useSessionStore();
const menuOpen = ref(false);
const error = ref('');

async function onTenantChange(event: Event): Promise<void> {
  const id = (event.target as HTMLSelectElement).value;
  error.value = '';
  try {
    await session.switchTenant(id);
    await router.push({ name: 'home' });
  } catch (err) {
    error.value = t(errorKey(err));
  }
}

async function onLocaleChange(event: Event): Promise<void> {
  await session.updateProfile({ locale: (event.target as HTMLSelectElement).value as Locale });
}

async function logout(): Promise<void> {
  menuOpen.value = false;
  await session.logout();
  await router.push({ name: 'login' });
}
</script>

<template>
  <header class="topbar">
    <RouterLink to="/" class="brand">
      <img src="/favicon.svg" alt="" width="28" height="28" />
      <span class="brand-name">{{ t('app.name') }}</span>
    </RouterLink>

    <label v-if="session.tenants.length > 1" class="tenant-switch">
      <span class="sr-only">{{ t('nav.tenant') }}</span>
      <select :value="session.activeTenant?.id" @change="onTenantChange">
        <option v-for="tenant in session.tenants" :key="tenant.id" :value="tenant.id">{{ tenant.name }}</option>
      </select>
    </label>
    <span v-else-if="session.activeTenant" class="tenant-name">{{ session.activeTenant.name }}</span>

    <span class="spacer" />

    <button
      class="icon-button menu-toggle"
      type="button"
      :aria-label="t('nav.menu')"
      :aria-expanded="menuOpen"
      @click="menuOpen = !menuOpen"
    >
      ☰
    </button>

    <nav class="topnav" :class="{ open: menuOpen }" @click="menuOpen = false">
      <RouterLink to="/">{{ t('nav.home') }}</RouterLink>
      <RouterLink v-if="session.isSystemAdmin" to="/system">{{ t('nav.system') }}</RouterLink>
      <RouterLink to="/settings">{{ t('nav.settings') }}</RouterLink>
      <label class="locale-switch" @click.stop>
        <span class="sr-only">{{ t('language.label') }}</span>
        <select :value="locale" @change="onLocaleChange">
          <option v-for="l in LOCALES" :key="l" :value="l">{{ t(`language.${l}`) }}</option>
        </select>
      </label>
      <button type="button" class="link-button" @click="logout">{{ t('nav.logout') }}</button>
    </nav>
  </header>
  <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
</template>
