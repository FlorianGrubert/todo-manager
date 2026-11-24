/**
 * Fixed one-minute windows per key, kept in memory. Sufficient because the
 * application runs as a single process (§10). Expired windows are dropped on
 * access, so the map only holds keys used within the last minute.
 */
export class RateWindow {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
  ) {}

  /** Counts one hit for the key; returns false when the limit is exceeded. */
  hit(key: string, at = Date.now()): boolean {
    this.prune(at);
    const w = this.windows.get(key);
    if (!w) {
      this.windows.set(key, { start: at, count: 1 });
      return this.limit >= 1;
    }
    w.count += 1;
    return w.count <= this.limit;
  }

  /** True when the key has already reached the limit (without counting a hit). */
  exhausted(key: string, at = Date.now()): boolean {
    this.prune(at);
    return (this.windows.get(key)?.count ?? 0) >= this.limit;
  }

  private prune(at: number): void {
    for (const [key, w] of this.windows) {
      if (at - w.start >= this.windowMs) this.windows.delete(key);
    }
  }
}
