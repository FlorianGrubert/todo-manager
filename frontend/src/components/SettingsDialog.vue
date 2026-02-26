<template>
  <div
    v-if="visible"
    class="backdrop"
    @click="onBackdropClick"
  >
    <div class="dialog dialog-large" @click.stop>
      <div class="dialog-header">
        <h2>Settings</h2>
        <button
          class="icon-button"
          type="button"
          aria-label="Close"
          @click="onClose"
        >
          &times;
        </button>
      </div>

      <div class="dialog-body">
        <section class="dialog-section">
          <h3>Manage Team Members</h3>
          <form class="form-inline" @submit.prevent="onAddTeamMember">
            <input
              v-model="newTeamMemberName"
              type="text"
              placeholder="New team member name"
              required
            />
            <button type="submit">
              Add
            </button>
          </form>
          <ul class="settings-list">
            <li
              v-for="member in teamMembers"
              :key="member.id"
              class="settings-item"
            >
              <span class="settings-item-name">
                {{ member.name }}
              </span>
              <div class="settings-item-actions">
                <button
                  class="secondary"
                  type="button"
                  @click="onRenameTeamMember(member)"
                >
                  Rename
                </button>
                <button
                  class="danger"
                  type="button"
                  @click="onDeleteTeamMember(member)"
                >
                  Delete
                </button>
              </div>
            </li>
          </ul>
        </section>

        <section class="dialog-section">
          <h3>Manage Status</h3>
          <form class="form-inline" @submit.prevent="onAddStatus">
            <input
              v-model="newStatusName"
              type="text"
              placeholder="New status name"
              required
            />
            <button type="submit">
              Add
            </button>
          </form>
          <ul class="settings-list">
            <li
              v-for="status in sortedStatuses"
              :key="status.name"
              class="settings-item"
            >
              <span class="settings-item-name">
                {{ status.name }}
              </span>
              <div class="settings-item-actions">
                <button
                  class="secondary"
                  type="button"
                  @click="onRenameStatus(status)"
                >
                  Rename
                </button>
                <button
                  class="danger"
                  type="button"
                  @click="onDeleteStatus(status)"
                >
                  Delete
                </button>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { Status, TeamMember } from "../types";

const props = defineProps<{
  visible: boolean;
  statuses: Status[];
  teamMembers: TeamMember[];
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "add-team-member", name: string): void;
  (e: "rename-team-member", payload: { id: number; name: string }): void;
  (e: "delete-team-member", id: number): void;
  (e: "add-status", name: string): void;
  (e: "rename-status", payload: { currentName: string; newName: string }): void;
  (e: "delete-status", name: string): void;
}>();

const newTeamMemberName = ref("");
const newStatusName = ref("");

const sortedStatuses = computed(() =>
  [...props.statuses].sort((a, b) => a.rank - b.rank)
);

function onBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    onClose();
  }
}

function onClose() {
  emit("close");
}

function onAddTeamMember() {
  const name = newTeamMemberName.value.trim();
  if (!name) return;
  emit("add-team-member", name);
  newTeamMemberName.value = "";
}

function onRenameTeamMember(member: TeamMember) {
  // eslint-disable-next-line no-alert
  const nextName = window.prompt("New name", member.name);
  if (!nextName) return;
  emit("rename-team-member", { id: member.id, name: nextName.trim() });
}

function onDeleteTeamMember(member: TeamMember) {
  // eslint-disable-next-line no-alert
  const ok = window.confirm(
    "Delete this team member? Only members without todos can be deleted."
  );
  if (!ok) return;
  emit("delete-team-member", member.id);
}

function onAddStatus() {
  const name = newStatusName.value.trim();
  if (!name) return;
  emit("add-status", name);
  newStatusName.value = "";
}

function onRenameStatus(status: Status) {
  // eslint-disable-next-line no-alert
  const nextName = window.prompt("New status name", status.name);
  if (!nextName) return;
  emit("rename-status", {
    currentName: status.name,
    newName: nextName.trim()
  });
}

function onDeleteStatus(status: Status) {
  // eslint-disable-next-line no-alert
  const ok = window.confirm(
    "Delete this status? Only statuses without todos can be deleted."
  );
  if (!ok) return;
  emit("delete-status", status.name);
}
</script>

