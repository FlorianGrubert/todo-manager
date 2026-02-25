import { INITIAL_STATUSES, type Status } from "../models/Status";
import type { TeamMember } from "../models/TeamMember";
import type { ToDo } from "../models/ToDo";

let nextTeamMemberId = 1;
let nextToDoId = 1;

const teamMembers: TeamMember[] = [];
const todos: ToDo[] = [];
const statuses: Status[] = INITIAL_STATUSES.map((s) => ({ ...s }));

export function getStatuses(): Status[] {
  return statuses;
}

export function getTeamMembers(): TeamMember[] {
  return teamMembers;
}

export function addTeamMember(name: string): TeamMember {
  const member: TeamMember = { id: nextTeamMemberId++, name };
  teamMembers.push(member);
  return member;
}

export function renameTeamMember(id: number, name: string): TeamMember {
  const member = teamMembers.find((m) => m.id === id);
  if (!member) {
    throw new Error("Team member not found");
  }
  member.name = name;
  return member;
}

export function deleteTeamMember(id: number): void {
  const hasTodos = todos.some((t) => t.teamMember && t.teamMember.id === id);
  if (hasTodos) {
    throw new Error("Cannot delete team member with assigned todos");
  }

  const index = teamMembers.findIndex((m) => m.id === id);
  if (index !== -1) {
    teamMembers.splice(index, 1);
  }
}

export function addStatus(name: string): Status {
  if (statuses.some((s) => s.name === name)) {
    throw new Error("Status with this name already exists");
  }
  const rank = statuses.length ? Math.max(...statuses.map((s) => s.rank)) + 1 : 1;
  const status: Status = {
    name,
    rank,
    color: "blue",
    isActive: true
  };
  statuses.push(status);
  return status;
}

export function renameStatus(oldName: string, newName: string): Status {
  const status = statuses.find((s) => s.name === oldName);
  if (!status) {
    throw new Error("Status not found");
  }
  if (statuses.some((s) => s.name === newName && s !== status)) {
    throw new Error("Status with this name already exists");
  }

  todos.forEach((t) => {
    if (t.status.name === oldName) {
      t.status = status;
    }
  });

  status.name = newName;

  return status;
}

export function deleteStatus(name: string): void {
  const hasTodos = todos.some((t) => t.status.name === name);
  if (hasTodos) {
    throw new Error("Cannot delete status with assigned todos");
  }

  const index = statuses.findIndex((s) => s.name === name);
  if (index !== -1) {
    statuses.splice(index, 1);
  }
}

export function getToDos(): ToDo[] {
  return todos;
}

export function addToDo(input: {
  title: string;
  description: string;
  teamMemberId?: number | null;
  statusName: string;
  dueDate: string;
}): ToDo {
  let teamMember: TeamMember | null = null;
  if (input.teamMemberId != null) {
    teamMember = teamMembers.find((m) => m.id === input.teamMemberId) ?? null;
    if (!teamMember) {
      throw new Error("Team member not found");
    }
  }

  const status = statuses.find((s) => s.name === input.statusName);
  if (!status) {
    throw new Error("Status not found");
  }

  const todo: ToDo = {
    id: nextToDoId++,
    title: input.title,
    description: input.description,
    teamMember,
    status,
    dueDate: input.dueDate
  };

  todos.push(todo);
  return todo;
}

export function updateToDo(
  id: number,
  updates: Partial<{
    title: string;
    description: string;
    teamMemberId: number | null;
    statusName: string;
    dueDate: string;
  }>
): ToDo {
  const todo = todos.find((t) => t.id === id);
  if (!todo) {
    throw new Error("ToDo not found");
  }

  if (updates.title !== undefined) {
    todo.title = updates.title;
  }
  if (updates.description !== undefined) {
    todo.description = updates.description;
  }
  if (updates.teamMemberId !== undefined) {
    if (updates.teamMemberId === null) {
      todo.teamMember = null;
    } else {
      const tm = teamMembers.find((m) => m.id === updates.teamMemberId);
      if (!tm) {
        throw new Error("Team member not found");
      }
      todo.teamMember = tm;
    }
  }
  if (updates.statusName !== undefined) {
    const status = statuses.find((s) => s.name === updates.statusName);
    if (!status) {
      throw new Error("Status not found");
    }
    todo.status = status;
  }
  if (updates.dueDate !== undefined) {
    todo.dueDate = updates.dueDate;
  }

  return todo;
}

export function deleteToDo(id: number): void {
  const index = todos.findIndex((t) => t.id === id);
  if (index !== -1) {
    todos.splice(index, 1);
  }
}

