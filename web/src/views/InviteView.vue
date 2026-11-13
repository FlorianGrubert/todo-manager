<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import type { InvitationInfo, MeResponse } from '@fg/shared';
import { get, post } from '../api/client';
import AuthCard from '../components/AuthCard.vue';
import PasswordFields from '../components/PasswordFields.vue';
import { errorKey } from '../i18n';
import { useSessionStore } from '../stores/session';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const session = useSessionStore();

const token = String(route.params.token);
const info = ref<InvitationInfo | null>(null);
const invalid = ref(false);
const name = ref('');
const password = ref('');
const confirm = ref('');
const error = ref('');
const busy = ref(false);

onMounted(async () => {
  try {
    info.value = await get<InvitationInfo>(`/api/invitations/${encodeURIComponent(token)}`);
  } catch {
    invalid.value = true;
  }
});

async function submit(): Promise<void> {
  error.value = '';
  if (info.value?.needsPassword && password.value !== confirm.value) {
    error.value = t('auth.passwordMismatch');
    return;
  }
  busy.value = true;
  try {
    const me = await post<MeResponse>(`/api/invitations/${encodeURIComponent(token)}/accept`, {
      password: password.value,
      ...(name.value.trim() ? { name: name.value.trim() } : {}),
    });
    session.apply(me);
    await router.replace('/');
  } catch (err) {
    error.value = t(errorKey(err));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AuthCard :title="t('invite.title')">
    <p v-if="invalid" class="alert alert-error" role="alert">{{ t('invite.invalid') }}</p>
    <p v-else-if="!info" class="muted">{{ t('common.loading') }}</p>
    <form v-else class="form" @submit.prevent="submit">
      <p>{{ t('invite.intro', { tenant: info.tenantName }) }}</p>
      <p class="muted">{{ info.needsPassword ? t('invite.newAccount') : t('invite.existingAccount') }}</p>
      <label class="field">
        <span>{{ t('auth.email') }}</span>
        <input :value="info.email" type="email" autocomplete="username" readonly />
      </label>
      <template v-if="info.needsPassword">
        <label class="field">
          <span>{{ t('invite.name') }}</span>
          <input v-model="name" type="text" autocomplete="name" maxlength="200" />
        </label>
        <PasswordFields v-model:password="password" v-model:confirm="confirm" />
      </template>
      <label v-else class="field">
        <span>{{ t('auth.password') }}</span>
        <input v-model="password" type="password" autocomplete="current-password" required />
      </label>
      <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
      <button class="button primary" type="submit" :disabled="busy">{{ t('invite.submit') }}</button>
    </form>
  </AuthCard>
</template>
