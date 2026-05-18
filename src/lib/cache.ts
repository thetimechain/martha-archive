import { LRUCache } from "lru-cache";

export const apiCache = new LRUCache<string, object>({
  max: 500,
  ttl: 1000 * 60 * 5,
});

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
