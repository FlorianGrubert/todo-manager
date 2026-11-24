<script setup lang="ts">
import { computed, onBeforeUnmount, ref, type CSSProperties } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TodoLinkDto } from '@fg/shared';
import { linkTarget, linkText, safeLinks } from '../links';

/**
 * Opens the links of a To-Do directly from its card: one link opens at once,
 * several links are offered in a small menu. The menu is rendered into the
 * page body (fixed position), so lanes with scrolling do not cut it off.
 */
const props = defineProps<{ links: TodoLinkDto[] }>();
const { t } = useI18n();
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const menu = ref<HTMLElement | null>(null);
const menuStyle = ref<CSSProperties>({});

const links = computed(() => safeLinks(props.links));
const single = computed(() => (links.value.length === 1 ? links.value[0] : undefined));

const GAP = 4;
const MARGIN = 8;
const ITEM_HEIGHT = 38;

/** Right-aligned below the button; above it if there is not enough room; never beyond the viewport. */
function place(): void {
  const button = root.value?.querySelector('button');
  if (!button) return;
  const rect = button.getBoundingClientRect();
  const estimated = links.value.length * ITEM_HEIGHT + 2 * MARGIN;
  const below = document.documentElement.clientHeight - rect.bottom - GAP - MARGIN;
  const above = rect.top - GAP - MARGIN;
  const openUp = below < estimated && above > below;
  menuStyle.value = {
    position: 'fixed',
    boxSizing: 'border-box',
    minWidth: `${Math.min(180, rect.right - MARGIN)}px`,
    left: 'auto',
    right: `${Math.max(MARGIN, document.documentElement.clientWidth - rect.right)}px`,
    maxWidth: `${Math.min(320, rect.right - MARGIN)}px`,
    maxHeight: `${Math.max(openUp ? above : below, ITEM_HEIGHT * 2)}px`,
    overflowY: 'auto',
    ...(openUp ? { top: 'auto', bottom: `${document.documentElement.clientHeight - rect.top + GAP}px` } : { top: `${rect.bottom + GAP}px` }),
  };
}

function onOutside(event: MouseEvent): void {
  const target = event.target as Node;
  if (root.value?.contains(target) || menu.value?.contains(target)) return;
  close();
}

function listen(on: boolean): void {
  if (on) {
    document.addEventListener('mousedown', onOutside);
    // Scrolling a lane or the page would detach the menu from its button.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
  } else {
    document.removeEventListener('mousedown', onOutside);
    window.removeEventListener('scroll', close, true);
    window.removeEventListener('resize', close);
  }
}

function close(): void {
  open.value = false;
  listen(false);
}

function toggle(): void {
  if (open.value) {
    close();
    return;
  }
  place();
  open.value = true;
  listen(true);
}

onBeforeUnmount(() => listen(false));
</script>

<template>
  <span v-if="links.length" ref="root" class="share link-button-wrap" @click.stop @keydown.enter.stop>
    <a
      v-if="single"
      class="icon-button share-button card-link-button"
      :href="single.url"
      v-bind="linkTarget(single.url)"
      draggable="false"
      :title="t('todo.openLink', { name: linkText(single) })"
      :aria-label="t('todo.openLink', { name: linkText(single) })"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
    </a>
    <template v-else>
      <button
        type="button"
        class="icon-button share-button card-link-button"
        :title="t('todo.openLinks', { n: links.length })"
        :aria-label="t('todo.openLinks', { n: links.length })"
        :aria-expanded="open"
        @click="toggle"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg><span class="link-count">{{ links.length }}</span>
      </button>
      <Teleport to="body">
        <div v-if="open" ref="menu" class="menu link-menu" role="menu" :style="menuStyle">
          <a
            v-for="(link, i) in links"
            :key="i"
            role="menuitem"
            :href="link.url"
            v-bind="linkTarget(link.url)"
            draggable="false"
            :title="link.url"
            @click="close"
          >
            {{ linkText(link) }}
          </a>
        </div>
      </Teleport>
    </template>
  </span>
</template>
