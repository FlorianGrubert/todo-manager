<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { STATUS_CATEGORIES, type StatusCategory, type StatusDto } from '@fg/shared';
import { get, patch, post } from '../../api/client';
import ReplaceDialog from '../../components/ReplaceDialog.vue';
import { errorKey } from '../../i18n';
import { refLabel, useReferenceStore } from '../../stores/reference';
import { useSessionStore } from '../../stores/session';

const { t } = useI18n();
const session = useSessionStore();
const reference = useReferenceStore();
const statuses = ref<StatusDto[]>([]);
const error = ref('');
const message = ref('');
const draft = reactive({ name: '', rank: 100, color: '#64748b', category: 'open' as StatusCategory });

async function run(action: () => Promise<unknown>, success = ''): Promise<void> {
  error.value = '';
  message.value = '';
  try {
    await action();
    message.value = success;
    statuses.value = await get<StatusDto[]>('/api/statuses');
    if (session.activeTenant) await reference.load(session.activeTenant.id, true);
  } catch (err) {
    error.value = t(errorKey(err));
  }
}

const save = (s: StatusDto, changes: Record<string, unknown>) => run(() => patch(`/api/statuses/${s.id}`, changes), t('common.saved'));

function rename(s: StatusDto): void {
  const name = window.prompt(t('admin.statuses.name'), refLabel('status', s));
  if (name === null) return;
  // An empty name restores the translated standard name.
  void save(s, { name: name.trim() || (s.key ? null : refLabel('status', s)) });
}

const removing = ref<StatusDto | null>(null);

function confirmRemove(replacementId: string | null): void {
  const target = removing.value;
  removing.value = null;
  if (target && replacementId) {
    void run(() => post(`/api/statuses/${target.id}/remove`, { replacementId }), t('admin.removed'));
  }
}

function create(): void {
  void run(async () => {
    await post('/api/statuses', { ...draft, name: draft.name.trim() });
    draft.name = '';
  }, t('common.saved'));
}

onMounted(() => run(() => Promise.resolve()));
</script>

<template>
  <div class="grid-main-side">
    <section class="card">
      <h2>{{ t('admin.tab.statuses') }}</h2>
      <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
      <p v-if="message" class="alert alert-success" role="status">{{ message }}</p>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>{{ t('admin.statuses.rank') }}</th>
              <th>{{ t('admin.statuses.name') }}</th>
              <th>{{ t('admin.statuses.color') }}</th>
              <th>{{ t('admin.statuses.category') }}</th>
              <th>{{ t('admin.statuses.newDefault') }}</th>
              <th>{{ t('admin.statuses.cancelTarget') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in statuses" :key="s.id">
              <td>
                <input class="rank-input" type="number" :value="s.rank" :aria-label="t('admin.statuses.rank')" @change="save(s, { rank: Number(($event.target as HTMLInputElement).value) })" />
              </td>
              <td><span class="color-dot" :style="{ background: s.color }" /> {{ refLabel('status', s) }}</td>
              <td>
                <input type="color" :value="s.color" :aria-label="t('admin.statuses.color')" @change="save(s, { color: ($event.target as HTMLInputElement).value })" />
              </td>
              <td>
                <select :value="s.category" :aria-label="t('admin.statuses.category')" @change="save(s, { category: ($event.target as HTMLSelectElement).value })">
                  <option v-for="c in STATUS_CATEGORIES" :key="c" :value="c">{{ t(`admin.statuses.categories.${c}`) }}</option>
                </select>
              </td>
              <td>
                <input type="radio" name="new-default" :checked="s.isNewDefault" :aria-label="t('admin.statuses.newDefault')" @change="save(s, { isNewDefault: true })" />
              </td>
              <td>
                <input type="radio" name="cancel-target" :checked="s.isCancelTarget" :aria-label="t('admin.statuses.cancelTarget')" @change="save(s, { isCancelTarget: true })" />
              </td>
              <td class="actions">
                <button type="button" class="button small" @click="rename(s)">{{ t('common.rename') }}</button>
                <button type="button" class="button small" :disabled="s.isNewDefault || s.isCancelTarget" @click="removing = s">{{ t('common.remove') }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="muted small">{{ t('admin.statuses.hint') }}</p>
    </section>

    <section class="card">
      <h2>{{ t('admin.statuses.new') }}</h2>
      <form class="form" @submit.prevent="create">
        <label class="field">
          <span>{{ t('admin.statuses.name') }}</span>
          <input v-model="draft.name" type="text" maxlength="100" required />
        </label>
        <label class="field">
          <span>{{ t('admin.statuses.rank') }}</span>
          <input v-model.number="draft.rank" type="number" required />
        </label>
        <label class="field">
          <span>{{ t('admin.statuses.color') }}</span>
          <input v-model="draft.color" type="color" />
        </label>
        <label class="field">
          <span>{{ t('admin.statuses.category') }}</span>
          <select v-model="draft.category">
            <option v-for="c in STATUS_CATEGORIES" :key="c" :value="c">{{ t(`admin.statuses.categories.${c}`) }}</option>
          </select>
        </label>
        <button type="submit" class="button primary">{{ t('common.create') }}</button>
      </form>
    </section>
    <ReplaceDialog
      v-if="removing"
      :title="t('admin.statuses.removeTitle', { name: refLabel('status', removing) })"
      :text="t('admin.statuses.removeText')"
      :options="statuses.filter((o) => o.id !== removing?.id).map((o) => ({ id: o.id, label: refLabel('status', o) }))"
      @close="removing = null"
      @confirm="confirmRemove"
    />
  </div>
</template>
