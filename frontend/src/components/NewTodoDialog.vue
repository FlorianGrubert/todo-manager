<template>
  <div
    v-if="visible"
    class="backdrop"
    @click="onBackdropClick"
  >
    <div class="dialog" @click.stop>
      <div class="dialog-header">
        <h2>New ToDo</h2>
        <button
          class="icon-button"
          type="button"
          aria-label="Close"
          @click="onClose"
        >
          &times;
        </button>
      </div>

      <form class="form-grid" @submit.prevent="onSubmit">
        <label>
          <span>Title</span>
          <input v-model="title" type="text" required />
        </label>

        <label>
          <span>Description</span>
          <textarea v-model="description" rows="3" />
        </label>

        <label>
          <span>Team member</span>
          <select v-model="teamMemberId">
            <option value="">Unassigned</option>
            <option
              v-for="member in teamMembers"
              :key="member.id"
              :value="String(member.id)"
            >
              {{ member.name }}
            </option>
          </select>
        </label>

        <label>
          <span>Status</span>
          <select v-model="statusName" required>
            <option
              v-for="status in statuses"
              :key="status.name"
              :value="status.name"
            >
              {{ status.name }}
            </option>
          </select>
        </label>

        <label>
          <span>Due date</span>
          <input
            v-model="dueDateInput"
            type="datetime-local"
            required
          />
        </label>

        <div class="form-actions">
          <button type="submit">
            Create ToDo
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch, ref } from "vue";
import type { Status, TeamMember } from "../types";

const props = defineProps<{
  visible: boolean;
  statuses: Status[];
  teamMembers: TeamMember[];
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "submit", payload: {
    title: string;
    description: string;
    teamMemberId: number | null;
    statusName: string;
    dueDate: string;
  }): void;
}>();

const title = ref("");
const description = ref("");
const teamMemberId = ref<string>("");
const statusName = ref("");
const dueDateInput = ref("");

function initForm() {
  title.value = "";
  description.value = "";
  teamMemberId.value = "";
  statusName.value = props.statuses[0]?.name ?? "";

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  dueDateInput.value = now.toISOString().slice(0, 16);
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      initForm();
    }
  }
);

function onBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    onClose();
  }
}

function onClose() {
  emit("close");
}

function onSubmit() {
  if (!title.value || !statusName.value || !dueDateInput.value) {
    // eslint-disable-next-line no-alert
    alert("Please fill in all required fields.");
    return;
  }

  const dueDate = new Date(dueDateInput.value);
  const memberId = teamMemberId.value ? Number(teamMemberId.value) : null;

  emit("submit", {
    title: title.value.trim(),
    description: description.value.trim(),
    teamMemberId: memberId,
    statusName: statusName.value,
    dueDate: dueDate.toISOString()
  });
}
</script>

