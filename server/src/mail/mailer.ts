import nodemailer from 'nodemailer';
import type { FastifyBaseLogger } from 'fastify';
import type { Locale } from '@fg/shared';
import type { Config } from '../config.js';
import { t } from '../i18n/index.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
  /** Messages sent with the `log` transport (used in development and tests). */
  readonly sent: MailMessage[];
}

export function createMailer(config: Config, logger: FastifyBaseLogger): Mailer {
  const sent: MailMessage[] = [];
  if (config.MAIL_TRANSPORT === 'log') {
    return {
      sent,
      send(message) {
        sent.push(message);
        if (sent.length > 200) sent.shift();
        logger.info({ mail: message }, `mail (log transport) to ${message.to}: ${message.subject}`);
        return Promise.resolve();
      },
    };
  }
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
  });
  return {
    sent,
    async send(message) {
      try {
        await transport.sendMail({ from: config.MAIL_FROM, ...message });
      } catch (err) {
        // Mail failures must not break the request; they are logged for the operator.
        logger.error({ err, to: message.to }, 'sending mail failed');
      }
    },
  };
}

/** Builds a localized mail from `mail.<template>.subject/body`. */
export function composeMail(
  locale: Locale,
  template: string,
  to: string,
  name: string,
  params: Record<string, string | number>,
): MailMessage {
  const greeting = t(locale, 'mail.greeting', { name: name || to });
  const body = t(locale, `mail.${template}.body`, params);
  const signature = t(locale, 'mail.signature');
  return {
    to,
    subject: t(locale, `mail.${template}.subject`, params),
    text: `${greeting}\n\n${body}\n\n${signature}\n`,
  };
}
