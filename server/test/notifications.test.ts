import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MeResponse, StatusDto } from '@fg/shared';
import { runReminderJob } from '../src/modules/notifications/service.js';
import { createTestEnv, type TestEnv } from './helpers.js';
import { buildScenario, type Scenario } from './scenario.js';

describe('notifications', () => {
  let env: TestEnv;
  let s: Scenario;

  const idle = () => env.app.deps.queue.idle();
  const mailsTo = (email: string) => env.mails.filter((m) => m.to === email);
  // 2026-12-10 12:00 in Berlin
  const NOW = new Date('2026-12-10T11:00:00Z');

  beforeEach(async () => {
    env = await createTestEnv();
    s = await buildScenario(env);
    await idle();
    env.mails.length = 0;
  });
  afterEach(async () => env.close());

  describe('assignment e-mails', () => {
    it('notifies the new assignee in their language, but not on self-assignment', async () => {
      await s.clients.restricted.patch('/api/auth/me', { locale: 'en' });
      await s.clients.editor.patch(`/api/todos/${s.todos.t2}`, { assigneeId: s.members.restricted });
      await s.clients.editor.patch(`/api/todos/${s.todos.t5}`, { assigneeId: s.members.editor });
      await idle();
      expect(env.mails).toHaveLength(1);
      const mail = env.mails[0]!;
      expect(mail.to).toBe('restricted@acme.test');
      expect(mail.subject).toBe('New to-do for you: t2');
      expect(mail.text).toContain('editor (Acme) assigned a to-do to you');
      expect(mail.text).toContain(`http://localhost:3000/todos/${s.todos.t2}`);
    });

    it('notifies on creation and respects the user setting', async () => {
      await s.clients.admin.post('/api/todos', { title: 'for editor', projectId: s.projectP, assigneeId: s.members.editor });
      await idle();
      expect(mailsTo('editor@acme.test').map((m) => m.subject)).toEqual(['Neues To-Do für Sie: for editor']);

      await s.clients.editor.patch('/api/auth/me', { notifyAssign: false });
      await s.clients.admin.post('/api/todos', { title: 'silent', projectId: s.projectP, assigneeId: s.members.editor });
      await idle();
      expect(mailsTo('editor@acme.test')).toHaveLength(1);
    });
  });

  describe('settings', () => {
    it('stores notification settings per user', async () => {
      const res = await s.clients.reader.patch('/api/auth/me', { remindDaysBefore: 3, notifyOverdue: false, notifyAssign: false });
      expect(res.statusCode).toBe(200);
      expect((res.json() as MeResponse).user).toMatchObject({ remindDaysBefore: 3, notifyOverdue: false, notifyAssign: false });
      expect((await s.clients.reader.patch('/api/auth/me', { remindDaysBefore: 99 })).statusCode).toBe(400);
      const off = await s.clients.reader.patch('/api/auth/me', { remindDaysBefore: null });
      expect((off.json() as MeResponse).user.remindDaysBefore).toBeNull();
    });
  });

  describe('reminder job', () => {
    beforeEach(async () => {
      // editor wants reminders 2 days ahead and overdue notices (default on)
      await s.clients.editor.patch('/api/auth/me', { remindDaysBefore: 2 });
      await s.clients.editor.patch(`/api/todos/${s.todos.t1}`, { dueDate: '2026-12-12' }); // in 2 days → reminder
      await s.clients.editor.patch(`/api/todos/${s.todos.t3}`, { assigneeId: s.members.editor, dueDate: '2026-12-09' }); // overdue
      await s.clients.editor.patch(`/api/todos/${s.todos.t5}`, { assigneeId: s.members.editor, dueDate: '2026-12-20' }); // too early
      await idle();
      env.mails.length = 0;
    });

    it('sends one combined mail with due-soon and overdue To-Dos, only once', async () => {
      const result = await runReminderJob(env.app.deps, NOW);
      await idle();
      expect(result).toEqual({ mails: 1, items: 2 });
      const mail = mailsTo('editor@acme.test')[0]!;
      expect(mail.subject).toBe('Erinnerung an Ihre To-Dos');
      expect(mail.text).toMatch(/Überfällig:\n- t3 \(Fällig am: 09\.12\.2026/);
      expect(mail.text).toMatch(/Bald fällig:\n- t1 \(Fällig am: 12\.12\.2026/);
      expect(mail.text).not.toContain('t5');

      expect(await runReminderJob(env.app.deps, NOW)).toEqual({ mails: 0, items: 0 });
    });

    it('reminds again when the due date changes', async () => {
      await runReminderJob(env.app.deps, NOW);
      await s.clients.editor.patch(`/api/todos/${s.todos.t1}`, { dueDate: '2026-12-11' });
      expect(await runReminderJob(env.app.deps, NOW)).toEqual({ mails: 1, items: 1 });
    });

    it('ignores closed To-Dos, archived projects, inactive members and disabled settings', async () => {
      const done = (await s.clients.admin.get('/api/statuses')).json() as StatusDto[];
      await s.clients.editor.patch(`/api/todos/${s.todos.t1}`, { statusId: done.find((st) => st.key === 'done')!.id });
      await s.clients.editor.patch('/api/auth/me', { notifyOverdue: false });
      expect(await runReminderJob(env.app.deps, NOW)).toEqual({ mails: 0, items: 0 });

      await s.clients.editor.patch('/api/auth/me', { notifyOverdue: true });
      await s.clients.admin.post(`/api/projects/${s.projectP}/archive`);
      expect(await runReminderJob(env.app.deps, NOW)).toEqual({ mails: 0, items: 0 });

      await s.clients.admin.post(`/api/projects/${s.projectP}/restore`);
      await s.clients.admin.patch(`/api/admin/members/${s.members.editor}`, { isActive: false });
      expect(await runReminderJob(env.app.deps, NOW)).toEqual({ mails: 0, items: 0 });
    });
  });
});
