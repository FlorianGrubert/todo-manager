<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import AppHeader from './components/AppHeader.vue';
import { connectLive, onLive } from './live';
import { useReferenceStore } from './stores/reference';
import { useSessionStore } from './stores/session';

const route = useRoute();
const session = useSessionStore();
const reference = useReferenceStore();
const showShell = computed(() => !route.meta.public && session.user);

// Reference data belongs to a tenant: reload it whenever the active tenant changes.
watch(
  () => session.activeTenant?.id,
  (id) => {
    reference.reset();
    if (id) void reference.load(id).catch(() => undefined);
    connectLive(Boolean(id));
  },
  { immediate: true },
);

onLive('reference', () => {
  if (session.activeTenant) void reference.load(session.activeTenant.id, true).catch(() => undefined);
});
</script>

<template>
  <div class="app">
    <AppHeader v-if="showShell" />
    <main :class="showShell ? 'app-main' : 'app-public'">
      <RouterView />
    </main>
  </div>
</template>
