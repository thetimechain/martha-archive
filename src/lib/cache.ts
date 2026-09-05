import { LRUCache } from "lru-cache";

export const apiCache = new LRUCache<string, object>({
  max: 500,
  ttl: 1000 * 60 * 5,
});

/**
 * Single-value, single-flight TTL memoizer.
 *
 * Unlike `apiCache` (keyed, per-query-string), this is for values with
 * exactly one instance process-wide — e.g. the footer's "last import" /
 * row-count stats, which are identical for every request and only change
 * when an import completes. A plain LRUCache entry would work too, but
 * `lru-cache` rejects `null`/`undefined` values, which `fetchLastImport()`
 * can legitimately return (no import has ever run) — so this hand-rolls the
 * bit of logic LRUCache doesn't cover for that case.
 *
 * Concurrent callers during a cache miss share the same in-flight promise
 * (no thundering herd of duplicate DB round-trips), and a rejected fetch is
 * never cached — `get()` re-runs `fn` on the next call after a failure.
 */
export type Memoized<T> = {
  get(): Promise<T>;
  /** Drop any cached value/in-flight promise so the next get() re-fetches. */
  clear(): void;
};

export function memoizeWithTtl<T>(fn: () => Promise<T>, ttlMs: number): Memoized<T> {
  let entry: { value: T; expiresAt: number } | null = null;
  let inFlight: Promise<T> | null = null;

  return {
    get(): Promise<T> {
      const now = Date.now();
      if (entry && entry.expiresAt > now) return Promise.resolve(entry.value);
      if (inFlight) return inFlight;
      inFlight = fn()
        .then((value) => {
          entry = { value, expiresAt: Date.now() + ttlMs };
          return value;
        })
        .catch((err) => {
          // Never cache a failure — next get() retries against the DB.
          entry = null;
          throw err;
        })
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
    clear(): void {
      entry = null;
      inFlight = null;
    },
  };
}

export function canonicalizeQuery(input: Record<string, string | string[] | undefined>): string {
  const entries: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v.slice().sort()) entries.push([k, item]);
    } else {
      entries.push([k, v]);
    }
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}
