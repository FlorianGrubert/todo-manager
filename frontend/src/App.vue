<template>
  <div class="app">
    <header class="app-header">
      <div class="app-header-left">
        <button
          class="icon-button"
          type="button"
          aria-label="Open main menu"
          @click="toggleMainMenu"
        >
          &#9776;
        </button>
        <div class="main-menu" :class="{ hidden: !isMainMenuOpen }">
          <button
            class="main-menu-item"
            type="button"
            @click="openSettingsFromMenu"
          >
            Open Settings
          </button>
        </div>
        <h1>ToDo-Manager</h1>
      </div>
      <div class="app-header-right">
        <button class="secondary" type="button" @click="openNewTodo">
          + New ToDo
        </button>
      </div>
    </header>

    <p class="subtitle">
      Tile-based kanban board with columns for team members and rows for status.
    </p>

    <main>
      <Board
        :statuses="statuses"
        :team-members="teamMembers"
        :todos="todos"
        @move-todo="handleMoveTodo"
      />

      <NewTodoDialog
        :visible="isNewTodoDialogOpen"
        :statuses="statuses"
        :team-members="teamMembers"
        @close="closeNewTodoDialog"
        @submit="handleNewTodoSubmit"
      />

      <SettingsDialog
        :visible="isSettingsDialogOpen"
        :statuses="statuses"
        :team-members="teamMembers"
        @close="closeSettingsDialog"
        @add-team-member="handleAddTeamMember"
        @rename-team-member="handleRenameTeamMember"
        @delete-team-member="handleDeleteTeamMember"
        @add-status="handleAddStatus"
        @rename-status="handleRenameStatus"
        @delete-status="handleDeleteStatus"
      />
    </main>

    <footer class="app-footer">
      <span>ToDo-Manager</span>
      <span>Author: Florian Grubert</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import Board from "./components/Board.vue";
import NewTodoDialog from "./components/NewTodoDialog.vue";
import SettingsDialog from "./components/SettingsDialog.vue";
import type { Status, TeamMember, ToDo } from "./types";
import {
  fetchStatuses,
  fetchTeamMembers,
  fetchToDos,
  updateToDo,
  createToDo,
  createTeamMember,
  renameTeamMember,
  deleteTeamMember,
  createStatus,
  renameStatus,
  deleteStatus
} from "./api";

const statuses = ref<Status[]>([]);
const teamMembers = ref<TeamMember[]>([]);
const todos = ref<ToDo[]>([]);

const isMainMenuOpen = ref(false);
const isNewTodoDialogOpen = ref(false);
const isSettingsDialogOpen = ref(false);

function toggleMainMenu() {
  isMainMenuOpen.value = !isMainMenuOpen.value;
}

function openSettingsFromMenu() {
  isMainMenuOpen.value = false;
  isSettingsDialogOpen.value = true;
}

function openNewTodo() {
  isNewTodoDialogOpen.value = true;
}

onMounted(async () => {
  const [statusData, teamData, todoData] = await Promise.all([
    fetchStatuses(),
    fetchTeamMembers(),
    fetchToDos()
  ]);
  statuses.value = statusData;
  teamMembers.value = teamData;
  todos.value = todoData;
});

async function handleMoveTodo(payload: {
  id: number;
  statusName: string;
  teamMemberId: number | null;
}) {
  try {
    const updated = await updateToDo(payload.id, {
      statusName: payload.statusName,
      teamMemberId: payload.teamMemberId
    });
    const idx = todos.value.findIndex((t) => t.id === payload.id);
    if (idx !== -1) {
      todos.value[idx] = updated;
    }
  } catch (err) {
    // eslint-disable-next-line no-alert
    alert((err as Error).message);
  }
}

async function handleNewTodoSubmit(payload: {
  title: string;
  description: string;
  teamMemberId: number | null;
  statusName: string;
  dueDate: string;
}) {
  try {
    const todo = await createToDo(payload);
    todos.value.push(todo);
    isNewTodoDialogOpen.value = false;
  } catch (err) {
    // eslint-disable-next-line no-alert
    alert((err as Error).message);
  }
}

function closeNewTodoDialog() {
  isNewTodoDialogOpen.value = false;
}

function closeSettingsDialog() {
  isSettingsDialogOpen.value = false;
}

async function handleAddTeamMember(name: string) {
  try {
    const member = await createTeamMember(name);
    teamMembers.value.push(member);
  } catch (err) {
    // eslint-disable-next-line no-alert
    alert((err as Error).message);
  }
}

async function handleRenameTeamMember(payload: { id: number; name: string }) {
  try {
    const member = await renameTeamMember(payload.id, payload.name);
    const idx = teamMembers.value.findIndex((m) => m.id === member.id);
    if (idx !== -1) {
      teamMembers.value[idx] = member;
    }
    // keep todos in sync
    todos.value = todos.value.map((t) =>
      t.teamMember && t.teamMember.id === member.id
        ? { ...t, teamMember: { ...t.teamMember, name: member.name } }
        : t
    );
  } catch (err) {
    // eslint-disable-next-line no-alert
    alert((err as Error).message);
  }
}

async function handleDeleteTeamMember(id: number) {
  try {
    await deleteTeamMember(id);
    teamMembers.value = teamMembers.value.filter((m) => m.id !== id);
  } catch (err) {
    // eslint-disable-next-line no-alert
    alert((err as Error).message);
  }
}

async function handleAddStatus(name: string) {
  try {
    const status = await createStatus(name);
    statuses.value.push(status);
  } catch (err) {
    // eslint-disable-next-line no-alert
    alert((err as Error).message);
  }
}

async function handleRenameStatus(payload: {
  currentName: string;
  newName: string;
}) {
  try {
    const updated = await renameStatus(payload.currentName, payload.newName);
    const idx = statuses.value.findIndex((s) => s.name === payload.currentName);
    if (idx !== -1) {
      statuses.value[idx] = updated;
    }
    // update todos that reference this status
    todos.value = todos.value.map((t) =>
      t.status && t.status.name === payload.currentName
        ? { ...t, status: { ...t.status, name: updated.name } }
        : t
    );
  } catch (err) {
    // eslint-disable-next-line no-alert
    alert((err as Error).message);
  }
}

async function handleDeleteStatus(name: string) {
  try {
    await deleteStatus(name);
    statuses.value = statuses.value.filter((s) => s.name !== name);
  } catch (err) {
    // eslint-disable-next-line no-alert
    alert((err as Error).message);
  }
}
</script>

