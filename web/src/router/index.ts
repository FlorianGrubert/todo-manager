import { createRouter, createWebHistory } from 'vue-router';
import { useSessionStore } from '../stores/session';

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean;
    systemAdmin?: boolean;
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { public: true } },
    { path: '/forgot', name: 'forgot', component: () => import('../views/ForgotView.vue'), meta: { public: true } },
    { path: '/reset/:token', name: 'reset', component: () => import('../views/ResetView.vue'), meta: { public: true } },
    { path: '/invite/:token', name: 'invite', component: () => import('../views/InviteView.vue'), meta: { public: true } },
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
    { path: '/settings', name: 'settings', component: () => import('../views/SettingsView.vue') },
    {
      path: '/system',
      name: 'system',
      component: () => import('../views/SystemView.vue'),
      meta: { systemAdmin: true },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async (to) => {
  const session = useSessionStore();
  if (!session.loaded) await session.load();
  if (to.meta.public) return true;
  if (!session.user) return { name: 'login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} };
  if (to.meta.systemAdmin && !session.isSystemAdmin) return { name: 'home' };
  return true;
});
