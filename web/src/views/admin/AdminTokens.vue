<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AccessTokenSettings, AdminAccessTokenDto } from '@fg/shared';
import { api, get } from '../../api/client';
import { errorKey } from '../../i18n';
import { useSessionStore } from '../../stores/session';

/** Administration → access tokens: allow tokens in the tenant, see and revoke all tokens. */
const { t, d } = useI18n();
const session = useSessionStore();
const allowed = ref(false);
const tokens = ref<AdminAccessTokenDto[]>([]);
const error = ref('');
const message = ref('');

async function load(): Promise<void> {
  allowed.value = (await get<AccessTokenSettings>('/api/admin/tokens/settings')).allowed;
  tokens.value = await get<AdminAccessTokenDto[]>('/api/admin/tokens');
}

async function run(action: () => Promise<unknown>, success = ''): Promise<void> {
  error.value = '';
  message.value = '';
  try {
    await action();
    message.value = success;
    await load();
  } catch (err) {
    error.value = t(errorKey(err));
  }
}

function setAllowed(value: boolean): void {
  void run(async () => {
    await api('PUT', '/api/admin/tokens/settings', { allowed: value });
    // The settings page shows whether tokens can be created.
    await session.load();
  }, t('common.saved'));
}

function revoke(token: AdminAccessTokenDto): void {
  if (window.confirm(t('admin.tokens.confirmRevoke', { name: token.name, person: token.member.displayName }))) {
    void run(() => api('DELETE', `/api/admin/tokens/${token.id}`), t('tokens.revoked'));
  }
}

onMounted(() => run(() => Promise.resolve()));
</script>

<template>
  <section class="card">
    <h2>{{ t('admin.tab.tokens') }}</h2>
    <p class="muted small">{{ t('admin.tokens.hint') }}</p>
    <p v-if="!session.me?.mcp.enabled" class="alert alert-info">{{ t('admin.tokens.disabled') }}</p>
    <label class="checkbox">
      <input type="checkbox" :checked="allowed" @change="setAllowed(($event.target as HTMLInputElement).checked)" />
      {{ t('admin.tokens.allow') }}
    </label>
    <p class="muted small">{{ t('admin.tokens.allowHint') }}</p>
    <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
    <p v-if="message" class="alert alert-success" role="status">{{ message }}</p>

    <p v-if="tokens.length === 0" class="muted">{{ t('admin.tokens.empty') }}</p>
    <div v-else class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>{{ t('admin.tokens.person') }}</th>
            <th>{{ t('tokens.name') }}</th>
            <th>{{ t('tokens.scope') }}</th>
            <th>{{ t('tokens.expires') }}</th>
            <th>{{ t('tokens.lastUsed') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="token in tokens" :key="token.id">
            <td>{{ token.member.displayName }}</td>
            <td>{{ token.name }}</td>
            <td>
              {{ token.scope === 'write' ? t('tokens.scopeWrite') : t('tokens.scopeRead') }}
              <span v-if="token.ownOnly" class="muted small">({{ t('tokens.ownOnlyShort') }})</span>
            </td>
            <td>
              {{ d(new Date(token.expiresAt), 'short') }}
              <span v-if="token.expired" class="muted small">({{ t('tokens.expired') }})</span>
            </td>
            <td>{{ token.lastUsedAt ? d(new Date(token.lastUsedAt), 'long') : t('tokens.never') }}</td>
            <td class="actions">
              <button type="button" class="button small" @click="revoke(token)">{{ t('tokens.revoke') }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
