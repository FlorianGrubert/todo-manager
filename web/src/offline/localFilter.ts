import { NONE, type StatusCategory, type TodoDto, type TodoQuery } from '@fg/shared';

/**
 * Applies the board filters to cached To-Dos on the device. Used offline when
 * the exact view was never loaded online and only an older (wider) list exists.
 * Mirrors the server rules: OR within a criterion, AND between criteria.
 */
export function filterLocally(
  todos: TodoDto[],
  query: TodoQuery,
  me: string | null,
  categoryOf: (statusId: string) => StatusCategory | undefined,
): TodoDto[] {
  const matches = (values: string[], value: string | null) =>
    values.length === 0 || (value === null ? values.includes(NONE) : values.includes(value));
  const term = query.q.trim().toLowerCase();
  return todos.filter(
    (todo) =>
      (query.scope === 'all' || todo.assigneeId === me) &&
      (query.includeClosed || categoryOf(todo.statusId) === 'open') &&
      matches(query.assigneeIds, todo.assigneeId) &&
      matches(query.priorityIds, todo.priorityId) &&
      matches(query.projectIds, todo.projectId) &&
      (query.tagIds.length === 0 ||
        (todo.tags.length === 0 ? query.tagIds.includes(NONE) : todo.tags.some((tag) => query.tagIds.includes(tag.id)))) &&
      (!term || todo.title.toLowerCase().includes(term) || (todo.description ?? '').toLowerCase().includes(term)),
  );
}
