<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { post } from '../api/client';
import AuthCard from '../components/AuthCard.vue';
import { errorKey } from '../i18n';

const { t } = useI18n();
const email = ref('');
const sent = ref(false);
const error = ref('');
const busy = ref(false);

async function submit(): Promise<void> {
  error.value = '';
  busy.value = true;
  try {
    await post('/api/auth/forgot', { email: email.value });
    sent.value = true;
  } catch (err) {
    error.value = t(errorKey(err));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AuthCard :title="t('auth.forgot.title')">
    <p v-if="sent" class="alert alert-success" role="status">{{ t('auth.forgot.sent') }}</p>
    <form v-else class="form" @submit.prevent="submit">
      <p class="muted">{{ t('auth.forgot.intro') }}</p>
      <label class="field">
        <span>{{ t('auth.email') }}</span>
        <input v-model="email" type="email" autocomplete="username" required autofocus />
      </label>
      <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
      <button class="button primary" type="submit" :disabled="busy">{{ t('auth.forgot.submit') }}</button>
    </form>
    <RouterLink to="/login" class="muted-link">{{ t('auth.toLogin') }}</RouterLink>
  </AuthCard>
</template>
