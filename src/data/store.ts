import { AVAILABLE_STATUSES, type Status } from "../models/Status";
import type { TeamMember } from "../models/TeamMember";
import type { ToDo } from "../models/ToDo";

let nextTeamMemberId = 1;
let nextToDoId = 1;

const teamMembers: TeamMember[] = [];
const todos: ToDo[] = [];

export function getStatuses(): Status[] {
  return AVAILABLE_STATUSES;
}

export function getTeamMembers(): TeamMember[] {
  return teamMembers;
}

export function addTeamMember(name: string): TeamMember {
  const member: TeamMember = { id: nextTeamMemberId++, name };
  teamMembers.push(member);
  return member;
}

export function getToDos(): ToDo[] {
  return todos;
}

export function addToDo(input: {
  title: string;
  description: string;
  teamMemberId: number;
  statusName: string;
  dueDate: string;
}): ToDo {
  const teamMember = teamMembers.find((m) => m.id === input.teamMemberId);
  if (!teamMember) {
    throw new Error("Team member not found");
  }

  const status = AVAILABLE_STATUSES.find((s) => s.name === input.statusName);
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
    teamMemberId: number;
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
    const tm = teamMembers.find((m) => m.id === updates.teamMemberId);
    if (!tm) {
      throw new Error("Team member not found");
    }
    todo.teamMember = tm;
  }
  if (updates.statusName !== undefined) {
    const status = AVAILABLE_STATUSES.find((s) => s.name === updates.statusName);
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

