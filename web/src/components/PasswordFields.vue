<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { PASSWORD_MIN_LENGTH } from '@fg/shared';

const password = defineModel<string>('password', { required: true });
const confirm = defineModel<string>('confirm', { required: true });
defineProps<{ label?: string }>();
const { t } = useI18n();
</script>

<template>
  <label class="field">
    <span>{{ label ?? t('auth.password') }}</span>
    <input v-model="password" type="password" autocomplete="new-password" :minlength="PASSWORD_MIN_LENGTH" required />
    <small class="muted">{{ t('auth.passwordHint', { min: PASSWORD_MIN_LENGTH }) }}</small>
  </label>
  <label class="field">
    <span>{{ t('auth.passwordConfirm') }}</span>
    <input v-model="confirm" type="password" autocomplete="new-password" required />
  </label>
</template>
