<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import AuthCard from '../components/AuthCard.vue';
import { errorKey } from '../i18n';
import { useSessionStore } from '../stores/session';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const session = useSessionStore();

const email = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

async function submit(): Promise<void> {
  error.value = '';
  busy.value = true;
  try {
    await session.login(email.value, password.value);
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/';
    await router.replace(redirect);
  } catch (err) {
    error.value = t(errorKey(err));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AuthCard :title="t('auth.login.title')">
    <form class="form" @submit.prevent="submit">
      <label class="field">
        <span>{{ t('auth.email') }}</span>
        <input v-model="email" type="email" autocomplete="username" required autofocus />
      </label>
      <label class="field">
        <span>{{ t('auth.password') }}</span>
        <input v-model="password" type="password" autocomplete="current-password" required />
      </label>
      <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
      <button class="button primary" type="submit" :disabled="busy">{{ t('auth.login.submit') }}</button>
      <RouterLink to="/forgot" class="muted-link">{{ t('auth.login.forgot') }}</RouterLink>
    </form>
  </AuthCard>
</template>
