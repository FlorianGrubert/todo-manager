const apiBase = "";

/** @type {Array<{ name: string; rank: number; color: string; isActive: boolean }>} */
let statuses = [];
/** @type {Array<{ id: number; name: string }>} */
let teamMembers = [];
/** @type {Array<any>} */
let todos = [];

// Main menu / dialogs
const mainMenuButton = document.getElementById("main-menu-button");
const mainMenu = document.getElementById("main-menu");
const openSettingsButton = document.getElementById("open-settings-button");

const newTodoButton = document.getElementById("new-todo-button");
const todoDialogBackdrop = document.getElementById("todo-dialog-backdrop");
const closeTodoDialogButton = document.getElementById("close-todo-dialog");

const settingsDialogBackdrop = document.getElementById(
  "settings-dialog-backdrop"
);
const closeSettingsDialogButton = document.getElementById(
  "close-settings-dialog"
);

// New todo form
const todoForm = document.getElementById("todo-form");
const todoTitleInput = document.getElementById("todo-title");
const todoDescriptionInput = document.getElementById("todo-description");
const todoTeamMemberSelect = document.getElementById("todo-team-member");
const todoStatusSelect = document.getElementById("todo-status");
const todoDueDateInput = document.getElementById("todo-due-date");

// Settings lists / forms
const settingsTeamMemberAddForm = document.getElementById(
  "settings-team-member-add-form"
);
const settingsTeamMemberNameInput = document.getElementById(
  "settings-team-member-name"
);
const settingsTeamMemberList = document.getElementById(
  "settings-team-member-list"
);

const settingsStatusAddForm = document.getElementById(
  "settings-status-add-form"
);
const settingsStatusNameInput = document.getElementById("settings-status-name");
const settingsStatusList = document.getElementById("settings-status-list");

// Board elements
const boardHeaderRow = document.getElementById("board-header-row");
const boardBody = document.getElementById("board-body");

async function apiGet(path) {
  const res = await fetch(apiBase + path);
  if (!res.ok) throw new Error(`GET ${path} failed`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(apiBase + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `POST ${path} failed`);
  }
  return res.json();
}

async function apiPut(path, body) {
  const res = await fetch(apiBase + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `PUT ${path} failed`);
  }
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(apiBase + path, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${path} failed`);
}

function openDialog(backdrop) {
  backdrop.classList.remove("hidden");
}

function closeDialog(backdrop) {
  backdrop.classList.add("hidden");
}

function renderNewTodoFormOptions() {
  todoTeamMemberSelect.innerHTML = "";
  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = "Unassigned";
  todoTeamMemberSelect.appendChild(noneOpt);

  teamMembers.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = String(m.id);
    opt.textContent = m.name;
    todoTeamMemberSelect.appendChild(opt);
  });

  todoStatusSelect.innerHTML = "";
  statuses.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.name;
    opt.textContent = s.name;
    todoStatusSelect.appendChild(opt);
  });
}

function renderSettingsLists() {
  // Team members
  settingsTeamMemberList.innerHTML = "";
  teamMembers.forEach((m) => {
    const li = document.createElement("li");
    li.className = "settings-item";

    const nameSpan = document.createElement("span");
    nameSpan.className = "settings-item-name";
    nameSpan.textContent = m.name;

    const actions = document.createElement("div");
    actions.className = "settings-item-actions";

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "secondary";
    renameBtn.textContent = "Rename";
    renameBtn.addEventListener("click", async () => {
      const nextName = prompt("New name", m.name);
      if (!nextName) return;
      try {
        const updated = await apiPut(`/api/team-members/${m.id}`, {
          name: nextName.trim(),
        });
        const idx = teamMembers.findIndex((x) => x.id === m.id);
        if (idx !== -1) teamMembers[idx] = updated;
        renderSettingsLists();
        renderBoard();
        renderNewTodoFormOptions();
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", async () => {
      if (!confirm("Delete this team member? Only members without todos can be deleted.")) {
        return;
      }
      try {
        await apiDelete(`/api/team-members/${m.id}`);
        teamMembers = teamMembers.filter((x) => x.id !== m.id);
        renderSettingsLists();
        renderBoard();
        renderNewTodoFormOptions();
      } catch (err) {
        alert(err.message || String(err));
      }
    });

    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);

    li.appendChild(nameSpan);
    li.appendChild(actions);
    settingsTeamMemberList.appendChild(li);
  });

  // Statuses
  settingsStatusList.innerHTML = "";
  statuses
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .forEach((s) => {
      const li = document.createElement("li");
      li.className = "settings-item";

      const nameSpan = document.createElement("span");
      nameSpan.className = "settings-item-name";
      nameSpan.textContent = s.name;

      const actions = document.createElement("div");
      actions.className = "settings-item-actions";

      const renameBtn = document.createElement("button");
      renameBtn.type = "button";
      renameBtn.className = "secondary";
      renameBtn.textContent = "Rename";
      renameBtn.addEventListener("click", async () => {
        const nextName = prompt("New status name", s.name);
        if (!nextName) return;
        try {
          const updated = await apiPut(`/api/statuses/${encodeURIComponent(s.name)}`, {
            name: nextName.trim(),
          });
          const idx = statuses.findIndex((x) => x.name === s.name);
          if (idx !== -1) statuses[idx] = updated;
          renderSettingsLists();
          renderBoard();
          renderNewTodoFormOptions();
        } catch (err) {
          alert(err.message || String(err));
        }
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "danger";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", async () => {
        if (!confirm("Delete this status? Only statuses without todos can be deleted.")) {
          return;
        }
        try {
          await apiDelete(`/api/statuses/${encodeURIComponent(s.name)}`);
          statuses = statuses.filter((x) => x.name !== s.name);
          renderSettingsLists();
          renderBoard();
          renderNewTodoFormOptions();
        } catch (err) {
          alert(err.message || String(err));
        }
      });

      actions.appendChild(renameBtn);
      actions.appendChild(deleteBtn);

      li.appendChild(nameSpan);
      li.appendChild(actions);
      settingsStatusList.appendChild(li);
    });
}

function descriptionSnippet(desc) {
  if (!desc) return "";
  const trimmed = desc.trim();
  if (trimmed.length <= 80) return trimmed;
  return `${trimmed.slice(0, 77)}...`;
}

function formatDueDateForTile(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

function createTile(todo) {
  const tile = document.createElement("div");
  tile.className = "todo-tile";
  tile.draggable = true;
  tile.dataset.todoId = String(todo.id);

  const title = document.createElement("div");
  title.className = "todo-tile-title";
  title.textContent = todo.title;

  const desc = document.createElement("div");
  desc.className = "todo-tile-desc";
  desc.textContent = descriptionSnippet(todo.description);

  const meta = document.createElement("div");
  meta.className = "todo-tile-meta";
  const memberLabel = document.createElement("span");
  memberLabel.textContent = todo.teamMember ? todo.teamMember.name : "Unassigned";
  const dueLabel = document.createElement("span");
  dueLabel.textContent = formatDueDateForTile(todo.dueDate);
  meta.appendChild(memberLabel);
  meta.appendChild(dueLabel);

  tile.appendChild(title);
  tile.appendChild(desc);
  tile.appendChild(meta);

  tile.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", String(todo.id));
    e.dataTransfer.effectAllowed = "move";
  });

  return tile;
}

function attachCellDnD(cell) {
  cell.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    cell.classList.add("drop-target");
  });
  cell.addEventListener("dragleave", () => {
    cell.classList.remove("drop-target");
  });
  cell.addEventListener("drop", async (e) => {
    e.preventDefault();
    cell.classList.remove("drop-target");
    const todoId = Number(e.dataTransfer.getData("text/plain"));
    if (!todoId) return;

    const statusName = cell.dataset.statusName;
    const memberIdRaw = cell.dataset.memberId;
    const memberId = memberIdRaw ? Number(memberIdRaw) : null;

    try {
      const body = {
        statusName,
        teamMemberId: memberId,
      };
      const updated = await apiPut(`/api/todos/${todoId}`, body);
      const idx = todos.findIndex((t) => t.id === todoId);
      if (idx !== -1) todos[idx] = updated;
      renderBoard();
    } catch (err) {
      alert(err.message || String(err));
    }
  });
}

function renderBoard() {
  // Header row: Unassigned + team members
  boardHeaderRow.innerHTML = "";

  const unassignedHeader = document.createElement("div");
  unassignedHeader.className = "board-header-cell";
  unassignedHeader.textContent = "Unassigned";
  boardHeaderRow.appendChild(unassignedHeader);

  teamMembers.forEach((m) => {
    const cell = document.createElement("div");
    cell.className = "board-header-cell";
    cell.textContent = m.name;
    boardHeaderRow.appendChild(cell);
  });

  // Body rows: statuses as rows
  boardBody.innerHTML = "";

  const sortedStatuses = statuses.slice().sort((a, b) => a.rank - b.rank);

  sortedStatuses.forEach((status) => {
    const row = document.createElement("div");
    row.className = "board-row";

    const statusLabel = document.createElement("div");
    statusLabel.className = "board-status-label";
    statusLabel.textContent = status.name;
    row.appendChild(statusLabel);

    const columns = [
      { memberId: null, label: "Unassigned" },
      ...teamMembers.map((m) => ({ memberId: m.id, label: m.name })),
    ];

    columns.forEach((col) => {
      const cell = document.createElement("div");
      cell.className = "board-cell";
      cell.dataset.statusName = status.name;
      if (col.memberId != null) {
        cell.dataset.memberId = String(col.memberId);
      } else {
        cell.dataset.memberId = "";
      }

      const matchingTodos = todos.filter((t) => {
        const statusMatch = t.status && t.status.name === status.name;
        const memberMatch =
          (col.memberId == null && !t.teamMember) ||
          (col.memberId != null && t.teamMember && t.teamMember.id === col.memberId);
        return statusMatch && memberMatch;
      });

      matchingTodos.forEach((todo) => {
        const tile = createTile(todo);
        cell.appendChild(tile);
      });

      attachCellDnD(cell);
      row.appendChild(cell);
    });

    boardBody.appendChild(row);
  });
}

async function loadInitialData() {
  try {
    const [s, m, t] = await Promise.all([
      apiGet("/api/statuses"),
      apiGet("/api/team-members"),
      apiGet("/api/todos"),
    ]);
    statuses = s;
    teamMembers = m;
    todos = t;
    renderNewTodoFormOptions();
    renderSettingsLists();
    renderBoard();
  } catch (err) {
    // eslint-disable-next-line no-alert
    alert(err.message || String(err));
  }
}

todoForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = todoTitleInput.value.trim();
  const description = todoDescriptionInput.value.trim();
  const memberValue = todoTeamMemberSelect.value;
  const teamMemberId = memberValue ? Number(memberValue) : null;
  const statusName = todoStatusSelect.value;
  const dueDateInputValue = todoDueDateInput.value;

  if (!title || !statusName || !dueDateInputValue) {
    alert("Please fill in all required fields.");
    return;
  }

  // Convert from local time to ISO string
  const dueDate = new Date(dueDateInputValue);

  try {
    const todo = await apiPost("/api/todos", {
      title,
      description,
      teamMemberId,
      statusName,
      dueDate: dueDate.toISOString(),
    });
    todos.push(todo);
    renderBoard();
    todoForm.reset();
    closeDialog(todoDialogBackdrop);
  } catch (err) {
    alert(err.message || String(err));
  }
});

window.addEventListener("DOMContentLoaded", () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  todoDueDateInput.value = now.toISOString().slice(0, 16);
  loadInitialData();

  // Main menu
  mainMenuButton.addEventListener("click", () => {
    mainMenu.classList.toggle("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!mainMenu.contains(e.target) && e.target !== mainMenuButton) {
      mainMenu.classList.add("hidden");
    }
  });

  // New todo dialog
  newTodoButton.addEventListener("click", () => {
    openDialog(todoDialogBackdrop);
  });
  closeTodoDialogButton.addEventListener("click", () => {
    closeDialog(todoDialogBackdrop);
  });
  todoDialogBackdrop.addEventListener("click", (e) => {
    if (e.target === todoDialogBackdrop) {
      closeDialog(todoDialogBackdrop);
    }
  });

  // Settings dialog
  openSettingsButton.addEventListener("click", () => {
    mainMenu.classList.add("hidden");
    openDialog(settingsDialogBackdrop);
  });
  closeSettingsDialogButton.addEventListener("click", () => {
    closeDialog(settingsDialogBackdrop);
  });
  settingsDialogBackdrop.addEventListener("click", (e) => {
    if (e.target === settingsDialogBackdrop) {
      closeDialog(settingsDialogBackdrop);
    }
  });

  // Settings add forms
  settingsTeamMemberAddForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = settingsTeamMemberNameInput.value.trim();
    if (!name) return;
    try {
      const member = await apiPost("/api/team-members", { name });
      teamMembers.push(member);
      settingsTeamMemberNameInput.value = "";
      renderSettingsLists();
      renderBoard();
      renderNewTodoFormOptions();
    } catch (err) {
      alert(err.message || String(err));
    }
  });

  settingsStatusAddForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = settingsStatusNameInput.value.trim();
    if (!name) return;
    try {
      const status = await apiPost("/api/statuses", { name });
      statuses.push(status);
      settingsStatusNameInput.value = "";
      renderSettingsLists();
      renderBoard();
      renderNewTodoFormOptions();
    } catch (err) {
      alert(err.message || String(err));
    }
  });
});

