import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Locale, MeResponse } from '@fg/shared';
import { ApiError, get, patch, post, setCsrfToken } from '../api/client';
import { applyLocale } from '../i18n';
import { connectLive } from '../live';

export const useSessionStore = defineStore('session', () => {
  const me = ref<MeResponse | null>(null);
  const loaded = ref(false);

  const user = computed(() => me.value?.user ?? null);
  const activeTenant = computed(() => me.value?.activeTenant ?? null);
  const tenants = computed(() => me.value?.tenants ?? []);
  const isSystemAdmin = computed(() => me.value?.user.isSystemAdmin ?? false);

  function apply(data: MeResponse | null): void {
    me.value = data;
    setCsrfToken(data?.csrfToken);
    if (data) applyLocale(data.user.locale);
  }

  async function load(): Promise<void> {
    try {
      apply(await get<MeResponse>('/api/auth/me'));
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401) throw err;
      apply(null);
    } finally {
      loaded.value = true;
    }
  }

  async function login(email: string, password: string): Promise<void> {
    apply(await post<MeResponse>('/api/auth/login', { email, password }));
  }

  async function logout(): Promise<void> {
    await post('/api/auth/logout').catch(() => undefined);
    connectLive(false);
    apply(null);
  }

  async function switchTenant(tenantId: string): Promise<void> {
    apply(await post<MeResponse>('/api/auth/switch-tenant', { tenantId }));
  }

  async function updateProfile(changes: {
    locale?: Locale;
    name?: string;
    notifyAssign?: boolean;
    remindDaysBefore?: number | null;
    notifyOverdue?: boolean;
  }): Promise<void> {
    if (!me.value) {
      if (changes.locale) applyLocale(changes.locale);
      return;
    }
    apply(await patch<MeResponse>('/api/auth/me', changes));
  }

  return { me, loaded, user, activeTenant, tenants, isSystemAdmin, apply, load, login, logout, switchTenant, updateProfile };
});
