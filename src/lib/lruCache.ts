export interface LruEntry<T> {
  value: T;
  expiresAt: number;
  lastAccess: number;
}

/**
 * Bounded TTL & LRU map for hot paths on a single serverless instance.
 * Not a distributed cache — pair with CDN headers for multi-instance scale.
 */
export class LruTtlCache<T> {
  private readonly store = new Map<string, LruEntry<T>>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
  ) {}

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    entry.lastAccess = Date.now();
    return entry.value;
  }

  set(key: string, value: T): void {
    this.evictExpired();
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
      lastAccess: Date.now(),
    });
    this.evictLruIfNeeded();
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  private evictExpired(now = Date.now()): void {
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }

  private evictLruIfNeeded(): void {
    if (this.store.size <= this.maxEntries) return;

    const entries = [...this.store.entries()].sort(
      (a, b) => a[1].lastAccess - b[1].lastAccess,
    );
    const toRemove = this.store.size - this.maxEntries;
    for (let i = 0; i < toRemove; i += 1) {
      this.store.delete(entries[i][0]);
    }
  }
}
