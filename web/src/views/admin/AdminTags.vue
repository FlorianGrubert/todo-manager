<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TagDto } from '@fg/shared';
import { api, get, patch } from '../../api/client';
import { errorKey } from '../../i18n';
import { useReferenceStore } from '../../stores/reference';

const { t } = useI18n();
const reference = useReferenceStore();
const tags = ref<TagDto[]>([]);
const error = ref('');
const message = ref('');

async function run(action: () => Promise<unknown>, success = ''): Promise<void> {
  error.value = '';
  message.value = '';
  try {
    await action();
    message.value = success;
    tags.value = await get<TagDto[]>('/api/tags');
    reference.tags = tags.value;
  } catch (err) {
    error.value = t(errorKey(err));
  }
}

function rename(tag: TagDto): void {
  const name = window.prompt(t('admin.tags.name'), tag.name)?.trim();
  if (name && name !== tag.name) void run(() => patch(`/api/tags/${tag.id}`, { name }), t('common.saved'));
}

function remove(tag: TagDto): void {
  if (window.confirm(t('admin.tags.confirmDelete', { name: tag.name }))) {
    void run(() => api('DELETE', `/api/tags/${tag.id}`), t('admin.removed'));
  }
}

onMounted(() => run(() => Promise.resolve()));
</script>

<template>
  <section class="card">
    <h2>{{ t('admin.tab.tags') }}</h2>
    <p class="muted small">{{ t('admin.tags.hint') }}</p>
    <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
    <p v-if="message" class="alert alert-success" role="status">{{ message }}</p>
    <p v-if="tags.length === 0" class="muted">{{ t('admin.tags.empty') }}</p>
    <table v-else class="table">
      <tbody>
        <tr v-for="tag in tags" :key="tag.id">
          <td><span class="tag" :style="tag.color ? { '--tag-color': tag.color } : undefined">{{ tag.name }}</span></td>
          <td>
            <input type="color" :value="tag.color ?? '#94a3b8'" :aria-label="t('admin.statuses.color')" @change="run(() => patch(`/api/tags/${tag.id}`, { color: ($event.target as HTMLInputElement).value }), t('common.saved'))" />
          </td>
          <td class="actions">
            <button type="button" class="button small" @click="rename(tag)">{{ t('common.rename') }}</button>
            <button type="button" class="button small" @click="remove(tag)">{{ t('common.remove') }}</button>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
