import type {
  Status,
  TeamMember,
  ToDo,
  NewToDoInput,
  UpdateToDoInput
} from "./types";

const API_BASE = "";

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(API_BASE + path);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `GET ${path} failed`);
  }
  return (await res.json()) as T;
}

async function apiSend<T>(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body?: unknown
): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `${method} ${path} failed`);
  }

  if (res.status === 204) {
    // no content
    return undefined as T;
  }

  return (await res.json()) as T;
}

// Statuses

export function fetchStatuses(): Promise<Status[]> {
  return apiGet<Status[]>("/api/statuses");
}

export function createStatus(name: string): Promise<Status> {
  return apiSend<Status>("/api/statuses", "POST", { name });
}

export function renameStatus(
  currentName: string,
  newName: string
): Promise<Status> {
  const encoded = encodeURIComponent(currentName);
  return apiSend<Status>(`/api/statuses/${encoded}`, "PUT", { name: newName });
}

export function deleteStatus(name: string): Promise<void> {
  const encoded = encodeURIComponent(name);
  return apiSend<void>(`/api/statuses/${encoded}`, "DELETE");
}

// Team members

export function fetchTeamMembers(): Promise<TeamMember[]> {
  return apiGet<TeamMember[]>("/api/team-members");
}

export function createTeamMember(name: string): Promise<TeamMember> {
  return apiSend<TeamMember>("/api/team-members", "POST", { name });
}

export function renameTeamMember(
  id: number,
  name: string
): Promise<TeamMember> {
  return apiSend<TeamMember>(`/api/team-members/${id}`, "PUT", { name });
}

export function deleteTeamMember(id: number): Promise<void> {
  return apiSend<void>(`/api/team-members/${id}`, "DELETE");
}

// ToDos

export function fetchToDos(): Promise<ToDo[]> {
  return apiGet<ToDo[]>("/api/todos");
}

export function createToDo(input: NewToDoInput): Promise<ToDo> {
  return apiSend<ToDo>("/api/todos", "POST", input);
}

export function updateToDo(
  id: number,
  updates: UpdateToDoInput
): Promise<ToDo> {
  return apiSend<ToDo>(`/api/todos/${id}`, "PUT", updates);
}

export function deleteToDo(id: number): Promise<void> {
  return apiSend<void>(`/api/todos/${id}`, "DELETE");
}

