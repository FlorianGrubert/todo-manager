import { describe, expect, it } from 'vitest';
import { DEFAULT_QUERY, type StatusCategory, type TodoDto } from '@fg/shared';
import { filterLocally } from './localFilter';

const todo = (id: string, extra: Partial<TodoDto> = {}): TodoDto => ({
  id,
  projectId: null,
  title: id,
  description: null,
  dueDate: null,
  priorityId: null,
  assigneeId: null,
  statusId: 'open',
  tags: [],
  links: [],
  createdAt: '',
  updatedAt: '',
  createdBy: { id: 'm', displayName: 'M' },
  updatedBy: { id: 'm', displayName: 'M' },
  commentCount: 0,
  canEdit: false,
  ...extra,
});

const todos = [
  todo('mine', { assigneeId: 'me', tags: [{ id: 'ui', name: 'ui', color: null }] }),
  todo('other', { assigneeId: 'x', priorityId: 'high', projectId: 'p1' }),
  todo('done', { assigneeId: 'me', statusId: 'closed' }),
  todo('free', { description: 'Call the printer' }),
];
const category = (id: string): StatusCategory => (id === 'closed' ? 'done' : 'open');
const ids = (q: Partial<typeof DEFAULT_QUERY>) =>
  filterLocally(todos, { ...DEFAULT_QUERY, ...q }, 'me', category).map((t) => t.id);

describe('offline filtering of cached To-Dos', () => {
  it('applies scope and hides closed To-Dos by default', () => {
    expect(ids({})).toEqual(['mine']);
    expect(ids({ scope: 'all' })).toEqual(['mine', 'other', 'free']);
    expect(ids({ scope: 'all', includeClosed: true })).toHaveLength(4);
  });

  it('combines criteria like the server', () => {
    expect(ids({ scope: 'all', assigneeIds: ['x', 'none'] })).toEqual(['other', 'free']);
    expect(ids({ scope: 'all', tagIds: ['none'] })).toEqual(['other', 'free']);
    expect(ids({ scope: 'all', priorityIds: ['high'], projectIds: ['p1'] })).toEqual(['other']);
    expect(ids({ scope: 'all', projectIds: ['none'] })).toEqual(['mine', 'free']);
    expect(ids({ scope: 'all', q: 'PRINTER' })).toEqual(['free']);
  });
});
