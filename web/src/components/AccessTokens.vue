<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { TOKEN_DEFAULT_DAYS, type AccessTokenDto, type CreatedAccessTokenDto, type TokenScope } from '@fg/shared';
import { api, get, post } from '../api/client';
import { errorKey } from '../i18n';
import { useSessionStore } from '../stores/session';

/** Settings → access tokens for AI assistants (MCP server). */
const { t, d } = useI18n();
const session = useSessionStore();

const mcp = computed(() => session.me?.mcp);
const tokens = ref<AccessTokenDto[]>([]);
const name = ref('');
const scope = ref<TokenScope>('read');
const ownOnly = ref(false);
const days = ref(Math.min(TOKEN_DEFAULT_DAYS, mcp.value?.maxDays ?? TOKEN_DEFAULT_DAYS));
const created = ref<CreatedAccessTokenDto | null>(null);
const error = ref('');
const message = ref('');

async function load(): Promise<void> {
  tokens.value = await get<AccessTokenDto[]>('/api/tokens');
}

async function create(): Promise<void> {
  error.value = '';
  message.value = '';
  try {
    created.value = await post<CreatedAccessTokenDto>('/api/tokens', {
      name: name.value.trim(),
      scope: scope.value,
      ownOnly: ownOnly.value,
      days: Math.round(days.value),
    });
    name.value = '';
    await load();
  } catch (err) {
    error.value = t(errorKey(err));
  }
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    message.value = t('tokens.copied');
  } catch {
    // Clipboard not available (e.g. without HTTPS): the value stays selectable.
  }
}

async function revoke(token: AccessTokenDto): Promise<void> {
  if (!window.confirm(t('tokens.confirmRevoke', { name: token.name }))) return;
  error.value = '';
  message.value = '';
  try {
    await api('DELETE', `/api/tokens/${token.id}`);
    if (created.value?.id === token.id) created.value = null;
    message.value = t('tokens.revoked');
    await load();
  } catch (err) {
    error.value = t(errorKey(err));
  }
}

onMounted(() => {
  if (mcp.value?.enabled) void load().catch((err: unknown) => (error.value = t(errorKey(err))));
});
</script>

<template>
  <section v-if="mcp?.enabled" class="card access-tokens">
    <h2>{{ t('tokens.title') }}</h2>
    <p class="muted small">{{ t('tokens.hint', { tenant: session.activeTenant?.name ?? '' }) }}</p>
    <label class="field">
      <span>{{ t('tokens.url') }}</span>
      <span class="inline-copy">
        <input :value="mcp.url" type="text" readonly @focus="($event.target as HTMLInputElement).select()" />
        <button type="button" class="button small" @click="copy(mcp.url)">{{ t('tokens.copy') }}</button>
      </span>
    </label>

    <p v-if="!mcp.tenantAllowed" class="alert alert-info">{{ t('tokens.notAllowed') }}</p>
    <form v-else-if="session.activeTenant" class="form" @submit.prevent="create">
      <label class="field">
        <span>{{ t('tokens.name') }}</span>
        <input v-model="name" type="text" maxlength="100" required :placeholder="t('tokens.namePlaceholder')" />
      </label>
      <label class="field">
        <span>{{ t('tokens.scope') }}</span>
        <select v-model="scope">
          <option value="read">{{ t('tokens.scopeRead') }}</option>
          <option value="write">{{ t('tokens.scopeWrite') }}</option>
        </select>
      </label>
      <label v-if="scope === 'write'" class="checkbox">
        <input v-model="ownOnly" type="checkbox" />
        {{ t('tokens.ownOnly') }}
      </label>
      <label class="field">
        <span>{{ t('tokens.days', { max: mcp.maxDays }) }}</span>
        <input v-model.number="days" type="number" min="1" :max="mcp.maxDays" required />
      </label>
      <button class="button primary" type="submit" :disabled="!name.trim()">{{ t('tokens.create') }}</button>
    </form>

    <div v-if="created" class="alert alert-success token-created" role="status">
      <p>{{ t('tokens.created') }}</p>
      <span class="inline-copy">
        <input :value="created.token" type="text" readonly @focus="($event.target as HTMLInputElement).select()" />
        <button type="button" class="button small" @click="copy(created.token)">{{ t('tokens.copy') }}</button>
      </span>
      <p class="small">{{ t('tokens.configHint') }}</p>
    </div>
    <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
    <p v-if="message" class="alert alert-success" role="status">{{ message }}</p>

    <p v-if="tokens.length === 0" class="muted">{{ t('tokens.empty') }}</p>
    <div v-else class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>{{ t('tokens.name') }}</th>
            <th>{{ t('tokens.tenant') }}</th>
            <th>{{ t('tokens.scope') }}</th>
            <th>{{ t('tokens.expires') }}</th>
            <th>{{ t('tokens.lastUsed') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="token in tokens" :key="token.id">
            <td>{{ token.name }}</td>
            <td>{{ token.tenantName }}</td>
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
