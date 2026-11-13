import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { LOCALES } from '@fg/shared';

const bool = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().positive().default(3000),
    BASE_URL: z.string().url().default('http://localhost:3000'),
    TRUST_PROXY: bool.default(false),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    DB_CLIENT: z.enum(['sqlite', 'pg']).default('sqlite'),
    SQLITE_FILE: z.string().default('./data/todo-manager.db'),
    DATABASE_URL: z.string().optional(),

    SESSION_TTL_HOURS: z.coerce.number().int().positive().default(24 * 14),
    /** Max. login / password reset / invitation requests per minute and client IP. */
    AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(10),

    MAIL_TRANSPORT: z.enum(['smtp', 'log']).default('log'),
    MAIL_FROM: z.string().default('FG To-Do-Manager <no-reply@localhost>'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: bool.default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),

    DEFAULT_LOCALE: z.enum(LOCALES).default('de'),
    /** Time zone for due dates and reminders. */
    APP_TIMEZONE: z.string().default('Europe/Berlin'),
    /** Interval of the reminder check in minutes; 0 disables it. */
    REMINDER_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(60),
    WEB_DIST: z.string().optional(),
    /** Maximum size of a tenant import file in MB. */
    IMPORT_MAX_MB: z.coerce.number().int().positive().default(50),
  })
  .superRefine((v, ctx) => {
    if (v.DB_CLIENT === 'pg' && !v.DATABASE_URL) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'required when DB_CLIENT=pg' });
    }
    try {
      new Intl.DateTimeFormat('en', { timeZone: v.APP_TIMEZONE });
    } catch {
      ctx.addIssue({ code: 'custom', path: ['APP_TIMEZONE'], message: 'unknown time zone' });
    }
    if (v.MAIL_TRANSPORT === 'smtp' && !v.SMTP_HOST) {
      ctx.addIssue({ code: 'custom', path: ['SMTP_HOST'], message: 'required when MAIL_TRANSPORT=smtp' });
    }
  });

export type Config = z.infer<typeof schema> & {
  cookieSecure: boolean;
  version: string;
};

let envLoaded = false;

/** Loads `.env` from the current working directory once (if present). */
export function loadEnvFile(): void {
  if (envLoaded) return;
  envLoaded = true;
  const file = resolve(process.cwd(), '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

export function readVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, overrides: Record<string, string> = {}): Config {
  const parsed = schema.safeParse({ ...env, ...overrides });
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${details}`);
  }
  return {
    ...parsed.data,
    cookieSecure: parsed.data.BASE_URL.startsWith('https://'),
    version: readVersion(),
  };
}
