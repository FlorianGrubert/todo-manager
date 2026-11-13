import { createRouter, createWebHistory } from 'vue-router';
import { useSessionStore } from '../stores/session';

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean;
    systemAdmin?: boolean;
    tenantAdmin?: boolean;
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { public: true } },
    { path: '/forgot', name: 'forgot', component: () => import('../views/ForgotView.vue'), meta: { public: true } },
    { path: '/reset/:token', name: 'reset', component: () => import('../views/ResetView.vue'), meta: { public: true } },
    { path: '/invite/:token', name: 'invite', component: () => import('../views/InviteView.vue'), meta: { public: true } },
    { path: '/', name: 'todos', component: () => import('../views/BoardView.vue') },
    { path: '/todos/:id', name: 'todo', component: () => import('../views/BoardView.vue') },
    { path: '/quick', name: 'quick', component: () => import('../views/QuickCaptureView.vue') },
    { path: '/projects', name: 'projects', component: () => import('../views/ProjectsView.vue') },
    {
      path: '/admin',
      component: () => import('../views/admin/AdminView.vue'),
      meta: { tenantAdmin: true },
      children: [
        { path: '', redirect: { name: 'admin-members' } },
        { path: 'members', name: 'admin-members', component: () => import('../views/admin/AdminMembers.vue') },
        { path: 'statuses', name: 'admin-statuses', component: () => import('../views/admin/AdminStatuses.vue') },
        { path: 'priorities', name: 'admin-priorities', component: () => import('../views/admin/AdminPriorities.vue') },
        { path: 'tags', name: 'admin-tags', component: () => import('../views/admin/AdminTags.vue') },
      ],
    },
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
  if (to.meta.systemAdmin && !session.isSystemAdmin) return { name: 'todos' };
  if (to.meta.tenantAdmin && session.activeTenant?.role !== 'admin') return { name: 'todos' };
  // System administrators without tenant land in the system administration.
  if (to.name === 'todos' && !session.activeTenant && session.isSystemAdmin) return { name: 'system' };
  return true;
});
