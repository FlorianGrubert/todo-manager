<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppHeader from './components/AppHeader.vue';
import { useSessionStore } from './stores/session';

const route = useRoute();
const session = useSessionStore();
const showShell = computed(() => !route.meta.public && session.user);
</script>

<template>
  <div class="app">
    <AppHeader v-if="showShell" />
    <main :class="showShell ? 'app-main' : 'app-public'">
      <RouterView />
    </main>
  </div>
</template>
