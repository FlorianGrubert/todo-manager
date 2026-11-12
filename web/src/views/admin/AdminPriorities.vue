<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  PRIORITY_ICON_COLORS,
  PRIORITY_ICON_DIRECTIONS,
  PRIORITY_ICON_KINDS,
  type PriorityDto,
  type PriorityIconColor,
  type PriorityIconDirection,
  type PriorityIconKind,
} from '@fg/shared';
import { get, patch, post } from '../../api/client';
import PriorityIcon from '../../components/PriorityIcon.vue';
import ReplaceDialog from '../../components/ReplaceDialog.vue';
import { errorKey } from '../../i18n';
import { refLabel, useReferenceStore } from '../../stores/reference';
import { useSessionStore } from '../../stores/session';

const { t } = useI18n();
const session = useSessionStore();
const reference = useReferenceStore();
const priorities = ref<PriorityDto[]>([]);
const error = ref('');
const message = ref('');
const draft = reactive({
  name: '',
  rank: 5,
  iconKind: 'arrows' as PriorityIconKind,
  iconArrows: 1,
  iconDirection: 'down' as PriorityIconDirection,
  iconColor: 'green' as PriorityIconColor,
});

async function run(action: () => Promise<unknown>, success = ''): Promise<void> {
  error.value = '';
  message.value = '';
  try {
    await action();
    message.value = success;
    priorities.value = await get<PriorityDto[]>('/api/priorities');
    if (session.activeTenant) await reference.load(session.activeTenant.id, true);
  } catch (err) {
    error.value = t(errorKey(err));
  }
}

const save = (p: PriorityDto, changes: Record<string, unknown>) =>
  run(() => patch(`/api/priorities/${p.id}`, changes), t('common.saved'));

function rename(p: PriorityDto): void {
  const name = window.prompt(t('admin.statuses.name'), refLabel('priority', p));
  if (name === null) return;
  void save(p, { name: name.trim() || (p.key ? null : refLabel('priority', p)) });
}

const removing = ref<PriorityDto | null>(null);

function confirmRemove(replacementId: string | null): void {
  const target = removing.value;
  removing.value = null;
  if (target) void run(() => post(`/api/priorities/${target.id}/remove`, { replacementId }), t('admin.removed'));
}

function create(): void {
  void run(async () => {
    await post('/api/priorities', { ...draft, name: draft.name.trim() });
    draft.name = '';
  }, t('common.saved'));
}

onMounted(() => run(() => Promise.resolve()));
</script>

<template>
  <div class="grid-main-side">
    <section class="card">
      <h2>{{ t('admin.tab.priorities') }}</h2>
      <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
      <p v-if="message" class="alert alert-success" role="status">{{ message }}</p>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>{{ t('admin.statuses.rank') }}</th>
              <th>{{ t('admin.statuses.name') }}</th>
              <th>{{ t('admin.priorities.icon') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in priorities" :key="p.id">
              <td>
                <input class="rank-input" type="number" :value="p.rank" :aria-label="t('admin.statuses.rank')" @change="save(p, { rank: Number(($event.target as HTMLInputElement).value) })" />
              </td>
              <td>
                <PriorityIcon :kind="p.iconKind" :arrows="p.iconArrows" :direction="p.iconDirection" :color="p.iconColor" />
                {{ refLabel('priority', p) }}
              </td>
              <td class="icon-editor">
                <select :value="p.iconKind" :aria-label="t('admin.priorities.kind')" @change="save(p, { iconKind: ($event.target as HTMLSelectElement).value })">
                  <option v-for="k in PRIORITY_ICON_KINDS" :key="k" :value="k">{{ t(`admin.priorities.kinds.${k}`) }}</option>
                </select>
                <template v-if="p.iconKind === 'arrows'">
                  <select :value="p.iconArrows" :aria-label="t('admin.priorities.arrows')" @change="save(p, { iconArrows: Number(($event.target as HTMLSelectElement).value) })">
                    <option v-for="n in 3" :key="n" :value="n">{{ n }}</option>
                  </select>
                  <select :value="p.iconDirection" :aria-label="t('admin.priorities.direction')" @change="save(p, { iconDirection: ($event.target as HTMLSelectElement).value })">
                    <option v-for="dir in PRIORITY_ICON_DIRECTIONS" :key="dir" :value="dir">{{ t(`admin.priorities.directions.${dir}`) }}</option>
                  </select>
                  <select :value="p.iconColor" :aria-label="t('admin.priorities.color')" @change="save(p, { iconColor: ($event.target as HTMLSelectElement).value })">
                    <option v-for="c in PRIORITY_ICON_COLORS" :key="c" :value="c">{{ t(`admin.priorities.colors.${c}`) }}</option>
                  </select>
                </template>
              </td>
              <td class="actions">
                <button type="button" class="button small" @click="rename(p)">{{ t('common.rename') }}</button>
                <button type="button" class="button small" @click="removing = p">{{ t('common.remove') }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h2>{{ t('admin.priorities.new') }}</h2>
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
          <span>{{ t('admin.priorities.kind') }}</span>
          <select v-model="draft.iconKind">
            <option v-for="k in PRIORITY_ICON_KINDS" :key="k" :value="k">{{ t(`admin.priorities.kinds.${k}`) }}</option>
          </select>
        </label>
        <template v-if="draft.iconKind === 'arrows'">
          <label class="field">
            <span>{{ t('admin.priorities.arrows') }}</span>
            <select v-model.number="draft.iconArrows">
              <option v-for="n in 3" :key="n" :value="n">{{ n }}</option>
            </select>
          </label>
          <label class="field">
            <span>{{ t('admin.priorities.direction') }}</span>
            <select v-model="draft.iconDirection">
              <option v-for="dir in PRIORITY_ICON_DIRECTIONS" :key="dir" :value="dir">{{ t(`admin.priorities.directions.${dir}`) }}</option>
            </select>
          </label>
          <label class="field">
            <span>{{ t('admin.priorities.color') }}</span>
            <select v-model="draft.iconColor">
              <option v-for="c in PRIORITY_ICON_COLORS" :key="c" :value="c">{{ t(`admin.priorities.colors.${c}`) }}</option>
            </select>
          </label>
        </template>
        <div class="field">
          <span>{{ t('admin.priorities.preview') }}</span>
          <PriorityIcon :kind="draft.iconKind" :arrows="draft.iconArrows" :direction="draft.iconDirection" :color="draft.iconColor" />
        </div>
        <button type="submit" class="button primary">{{ t('common.create') }}</button>
      </form>
    </section>
    <ReplaceDialog
      v-if="removing"
      :title="t('admin.priorities.removeTitle', { name: refLabel('priority', removing) })"
      :text="t('admin.priorities.removeText')"
      :options="priorities.filter((o) => o.id !== removing?.id).map((o) => ({ id: o.id, label: refLabel('priority', o) }))"
      allow-none
      :none-label="t('todo.noPriority')"
      @close="removing = null"
      @confirm="confirmRemove"
    />
  </div>
</template>
