<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AppModal from './AppModal.vue';

const props = defineProps<{
  title: string;
  text: string;
  options: { id: string; label: string }[];
  allowNone?: boolean;
  noneLabel?: string;
}>();
const emit = defineEmits<{ close: []; confirm: [replacementId: string | null] }>();
const { t } = useI18n();
const selected = ref<string | null>(props.allowNone ? null : (props.options[0]?.id ?? null));
</script>

<template>
  <AppModal :title="title" @close="emit('close')">
    <form id="replace-form" class="form" @submit.prevent="emit('confirm', selected)">
      <p>{{ text }}</p>
      <label class="field">
        <span>{{ t('admin.replacement') }}</span>
        <select v-model="selected">
          <option v-if="allowNone" :value="null">{{ noneLabel }}</option>
          <option v-for="o in options" :key="o.id" :value="o.id">{{ o.label }}</option>
        </select>
      </label>
    </form>
    <template #footer>
      <span class="spacer" />
      <button type="button" class="button" @click="emit('close')">{{ t('common.cancel') }}</button>
      <button type="submit" form="replace-form" class="button primary">{{ t('common.remove') }}</button>
    </template>
  </AppModal>
</template>
