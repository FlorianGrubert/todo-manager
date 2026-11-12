import { randomUUID } from 'node:crypto';
import type { Locale } from '@fg/shared';
import { now } from '../../db/knex.js';
import { t } from '../../i18n/index.js';
import type { AppDeps, TenantContext } from '../../types.js';

/** Formats a `YYYY-MM-DD` due date for mails. */
export function formatDueDate(locale: Locale, date: string): string {
  const [y, m, d] = date.split('-');
  return locale === 'de' ? `${d}.${m}.${y}` : date;
}

/** Today's date (`YYYY-MM-DD`) in the configured time zone. */
export function todayIn(timeZone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const footer = (deps: AppDeps, locale: Locale) =>
  `\n\n${t(locale, 'mail.settingsHint', { link: `${deps.config.BASE_URL}/settings` })}`;

/**
 * Sends the "To-Do assigned to you" mail (§9) when the assignee wants it.
 * Runs in the background queue; nothing is sent for self-assignments.
 */
export function queueAssignmentMail(deps: AppDeps, ctx: TenantContext, todoId: string, assigneeId: string): void {
  if (assigneeId === ctx.membershipId) return;
  deps.queue.push('assignment mail', async () => {
    const { db } = deps;
    const row = (await db('todos as t')
      .join('memberships as m', 'm.id', 't.assignee_id')
      .join('users as u', 'u.id', 'm.user_id')
      .join('tenants as tn', 'tn.id', 't.tenant_id')
      .leftJoin('projects as p', 'p.id', 't.project_id')
      .where({ 't.id': todoId, 't.tenant_id': ctx.tenantId, 'm.id': assigneeId, 'm.is_active': 1, 'u.is_active': 1, 'u.notify_assign': 1 })
      .whereNotNull('m.accepted_at')
      .first('t.title', 't.due_date', 'p.name as project', 'tn.name as tenant', 'u.email', 'u.locale', 'm.display_name')) as
      | { title: string; due_date: string | null; project: string | null; tenant: string; email: string; locale: Locale; display_name: string }
      | undefined;
    if (!row) return;
    const locale = row.locale;
    const details = [
      row.project ? `${t(locale, 'mail.labels.project')}: ${row.project}` : null,
      row.due_date ? `${t(locale, 'mail.labels.due')}: ${formatDueDate(locale, row.due_date)}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    const greeting = t(locale, 'mail.greeting', { name: row.display_name });
    const body = t(locale, 'mail.assigned.body', {
      by: ctx.displayName,
      tenant: row.tenant,
      title: row.title,
      details: details ? `${details}\n` : '',
      link: `${deps.config.BASE_URL}/todos/${todoId}`,
    });
    await deps.mailer.send({
      to: row.email,
      subject: t(locale, 'mail.assigned.subject', { title: row.title }),
      text: `${greeting}\n\n${body}${footer(deps, locale)}\n\n${t(locale, 'mail.signature')}\n`,
    });
  });
}

interface ReminderCandidate {
  todo_id: string;
  tenant_id: string;
  title: string;
  due_date: string;
  tenant: string;
  user_id: string;
  email: string;
  name: string;
  locale: Locale;
  remind_days_before: number | null;
  notify_overdue: number;
}

/**
 * Due-date reminders and overdue notices (§9). Each notice is sent at most once
 * per To-Do, user and due date (notification log), so the job can run as often
 * as needed. All due items of a user are combined into one mail.
 */
export async function runReminderJob(deps: AppDeps, at: Date = new Date()): Promise<{ mails: number; items: number }> {
  const { db, config } = deps;
  const today = todayIn(config.APP_TIMEZONE, at);
  const latest = new Date(Date.parse(`${today}T00:00:00Z`) + 366 * 86_400_000).toISOString().slice(0, 10);

  const rows = (await db('todos as t')
    .join('statuses as s', 's.id', 't.status_id')
    .join('memberships as m', 'm.id', 't.assignee_id')
    .join('users as u', 'u.id', 'm.user_id')
    .join('tenants as tn', 'tn.id', 't.tenant_id')
    .leftJoin('projects as p', 'p.id', 't.project_id')
    .where({ 's.category': 'open', 'm.is_active': 1, 'u.is_active': 1, 'tn.is_active': 1 })
    .whereNotNull('m.accepted_at')
    .whereNull('p.archived_at')
    .whereNotNull('t.due_date')
    .where('t.due_date', '<=', latest)
    .where((q) => q.whereNotNull('u.remind_days_before').orWhere('u.notify_overdue', 1))
    .orderBy('t.due_date')
    .select(
      't.id as todo_id',
      't.tenant_id',
      't.title',
      't.due_date',
      'tn.name as tenant',
      'u.id as user_id',
      'u.email',
      'u.name',
      'u.locale',
      'u.remind_days_before',
      'u.notify_overdue',
    )) as ReminderCandidate[];

  const perUser = new Map<string, { user: ReminderCandidate; soon: ReminderCandidate[]; overdue: ReminderCandidate[] }>();
  for (const row of rows) {
    const diff = daysBetween(today, row.due_date);
    let kind: 'reminder' | 'overdue' | null = null;
    if (diff < 0 && Number(row.notify_overdue) === 1) kind = 'overdue';
    else if (diff >= 0 && row.remind_days_before !== null && diff <= Number(row.remind_days_before)) kind = 'reminder';
    if (!kind) continue;

    const key = { tenant_id: row.tenant_id, todo_id: row.todo_id, user_id: row.user_id, kind, ref: row.due_date };
    if (await db('notification_log').where(key).first('id')) continue;
    await db('notification_log').insert({ id: randomUUID(), ...key, created_at: now() });

    const entry = perUser.get(row.user_id) ?? { user: row, soon: [], overdue: [] };
    (kind === 'overdue' ? entry.overdue : entry.soon).push(row);
    perUser.set(row.user_id, entry);
  }

  let items = 0;
  for (const { user, soon, overdue } of perUser.values()) {
    const locale = user.locale;
    const line = (r: ReminderCandidate) =>
      `- ${r.title} (${t(locale, 'mail.labels.due')}: ${formatDueDate(locale, r.due_date)}, ${t(locale, 'mail.labels.tenant')}: ${r.tenant})\n  ${config.BASE_URL}/todos/${r.todo_id}`;
    const sections = [
      overdue.length ? `${t(locale, 'mail.digest.overdue')}:\n${overdue.map(line).join('\n')}` : null,
      soon.length ? `${t(locale, 'mail.digest.dueSoon')}:\n${soon.map(line).join('\n')}` : null,
    ].filter(Boolean);
    items += soon.length + overdue.length;
    deps.queue.push('reminder mail', () =>
      deps.mailer.send({
        to: user.email,
        subject: t(locale, 'mail.digest.subject'),
        text: `${t(locale, 'mail.greeting', { name: user.name })} ${t(locale, 'mail.digest.intro')}\n\n${sections.join('\n\n')}${footer(deps, locale)}\n\n${t(locale, 'mail.signature')}\n`,
      }),
    );
  }
  return { mails: perUser.size, items };
}

/** Starts the periodic reminder check (first run shortly after start). */
export function startReminderScheduler(deps: AppDeps, log: { error: (obj: unknown, msg: string) => void }): () => void {
  const minutes = deps.config.REMINDER_INTERVAL_MINUTES;
  if (minutes === 0) return () => undefined;
  const run = () => void runReminderJob(deps).catch((err: unknown) => log.error({ err }, 'reminder job failed'));
  const first = setTimeout(run, 30_000);
  const interval = setInterval(run, minutes * 60_000);
  return () => {
    clearTimeout(first);
    clearInterval(interval);
  };
}
