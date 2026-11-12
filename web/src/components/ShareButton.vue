<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * Share button (§5 „To-Dos teilen“): on touch devices the native share sheet
 * (Web Share API), otherwise a small menu to copy the link or send it by e-mail.
 */
const props = defineProps<{ todoId: string; title: string; small?: boolean }>();
const { t } = useI18n();
const open = ref(false);
const copied = ref(false);
const root = ref<HTMLElement | null>(null);

const url = computed(() => `${window.location.origin}/todos/${props.todoId}`);
const mailto = computed(
  () => `mailto:?subject=${encodeURIComponent(props.title)}&body=${encodeURIComponent(`${props.title}\n${url.value}`)}`,
);

function useNativeShare(): boolean {
  return typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

function onOutside(event: MouseEvent): void {
  if (root.value && !root.value.contains(event.target as Node)) close();
}

function close(): void {
  open.value = false;
  document.removeEventListener('mousedown', onOutside);
}

async function share(): Promise<void> {
  if (useNativeShare()) {
    try {
      await navigator.share({ title: props.title, url: url.value });
    } catch {
      // cancelled by the user
    }
    return;
  }
  open.value = !open.value;
  copied.value = false;
  if (open.value) document.addEventListener('mousedown', onOutside);
}

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(url.value);
    copied.value = true;
    setTimeout(close, 1200);
  } catch {
    window.prompt(t('share.copyManually'), url.value);
  }
}

onBeforeUnmount(() => document.removeEventListener('mousedown', onOutside));
</script>

<template>
  <span ref="root" class="share" @click.stop @keydown.enter.stop>
    <button
      type="button"
      class="icon-button share-button"
      :class="{ small }"
      :aria-label="t('share.button')"
      :title="t('share.button')"
      :aria-expanded="open"
      @click="share"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="18" cy="5" r="2.5" fill="none" stroke="currentColor" stroke-width="2" />
        <circle cx="6" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="2" />
        <circle cx="18" cy="19" r="2.5" fill="none" stroke="currentColor" stroke-width="2" />
        <path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" stroke="currentColor" stroke-width="2" />
      </svg>
    </button>
    <div v-if="open" class="menu" role="menu">
      <button type="button" role="menuitem" @click="copy">{{ copied ? t('share.copied') : t('share.copy') }}</button>
      <a role="menuitem" :href="mailto" @click="close">{{ t('share.email') }}</a>
    </div>
  </span>
</template>
