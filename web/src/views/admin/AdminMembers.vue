<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { DEFAULT_ROLES, LOCALES, TENANT_ROLES, type AdminMemberDto, type DefaultRole, type Locale, type TenantRole } from '@fg/shared';
import { get, patch, post } from '../../api/client';
import { errorKey } from '../../i18n';

const { t, d, locale } = useI18n();
const members = ref<AdminMemberDto[]>([]);
const error = ref('');
const message = ref('');
const invite = reactive({
  email: '',
  displayName: '',
  tenantRole: 'member' as TenantRole,
  defaultRole: 'none' as DefaultRole,
  locale: locale.value as Locale,
});

async function run(action: () => Promise<unknown>, success = ''): Promise<void> {
  error.value = '';
  message.value = '';
  try {
    await action();
    message.value = success;
    members.value = await get<AdminMemberDto[]>('/api/admin/members');
  } catch (err) {
    error.value = t(errorKey(err));
  }
}

const update = (m: AdminMemberDto, changes: Partial<Pick<AdminMemberDto, 'tenantRole' | 'defaultRole' | 'isActive' | 'displayName'>>) =>
  run(() => patch(`/api/admin/members/${m.id}`, changes), t('common.saved'));

function rename(m: AdminMemberDto): void {
  const name = window.prompt(t('admin.members.displayName'), m.displayName)?.trim();
  if (name && name !== m.displayName) void update(m, { displayName: name });
}

function pseudonymize(m: AdminMemberDto): void {
  if (!window.confirm(t('admin.members.confirmPseudonymize', { name: m.displayName }))) return;
  void run(() => post(`/api/admin/members/${m.id}/pseudonymize`), t('admin.members.pseudonymized'));
}

function sendInvite(): void {
  void run(async () => {
    await post('/api/admin/members', { ...invite });
    invite.email = '';
    invite.displayName = '';
  }, t('admin.members.invited'));
}

onMounted(() => run(() => Promise.resolve()));
</script>

<template>
  <div class="grid-main-side">
    <section class="card">
      <h2>{{ t('admin.members.title') }}</h2>
      <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
      <p v-if="message" class="alert alert-success" role="status">{{ message }}</p>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>{{ t('admin.members.displayName') }}</th>
              <th>{{ t('auth.email') }}</th>
              <th>{{ t('admin.members.tenantRole') }}</th>
              <th>{{ t('admin.members.defaultRole') }}</th>
              <th>{{ t('admin.members.lastLogin') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in members" :key="m.id" :class="{ inactive: !m.isActive }">
              <td>
                {{ m.displayName }}
                <span v-if="m.pending" class="badge">{{ t('admin.members.pending') }}</span>
                <span v-else-if="m.pseudonymized" class="badge badge-off">{{ t('admin.members.pseudonymizedBadge') }}</span>
                <span v-else-if="!m.isActive" class="badge badge-off">{{ t('system.inactive') }}</span>
              </td>
              <td>{{ m.email ?? '—' }}</td>
              <td>
                <select :value="m.tenantRole" :disabled="m.pseudonymized" :aria-label="t('admin.members.tenantRole')" @change="update(m, { tenantRole: ($event.target as HTMLSelectElement).value as TenantRole })">
                  <option v-for="r in TENANT_ROLES" :key="r" :value="r">{{ t(`role.${r}`) }}</option>
                </select>
              </td>
              <td>
                <select :value="m.defaultRole" :disabled="m.pseudonymized" :aria-label="t('admin.members.defaultRole')" @change="update(m, { defaultRole: ($event.target as HTMLSelectElement).value as DefaultRole })">
                  <option v-for="r in DEFAULT_ROLES" :key="r" :value="r">{{ t(`role.${r}`) }}</option>
                </select>
              </td>
              <td>{{ m.lastLoginAt ? d(new Date(m.lastLoginAt), 'long') : t('admin.members.neverLoggedIn') }}</td>
              <td class="actions">
                <template v-if="!m.pseudonymized">
                  <button type="button" class="button small" @click="rename(m)">{{ t('common.rename') }}</button>
                  <button v-if="m.pending" type="button" class="button small" @click="run(() => post(`/api/admin/members/${m.id}/resend`), t('admin.members.invited'))">
                    {{ t('admin.members.resend') }}
                  </button>
                  <button type="button" class="button small" @click="update(m, { isActive: !m.isActive })">
                    {{ m.isActive ? t('system.deactivate') : t('system.activate') }}
                  </button>
                  <button type="button" class="button small danger-outline" @click="pseudonymize(m)">{{ t('admin.members.pseudonymize') }}</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="muted small">{{ t('admin.members.defaultRoleHint') }}</p>
    </section>

    <section class="card">
      <h2>{{ t('admin.members.invite') }}</h2>
      <form class="form" @submit.prevent="sendInvite">
        <label class="field">
          <span>{{ t('admin.members.displayName') }}</span>
          <input v-model="invite.displayName" type="text" maxlength="200" required />
        </label>
        <label class="field">
          <span>{{ t('auth.email') }}</span>
          <input v-model="invite.email" type="email" maxlength="320" required />
        </label>
        <label class="field">
          <span>{{ t('admin.members.tenantRole') }}</span>
          <select v-model="invite.tenantRole">
            <option v-for="r in TENANT_ROLES" :key="r" :value="r">{{ t(`role.${r}`) }}</option>
          </select>
        </label>
        <label class="field">
          <span>{{ t('admin.members.defaultRole') }}</span>
          <select v-model="invite.defaultRole">
            <option v-for="r in DEFAULT_ROLES" :key="r" :value="r">{{ t(`role.${r}`) }}</option>
          </select>
        </label>
        <label class="field">
          <span>{{ t('system.inviteLocale') }}</span>
          <select v-model="invite.locale">
            <option v-for="l in LOCALES" :key="l" :value="l">{{ t(`language.${l}`) }}</option>
          </select>
        </label>
        <button type="submit" class="button primary">{{ t('admin.members.sendInvite') }}</button>
      </form>
    </section>
  </div>
</template>
