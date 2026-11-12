<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { LOCALES, type Locale } from '@fg/shared';
import { post } from '../api/client';
import PasswordFields from '../components/PasswordFields.vue';
import { errorKey } from '../i18n';
import { useSessionStore } from '../stores/session';

const { t } = useI18n();
const session = useSessionStore();

const name = ref(session.user?.name ?? '');
const language = ref<Locale>(session.user?.locale ?? 'de');
const profileMessage = ref('');
const profileError = ref('');

const notifyAssign = ref(session.user?.notifyAssign ?? true);
const remindEnabled = ref(session.user?.remindDaysBefore !== null && session.user?.remindDaysBefore !== undefined);
const remindDays = ref(session.user?.remindDaysBefore ?? 1);
const notifyOverdue = ref(session.user?.notifyOverdue ?? true);
const notifyMessage = ref('');
const notifyError = ref('');

async function saveNotifications(): Promise<void> {
  notifyMessage.value = '';
  notifyError.value = '';
  try {
    await session.updateProfile({
      notifyAssign: notifyAssign.value,
      remindDaysBefore: remindEnabled.value ? Math.min(60, Math.max(0, Math.round(remindDays.value))) : null,
      notifyOverdue: notifyOverdue.value,
    });
    notifyMessage.value = t('common.saved');
  } catch (err) {
    notifyError.value = t(errorKey(err));
  }
}

const currentPassword = ref('');
const newPassword = ref('');
const confirm = ref('');
const passwordMessage = ref('');
const passwordError = ref('');

async function saveProfile(): Promise<void> {
  profileMessage.value = '';
  profileError.value = '';
  try {
    await session.updateProfile({ name: name.value.trim(), locale: language.value });
    profileMessage.value = t('common.saved');
  } catch (err) {
    profileError.value = t(errorKey(err));
  }
}

async function changePassword(): Promise<void> {
  passwordMessage.value = '';
  passwordError.value = '';
  if (newPassword.value !== confirm.value) {
    passwordError.value = t('auth.passwordMismatch');
    return;
  }
  try {
    await post('/api/auth/password', { currentPassword: currentPassword.value, newPassword: newPassword.value });
    passwordMessage.value = t('settings.passwordChanged');
    currentPassword.value = '';
    newPassword.value = '';
    confirm.value = '';
  } catch (err) {
    passwordError.value = t(errorKey(err));
  }
}
</script>

<template>
  <section class="page">
    <h1>{{ t('settings.title') }}</h1>
    <div class="grid-2">
      <section class="card">
        <h2>{{ t('settings.profile') }}</h2>
        <form class="form" @submit.prevent="saveProfile">
          <label class="field">
            <span>{{ t('auth.email') }}</span>
            <input :value="session.user?.email" type="email" readonly />
          </label>
          <label class="field">
            <span>{{ t('settings.name') }}</span>
            <input v-model="name" type="text" maxlength="200" required />
          </label>
          <label class="field">
            <span>{{ t('language.label') }}</span>
            <select v-model="language">
              <option v-for="l in LOCALES" :key="l" :value="l">{{ t(`language.${l}`) }}</option>
            </select>
          </label>
          <p v-if="profileError" class="alert alert-error" role="alert">{{ profileError }}</p>
          <p v-if="profileMessage" class="alert alert-success" role="status">{{ profileMessage }}</p>
          <button class="button primary" type="submit">{{ t('common.save') }}</button>
        </form>
      </section>

      <section class="card">
        <h2>{{ t('settings.notifications') }}</h2>
        <form class="form" @submit.prevent="saveNotifications">
          <p class="muted small">{{ t('settings.notificationsHint') }}</p>
          <label class="checkbox">
            <input v-model="notifyAssign" type="checkbox" />
            {{ t('settings.notifyAssign') }}
          </label>
          <label class="checkbox">
            <input v-model="remindEnabled" type="checkbox" />
            {{ t('settings.remind') }}
          </label>
          <label v-if="remindEnabled" class="field">
            <span>{{ t('settings.remindDays') }}</span>
            <input v-model.number="remindDays" type="number" min="0" max="60" required />
          </label>
          <label class="checkbox">
            <input v-model="notifyOverdue" type="checkbox" />
            {{ t('settings.notifyOverdue') }}
          </label>
          <p v-if="notifyError" class="alert alert-error" role="alert">{{ notifyError }}</p>
          <p v-if="notifyMessage" class="alert alert-success" role="status">{{ notifyMessage }}</p>
          <button class="button primary" type="submit">{{ t('common.save') }}</button>
        </form>
      </section>

      <section class="card">
        <h2>{{ t('settings.changePassword') }}</h2>
        <form class="form" @submit.prevent="changePassword">
          <label class="field">
            <span>{{ t('settings.currentPassword') }}</span>
            <input v-model="currentPassword" type="password" autocomplete="current-password" required />
          </label>
          <PasswordFields v-model:password="newPassword" v-model:confirm="confirm" :label="t('settings.newPassword')" />
          <p v-if="passwordError" class="alert alert-error" role="alert">{{ passwordError }}</p>
          <p v-if="passwordMessage" class="alert alert-success" role="status">{{ passwordMessage }}</p>
          <button class="button primary" type="submit">{{ t('common.save') }}</button>
        </form>
      </section>
    </div>
    <p class="muted version">{{ t('app.version', { version: session.me?.version ?? '' }) }}</p>
  </section>
</template>
