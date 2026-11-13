import type { FastifyBaseLogger } from 'fastify';

/**
 * Sequential background task queue (e.g. sending e-mails) so that requests do
 * not wait for slow SMTP servers. Errors are logged and never reach the client.
 */
export class TaskQueue {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly logger: FastifyBaseLogger) {}

  push(name: string, task: () => Promise<void>): void {
    this.tail = this.tail.then(task).catch((err: unknown) => {
      this.logger.error({ err }, `background task "${name}" failed`);
    });
  }

  /** Resolves when all queued tasks are done (used by tests and on shutdown). */
  idle(): Promise<void> {
    return this.tail;
  }
}
