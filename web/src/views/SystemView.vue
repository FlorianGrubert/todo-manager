<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { LOCALES, type Locale, type SystemTenant } from '@fg/shared';
import { get, patch, post } from '../api/client';
import AppModal from '../components/AppModal.vue';
import { errorKey } from '../i18n';

const { t, d, locale } = useI18n();
const tenants = ref<SystemTenant[]>([]);
const loading = ref(true);
const error = ref('');
const message = ref('');
const busy = ref(false);
const form = reactive({ name: '', adminEmail: '', adminName: '', locale: locale.value as Locale });

async function load(): Promise<void> {
  loading.value = true;
  try {
    tenants.value = await get<SystemTenant[]>('/api/system/tenants');
  } catch (err) {
    error.value = t(errorKey(err));
  } finally {
    loading.value = false;
  }
}

async function create(): Promise<void> {
  error.value = '';
  message.value = '';
  busy.value = true;
  try {
    await post('/api/system/tenants', { ...form });
    message.value = t('system.created');
    form.name = '';
    form.adminEmail = '';
    form.adminName = '';
    await load();
  } catch (err) {
    error.value = t(errorKey(err));
  } finally {
    busy.value = false;
  }
}

async function toggle(tenant: SystemTenant): Promise<void> {
  if (tenant.isActive && !window.confirm(t('system.confirmDeactivate', { name: tenant.name }))) return;
  error.value = '';
  try {
    await patch(`/api/system/tenants/${tenant.id}`, { isActive: !tenant.isActive });
    await load();
  } catch (err) {
    error.value = t(errorKey(err));
  }
}

// ---------------- export / import (§11) ----------------
const importFile = ref<unknown>(null);
const importName = ref('');
const replacing = ref<SystemTenant | null>(null);
const replaceFile = ref<unknown>(null);
const replaceConfirm = ref('');

/** Reads a chosen JSON export file; invalid files are reported immediately. */
async function readFile(event: Event): Promise<unknown> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return null;
  try {
    return JSON.parse(await file.text()) as unknown;
  } catch {
    error.value = t('system.invalidFile');
    return null;
  }
}

async function onImportFile(event: Event): Promise<void> {
  error.value = '';
  importFile.value = await readFile(event);
}

async function onReplaceFile(event: Event): Promise<void> {
  error.value = '';
  replaceFile.value = await readFile(event);
}

async function runImport(): Promise<void> {
  if (!importFile.value) return;
  error.value = '';
  message.value = '';
  busy.value = true;
  try {
    const name = importName.value.trim();
    await post('/api/system/tenants/import', { data: importFile.value, ...(name ? { name } : {}) });
    message.value = t('system.imported');
    importName.value = '';
    await load();
  } catch (err) {
    error.value = t(errorKey(err));
  } finally {
    busy.value = false;
  }
}

async function runReplace(): Promise<void> {
  const tenant = replacing.value;
  if (!tenant || !replaceFile.value || replaceConfirm.value !== tenant.name) return;
  error.value = '';
  message.value = '';
  busy.value = true;
  try {
    await post(`/api/system/tenants/${tenant.id}/replace`, { confirmName: replaceConfirm.value, data: replaceFile.value });
    message.value = t('system.replaced', { name: tenant.name });
    replacing.value = null;
    await load();
  } catch (err) {
    error.value = t(errorKey(err));
  } finally {
    busy.value = false;
  }
}

function openReplace(tenant: SystemTenant): void {
  replacing.value = tenant;
  replaceFile.value = null;
  replaceConfirm.value = '';
}

onMounted(load);
</script>

<template>
  <section class="page">
    <h1>{{ t('system.title') }}</h1>
    <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
    <p v-if="message" class="alert alert-success" role="status">{{ message }}</p>

    <div class="grid-main-side">
      <section class="card">
        <h2>{{ t('system.tenants') }}</h2>
        <p v-if="loading" class="muted">{{ t('common.loading') }}</p>
        <p v-else-if="tenants.length === 0" class="muted">{{ t('system.empty') }}</p>
        <div v-else class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>{{ t('system.tenantName') }}</th>
                <th>{{ t('system.members') }}</th>
                <th>{{ t('system.createdAt') }}</th>
                <th>{{ t('system.status') }}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr v-for="tenant in tenants" :key="tenant.id">
                <td>{{ tenant.name }}</td>
                <td>{{ tenant.memberCount }}</td>
                <td>{{ d(new Date(tenant.createdAt)) }}</td>
                <td>
                  <span class="badge" :class="tenant.isActive ? 'badge-ok' : 'badge-off'">
                    {{ tenant.isActive ? t('system.active') : t('system.inactive') }}
                  </span>
                </td>
                <td class="actions">
                  <a class="button small" :href="`/api/system/tenants/${tenant.id}/export`" download>{{ t('system.export') }}</a>
                  <button type="button" class="button small" @click="openReplace(tenant)">{{ t('system.replace') }}</button>
                  <button type="button" class="button small" @click="toggle(tenant)">
                    {{ tenant.isActive ? t('system.deactivate') : t('system.activate') }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <h2>{{ t('system.newTenant') }}</h2>
        <form class="form" @submit.prevent="create">
          <label class="field">
            <span>{{ t('system.tenantName') }}</span>
            <input v-model="form.name" type="text" maxlength="200" required />
          </label>
          <label class="field">
            <span>{{ t('system.adminName') }}</span>
            <input v-model="form.adminName" type="text" maxlength="200" required />
          </label>
          <label class="field">
            <span>{{ t('system.adminEmail') }}</span>
            <input v-model="form.adminEmail" type="email" maxlength="320" required />
          </label>
          <label class="field">
            <span>{{ t('system.inviteLocale') }}</span>
            <select v-model="form.locale">
              <option v-for="l in LOCALES" :key="l" :value="l">{{ t(`language.${l}`) }}</option>
            </select>
          </label>
          <button class="button primary" type="submit" :disabled="busy">{{ t('common.create') }}</button>
        </form>

        <h2 class="section-gap">{{ t('system.importTitle') }}</h2>
        <form class="form" @submit.prevent="runImport">
          <p class="muted small">{{ t('system.importHint') }}</p>
          <label class="field">
            <span>{{ t('system.file') }}</span>
            <input type="file" accept="application/json,.json" required @change="onImportFile" />
          </label>
          <label class="field">
            <span>{{ t('system.importName') }}</span>
            <input v-model="importName" type="text" maxlength="200" />
          </label>
          <button class="button primary" type="submit" :disabled="busy || !importFile">{{ t('system.import') }}</button>
        </form>
      </section>
    </div>

    <AppModal v-if="replacing" :title="t('system.replaceTitle', { name: replacing.name })" @close="replacing = null">
      <form id="replace-tenant" class="form" @submit.prevent="runReplace">
        <p class="alert alert-error">{{ t('system.replaceWarning', { name: replacing.name }) }}</p>
        <label class="field">
          <span>{{ t('system.file') }}</span>
          <input type="file" accept="application/json,.json" required @change="onReplaceFile" />
        </label>
        <label class="field">
          <span>{{ t('system.replaceConfirm', { name: replacing.name }) }}</span>
          <input v-model="replaceConfirm" type="text" autocomplete="off" required />
        </label>
      </form>
      <template #footer>
        <span class="spacer" />
        <button type="button" class="button" @click="replacing = null">{{ t('common.cancel') }}</button>
        <button
          type="submit"
          form="replace-tenant"
          class="button primary"
          :disabled="busy || !replaceFile || replaceConfirm !== replacing.name"
        >
          {{ t('system.replace') }}
        </button>
      </template>
    </AppModal>
  </section>
</template>
