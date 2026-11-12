<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { errorKey } from '../i18n';
import { useOfflineStore } from '../stores/offline';
import { refLabel, useReferenceStore } from '../stores/reference';
import { useSessionStore } from '../stores/session';

/**
 * Mobile quick capture (§3, §5): as simple as possible, works offline.
 * Every To-Do is first stored on the device and then sent automatically.
 */
const { t, d } = useI18n();
const session = useSessionStore();
const reference = useReferenceStore();
const offline = useOfflineStore();

const titleInput = ref<HTMLInputElement | null>(null);
const showMore = ref(false);
const busy = ref(false);
const message = ref('');
const error = ref('');
const form = reactive({ title: '', description: '', projectId: null as string | null, priorityId: null as string | null, dueDate: '' });

const tenant = computed(() => session.activeTenant);
const projects = computed(() =>
  reference.projects.filter((p) => !p.archived && (p.myRole === 'admin' || p.myRole === 'editor' || p.myRole === 'restricted')),
);
const mayUseNoProject = computed(
  () => tenant.value?.role === 'admin' || ['editor', 'restricted'].includes(tenant.value?.defaultRole ?? 'none'),
);
const canCapture = computed(() => mayUseNoProject.value || projects.value.length > 0);
const ownEntries = computed(() => offline.entries.filter((e) => e.tenantId === tenant.value?.id));
const otherTenantEntries = computed(() => offline.entries.filter((e) => e.tenantId !== tenant.value?.id));

async function submit(): Promise<void> {
  if (!form.title.trim()) return;
  busy.value = true;
  message.value = '';
  error.value = '';
  try {
    const result = await offline.capture({
      title: form.title.trim(),
      description: form.description.trim() || null,
      projectId: form.projectId,
      priorityId: form.priorityId,
      dueDate: form.dueDate || null,
      // Captured To-Dos are assigned to the person capturing them.
      assigneeId: tenant.value?.membershipId ?? null,
    });
    message.value = result === 'synced' ? t('quick.saved') : t('quick.queued');
    form.title = '';
    form.description = '';
    form.dueDate = '';
    await nextTick();
    titleInput.value?.focus();
  } catch (err) {
    error.value = t(errorKey(err));
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  if (tenant.value) await reference.load(tenant.value.id).catch(() => undefined);
  if (!mayUseNoProject.value) form.projectId = projects.value[0]?.id ?? null;
  await offline.refresh();
  titleInput.value?.focus();
});
</script>

<template>
  <section class="page quick-page">
    <div class="page-head">
      <h1>{{ t('quick.title') }}</h1>
      <RouterLink :to="{ name: 'todos' }" class="button small">{{ t('quick.toBoard') }}</RouterLink>
    </div>

    <p v-if="!tenant" class="muted">{{ t('home.noTenant') }}</p>
    <p v-else-if="!canCapture" class="alert alert-info">{{ t('quick.notAllowed') }}</p>
    <form v-else class="card form quick-form" @submit.prevent="submit">
      <label class="field">
        <span>{{ t('todo.title') }}</span>
        <input ref="titleInput" v-model="form.title" type="text" maxlength="500" required enterkeyhint="send" autocomplete="off" />
      </label>

      <button type="button" class="link-button more-toggle" :aria-expanded="showMore" @click="showMore = !showMore">
        {{ showMore ? t('quick.less') : t('quick.more') }}
      </button>
      <template v-if="showMore">
        <label class="field">
          <span>{{ t('todo.description') }}</span>
          <textarea v-model="form.description" rows="3" maxlength="20000" />
        </label>
        <label class="field">
          <span>{{ t('todo.project') }}</span>
          <select v-model="form.projectId">
            <option v-if="mayUseNoProject" :value="null">{{ t('todo.noProject') }}</option>
            <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>{{ t('todo.priority') }}</span>
          <select v-model="form.priorityId">
            <option :value="null">{{ t('todo.noPriority') }}</option>
            <option v-for="p in reference.priorities" :key="p.id" :value="p.id">{{ refLabel('priority', p) }}</option>
          </select>
        </label>
        <label class="field">
          <span>{{ t('todo.dueDate') }}</span>
          <input v-model="form.dueDate" type="date" />
        </label>
      </template>

      <p v-if="message" class="alert alert-success" role="status">{{ message }}</p>
      <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
      <button class="button primary big" type="submit" :disabled="busy || !form.title.trim()">{{ t('quick.submit') }}</button>
    </form>

    <section v-if="ownEntries.length || otherTenantEntries.length" class="card outbox">
      <h2>{{ t('quick.outbox') }}</h2>
      <ul class="outbox-list">
        <li v-for="entry in ownEntries" :key="entry.clientId">
          <div>
            <strong>{{ entry.input.title }}</strong>
            <div class="muted small">{{ d(new Date(entry.createdAt), 'long') }}</div>
            <div v-if="entry.error" class="error-text small">{{ t('quick.rejected') }} {{ t(errorKey({ code: entry.error })) }}</div>
            <div v-else class="muted small">{{ offline.online ? t('quick.syncing') : t('quick.waiting') }}</div>
          </div>
          <div class="outbox-actions">
            <button v-if="entry.error" type="button" class="button small" @click="offline.retry(entry)">{{ t('quick.retry') }}</button>
            <button type="button" class="button small" @click="offline.discard(entry)">{{ t('quick.discard') }}</button>
          </div>
        </li>
      </ul>
      <p v-if="otherTenantEntries.length" class="muted small">
        {{ t('quick.otherTenants', { n: otherTenantEntries.length, tenants: [...new Set(otherTenantEntries.map((e) => e.tenantName))].join(', ') }, otherTenantEntries.length) }}
      </p>
    </section>
  </section>
</template>
