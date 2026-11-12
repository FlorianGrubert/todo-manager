<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

defineProps<{ title: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const dialog = ref<HTMLElement | null>(null);

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close');
}

onMounted(() => {
  document.addEventListener('keydown', onKey);
  document.body.classList.add('modal-open');
  dialog.value?.focus();
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey);
  document.body.classList.remove('modal-open');
});
</script>

<template>
  <div class="modal-backdrop" @mousedown.self="emit('close')">
    <section ref="dialog" class="modal card" :class="{ wide }" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1">
      <header class="modal-header">
        <h2>{{ title }}</h2>
        <button type="button" class="icon-button" :aria-label="t('common.close')" @click="emit('close')">×</button>
      </header>
      <div class="modal-body">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="modal-footer">
        <slot name="footer" />
      </footer>
    </section>
  </div>
</template>
