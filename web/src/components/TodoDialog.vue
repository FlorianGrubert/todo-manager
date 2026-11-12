<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CommentDto, HistoryResponse, MemberDto, TagDto, TodoDto, TodoInput, TodoLinkDto } from '@fg/shared';
import { get, patch, post } from '../api/client';
import { errorKey } from '../i18n';
import { onLive } from '../live';
import { refLabel, useReferenceStore } from '../stores/reference';
import { useSessionStore } from '../stores/session';
import AppModal from './AppModal.vue';
import ShareButton from './ShareButton.vue';
import TodoHistory from './TodoHistory.vue';

const props = defineProps<{ todoId: string | null; defaults?: Partial<TodoInput> }>();
const emit = defineEmits<{ close: []; saved: [todo: TodoDto] }>();

const { t, d } = useI18n();
const reference = useReferenceStore();
const session = useSessionStore();

const todo = ref<TodoDto | null>(null);
const tab = ref<'details' | 'comments' | 'history'>('details');
const error = ref('');
const busy = ref(false);
const loading = ref(Boolean(props.todoId));
const assignable = ref<MemberDto[]>([]);
const comments = ref<CommentDto[]>([]);
const newComment = ref('');
const history = ref<HistoryResponse | null>(null);
/** Snapshot of the form after loading – used to detect unsaved edits. */
const pristine = ref('');
const changedElsewhere = ref(false);

const form = reactive({
  title: '',
  description: '',
  projectId: null as string | null,
  statusId: '',
  priorityId: null as string | null,
  assigneeId: null as string | null,
  dueDate: '',
  tags: '',
  links: [] as TodoLinkDto[],
});

const isNew = computed(() => props.todoId === null);
const editable = computed(() => isNew.value || (todo.value?.canEdit ?? false));
const tenant = computed(() => session.activeTenant);

/** Projects in which the member may create To-Dos (plus the current one). */
const projectOptions = computed(() =>
  reference.projects.filter(
    (p) =>
      p.id === todo.value?.projectId ||
      (!p.archived && (p.myRole === 'admin' || p.myRole === 'editor' || p.myRole === 'restricted')),
  ),
);
const mayUseNoProject = computed(
  () =>
    todo.value?.projectId === null ||
    tenant.value?.role === 'admin' ||
    ['editor', 'restricted'].includes(tenant.value?.defaultRole ?? 'none'),
);

type FormSource = Partial<Omit<TodoDto, 'tags' | 'links'>> & { tags?: (string | TagDto)[]; links?: TodoLinkDto[] };

function fillForm(source: FormSource): void {
  form.title = source.title ?? '';
  form.description = source.description ?? '';
  form.projectId = source.projectId ?? null;
  form.statusId = source.statusId ?? reference.statuses.find((s) => s.isNewDefault)?.id ?? reference.statuses[0]?.id ?? '';
  form.priorityId = source.priorityId ?? null;
  form.assigneeId = source.assigneeId ?? null;
  form.dueDate = source.dueDate ?? '';
  form.tags = Array.isArray(source.tags)
    ? source.tags.map((tag) => (typeof tag === 'string' ? tag : tag.name)).join(', ')
    : '';
  form.links = (source.links ?? []).map((l) => ({ url: l.url, label: l.label ?? '' }));
}

async function loadAssignable(): Promise<void> {
  try {
    assignable.value = await get<MemberDto[]>(`/api/members/assignable?projectId=${form.projectId ?? 'none'}`);
  } catch {
    assignable.value = [];
  }
}

async function loadComments(): Promise<void> {
  if (props.todoId) comments.value = await get<CommentDto[]>(`/api/todos/${props.todoId}/comments`);
}

async function loadHistory(): Promise<void> {
  if (props.todoId) history.value = await get<HistoryResponse>(`/api/todos/${props.todoId}/history`);
}

onMounted(async () => {
  try {
    if (props.todoId) {
      todo.value = await get<TodoDto>(`/api/todos/${props.todoId}`);
      fillForm(todo.value);
      pristine.value = JSON.stringify(payload());
    } else {
      fillForm((props.defaults ?? {}) as FormSource);
      if (!form.projectId && !mayUseNoProject.value) form.projectId = projectOptions.value[0]?.id ?? null;
    }
    await loadAssignable();
  } catch (err) {
    error.value = t(errorKey(err));
  } finally {
    loading.value = false;
  }
});

watch(
  () => form.projectId,
  async () => {
    await loadAssignable();
    if (form.assigneeId && !assignable.value.some((m) => m.id === form.assigneeId)) form.assigneeId = null;
  },
);
watch(tab, async (value) => {
  try {
    if (value === 'comments') await loadComments();
    if (value === 'history') await loadHistory();
  } catch (err) {
    error.value = t(errorKey(err));
  }
});

/**
 * Live update: someone else changed this To-Do. Without unsaved edits the dialog
 * reloads silently; otherwise a hint is shown and the user's input is kept.
 */
onLive('todos', async (event) => {
  if (!props.todoId || event.todoId !== props.todoId || busy.value) return;
  try {
    if (tab.value === 'comments') await loadComments();
    if (tab.value === 'history') await loadHistory();
    const fresh = await get<TodoDto>(`/api/todos/${props.todoId}`);
    if (JSON.stringify(payload()) === pristine.value) {
      todo.value = fresh;
      fillForm(fresh);
      pristine.value = JSON.stringify(payload());
    } else if (fresh.updatedAt !== todo.value?.updatedAt) {
      todo.value = { ...fresh };
      changedElsewhere.value = true;
    }
  } catch {
    // the To-Do may no longer be visible; the board reload handles that
  }
});

/** Restricted editors may only assign themselves. */
const assigneeOptions = computed(() => {
  const role = form.projectId ? reference.projectById.get(form.projectId)?.myRole : tenant.value?.role === 'admin' ? 'admin' : tenant.value?.defaultRole;
  if (role === 'restricted') return assignable.value.filter((m) => m.id === tenant.value?.membershipId || m.id === form.assigneeId);
  return assignable.value;
});

function payload(): TodoInput {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    projectId: form.projectId,
    statusId: form.statusId,
    priorityId: form.priorityId,
    assigneeId: form.assigneeId,
    dueDate: form.dueDate || null,
    tags: form.tags
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    links: form.links.filter((l) => l.url.trim()).map((l) => ({ url: l.url.trim(), label: l.label?.trim() || null })),
  };
}

async function save(): Promise<void> {
  error.value = '';
  busy.value = true;
  try {
    const saved = isNew.value
      ? await post<TodoDto>('/api/todos', payload())
      : await patch<TodoDto>(`/api/todos/${props.todoId}`, payload());
    await reference.reloadTags();
    emit('saved', saved);
    emit('close');
  } catch (err) {
    error.value = t(errorKey(err));
  } finally {
    busy.value = false;
  }
}

async function cancelTodo(): Promise<void> {
  if (!props.todoId || !window.confirm(t('todo.confirmCancel'))) return;
  error.value = '';
  try {
    const saved = await post<TodoDto>(`/api/todos/${props.todoId}/cancel`);
    emit('saved', saved);
    emit('close');
  } catch (err) {
    error.value = t(errorKey(err));
  }
}

async function addComment(): Promise<void> {
  if (!newComment.value.trim() || !props.todoId) return;
  error.value = '';
  try {
    const comment = await post<CommentDto>(`/api/todos/${props.todoId}/comments`, { body: newComment.value.trim() });
    comments.value.push(comment);
    newComment.value = '';
  } catch (err) {
    error.value = t(errorKey(err));
  }
}
</script>

<template>
  <AppModal :title="isNew ? t('todo.new') : t('todo.edit')" wide @close="emit('close')">
    <p v-if="loading" class="muted">{{ t('common.loading') }}</p>
    <template v-else>
      <nav v-if="!isNew" class="tabs" role="tablist">
        <button type="button" role="tab" :aria-selected="tab === 'details'" @click="tab = 'details'">{{ t('todo.tabDetails') }}</button>
        <button type="button" role="tab" :aria-selected="tab === 'comments'" @click="tab = 'comments'">
          {{ t('todo.tabComments') }}<span v-if="todo?.commentCount" class="count">{{ todo.commentCount }}</span>
        </button>
        <button type="button" role="tab" :aria-selected="tab === 'history'" @click="tab = 'history'">{{ t('todo.tabHistory') }}</button>
        <span class="spacer" />
        <ShareButton v-if="todo" :todo-id="todo.id" :title="todo.title" />
      </nav>

      <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
      <p v-if="changedElsewhere" class="alert alert-info" role="status">{{ t('todo.changedElsewhere') }}</p>

      <form v-if="tab === 'details'" id="todo-form" class="form todo-form" @submit.prevent="save">
        <p v-if="!editable" class="alert alert-info">{{ t('todo.readOnly') }}</p>
        <fieldset :disabled="!editable" class="plain">
          <label class="field">
            <span>{{ t('todo.title') }}</span>
            <input v-model="form.title" type="text" maxlength="500" required />
          </label>
          <label class="field">
            <span>{{ t('todo.description') }}</span>
            <textarea v-model="form.description" rows="4" maxlength="20000" />
          </label>
          <div class="form-grid">
            <label class="field">
              <span>{{ t('todo.project') }}</span>
              <select v-model="form.projectId">
                <option v-if="mayUseNoProject" :value="null">{{ t('todo.noProject') }}</option>
                <option v-for="p in projectOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </label>
            <label class="field">
              <span>{{ t('todo.status') }}</span>
              <select v-model="form.statusId">
                <option v-for="s in reference.statuses" :key="s.id" :value="s.id">{{ refLabel('status', s) }}</option>
              </select>
            </label>
            <label class="field">
              <span>{{ t('todo.priority') }}</span>
              <select v-model="form.priorityId">
                <option :value="null">{{ t('todo.noPriority') }}</option>
                <option v-for="p in reference.priorities" :key="p.id" :value="p.id">{{ refLabel('priority', p) }}</option>
              </select>
            </label>
            <label class="field">
              <span>{{ t('todo.assignee') }}</span>
              <select v-model="form.assigneeId">
                <option :value="null">{{ t('todo.unassigned') }}</option>
                <option v-for="m in assigneeOptions" :key="m.id" :value="m.id">{{ m.displayName }}</option>
              </select>
            </label>
            <label class="field">
              <span>{{ t('todo.dueDate') }}</span>
              <input v-model="form.dueDate" type="date" />
            </label>
            <label class="field">
              <span>{{ t('todo.tags') }}</span>
              <input v-model="form.tags" type="text" list="tag-options" :placeholder="t('todo.tagsHint')" />
              <datalist id="tag-options">
                <option v-for="tag in reference.tags" :key="tag.id" :value="tag.name" />
              </datalist>
            </label>
          </div>

          <div class="field">
            <span>{{ t('todo.links') }}</span>
            <div v-for="(link, i) in form.links" :key="i" class="link-row">
              <input v-model="link.url" type="url" :placeholder="t('todo.linkUrl')" :aria-label="t('todo.linkUrl')" />
              <input v-model="link.label" type="text" :placeholder="t('todo.linkLabel')" :aria-label="t('todo.linkLabel')" />
              <button type="button" class="icon-button" :aria-label="t('todo.removeLink')" @click="form.links.splice(i, 1)">×</button>
            </div>
            <button v-if="editable" type="button" class="button small" @click="form.links.push({ url: '', label: '' })">
              {{ t('todo.addLink') }}
            </button>
          </div>
        </fieldset>

        <p v-if="todo" class="muted meta">
          {{ t('todo.createdMeta', { name: todo.createdBy.displayName, date: d(new Date(todo.createdAt), 'long') }) }}
          <br />
          {{ t('todo.updatedMeta', { name: todo.updatedBy.displayName, date: d(new Date(todo.updatedAt), 'long') }) }}
        </p>
      </form>

      <section v-else-if="tab === 'comments'" class="comments">
        <p v-if="comments.length === 0" class="muted">{{ t('comments.empty') }}</p>
        <article v-for="c in comments" :key="c.id" class="comment">
          <header>
            <strong>{{ c.author.displayName }}</strong>
            <span class="muted">{{ d(new Date(c.createdAt), 'long') }}</span>
          </header>
          <p>{{ c.body }}</p>
        </article>
        <form class="form" @submit.prevent="addComment">
          <label class="field">
            <span class="sr-only">{{ t('comments.placeholder') }}</span>
            <textarea v-model="newComment" rows="3" maxlength="10000" :placeholder="t('comments.placeholder')" />
          </label>
          <button class="button primary" type="submit" :disabled="!newComment.trim()">{{ t('comments.add') }}</button>
        </form>
      </section>

      <TodoHistory v-else :history="history" />
    </template>

    <template v-if="tab === 'details' && !loading" #footer>
      <button v-if="!isNew && editable" type="button" class="button danger-outline" @click="cancelTodo">
        {{ t('todo.cancelTodo') }}
      </button>
      <span class="spacer" />
      <button type="button" class="button" @click="emit('close')">{{ t('common.close') }}</button>
      <button v-if="editable" type="submit" form="todo-form" class="button primary" :disabled="busy">{{ t('common.save') }}</button>
    </template>
  </AppModal>
</template>
