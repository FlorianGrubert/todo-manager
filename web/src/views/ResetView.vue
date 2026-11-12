<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { post } from '../api/client';
import AuthCard from '../components/AuthCard.vue';
import PasswordFields from '../components/PasswordFields.vue';
import { errorKey } from '../i18n';

const { t } = useI18n();
const route = useRoute();
const password = ref('');
const confirm = ref('');
const done = ref(false);
const error = ref('');
const busy = ref(false);

async function submit(): Promise<void> {
  error.value = '';
  if (password.value !== confirm.value) {
    error.value = t('auth.passwordMismatch');
    return;
  }
  busy.value = true;
  try {
    await post('/api/auth/reset', { token: String(route.params.token), password: password.value });
    done.value = true;
  } catch (err) {
    error.value = t(errorKey(err));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AuthCard :title="t('auth.reset.title')">
    <p v-if="done" class="alert alert-success" role="status">{{ t('auth.reset.done') }}</p>
    <form v-else class="form" @submit.prevent="submit">
      <PasswordFields v-model:password="password" v-model:confirm="confirm" />
      <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
      <button class="button primary" type="submit" :disabled="busy">{{ t('auth.reset.submit') }}</button>
    </form>
    <RouterLink to="/login" class="muted-link">{{ t('auth.toLogin') }}</RouterLink>
  </AuthCard>
</template>
