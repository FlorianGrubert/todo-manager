/**
 * In-process event bus for live updates (§9). Events only carry IDs – clients
 * reload the data through the permission-checked API. The application runs as a
 * single process, so no external broker is needed.
 */
export type BoardEvent =
  /** A To-Do changed (created, edited, commented). */
  | { type: 'todos'; todoId?: string }
  /** Statuses, priorities, tags, projects or members changed. */
  | { type: 'reference' };

type Listener = (event: BoardEvent) => void | Promise<void>;

export class EventBus {
  private readonly listeners = new Map<string, Set<Listener>>();

  subscribe(tenantId: string, listener: Listener): () => void {
    let set = this.listeners.get(tenantId);
    if (!set) {
      set = new Set();
      this.listeners.set(tenantId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(tenantId);
    };
  }

  publish(tenantId: string, event: BoardEvent): void {
    for (const listener of this.listeners.get(tenantId) ?? []) {
      void Promise.resolve(listener(event)).catch(() => undefined);
    }
  }

  subscriberCount(tenantId: string): number {
    return this.listeners.get(tenantId)?.size ?? 0;
  }
}
