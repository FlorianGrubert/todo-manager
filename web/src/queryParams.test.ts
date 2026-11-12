import { describe, expect, it } from 'vitest';
import { DEFAULT_QUERY, paramsToTodoQuery, todoQueryToParams } from '@fg/shared';

describe('board URL parameters', () => {
  it('round-trips a full query', () => {
    const query = {
      ...DEFAULT_QUERY,
      scope: 'all' as const,
      q: 'logo',
      includeClosed: true,
      sort: 'dueDate' as const,
      dir: 'desc' as const,
      tagIds: ['a', 'none'],
      assigneeIds: ['m1'],
      priorityIds: [],
      projectIds: ['none'],
    };
    const params = Object.fromEntries(todoQueryToParams(query));
    expect(paramsToTodoQuery(params)).toEqual(query);
  });

  it('keeps defaults out of the URL and ignores invalid values', () => {
    expect(todoQueryToParams(DEFAULT_QUERY).toString()).toBe('');
    expect(paramsToTodoQuery({ sort: 'evil', dir: 'sideways', scope: 'x', tags: ',,a,' })).toMatchObject({
      sort: 'priority',
      dir: 'asc',
      scope: 'mine',
      tagIds: ['a'],
    });
  });
});
