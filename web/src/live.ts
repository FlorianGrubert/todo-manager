import { onBeforeUnmount } from 'vue';

/** Live updates via Server-Sent Events (§9). Events only carry IDs; views reload their data. */
export type LiveEvent = { type: 'todos'; todoId?: string } | { type: 'reference' };

const target = new EventTarget();
let source: EventSource | null = null;

/** Opens (or closes) the event stream for the active tenant. */
export function connectLive(enabled: boolean): void {
  source?.close();
  source = null;
  if (!enabled || typeof EventSource === 'undefined') return;
  source = new EventSource('/api/events');
  source.onmessage = (message: MessageEvent<string>) => {
    try {
      const event = JSON.parse(message.data) as LiveEvent;
      target.dispatchEvent(new CustomEvent<LiveEvent>(event.type, { detail: event }));
    } catch {
      // ignore malformed events
    }
  };
}

/** Subscribes a component to live events; unsubscribes automatically on unmount. */
export function onLive<T extends LiveEvent['type']>(type: T, handler: (event: Extract<LiveEvent, { type: T }>) => void): void {
  const listener = (e: Event) => handler((e as CustomEvent<Extract<LiveEvent, { type: T }>>).detail);
  target.addEventListener(type, listener);
  onBeforeUnmount(() => target.removeEventListener(type, listener));
}

/** Calls `fn` at most once per `ms` burst (several changes → one reload). */
export function debounce(fn: () => void, ms = 300): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}
