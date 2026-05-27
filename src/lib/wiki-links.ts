// Maps entity slugs to "Main article" links in the research wiki at
// github.com/thetimechain/random/blob/main/wiki/topics/martha-stewart-living-tv/.
//
// Source data: data/entity-wiki-links.json (editorial map).
// GitHub URLs are used so the wiki stays password-protected at random-wiki.fly.dev
// while the underlying source remains publicly reachable for visitors.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

type LinkRef = { article: string; anchor: string; label: string };

type WikiLinksJson = {
  _articleMap: Record<string, string>;
  people: Record<string, LinkRef[]>;
  places: Record<string, LinkRef[]>;
};

let cached: WikiLinksJson | null = null;

function load(): WikiLinksJson {
  if (cached) return cached;
  // Path is relative to repo root; works in both dev (tsx) and built (node dist) modes
  // because the JSON is shipped with the source data, not transpiled output.
  const __dirname = typeof import.meta.url === "string"
    ? fileURLToPath(new URL(".", import.meta.url))
    : process.cwd();
  // Walk up from src/lib/ → src/ → repo root → data/entity-wiki-links.json
  const candidates = [
    join(__dirname, "..", "..", "data", "entity-wiki-links.json"),
    join(process.cwd(), "data", "entity-wiki-links.json"),
  ];
  for (const c of candidates) {
    try {
      const raw = readFileSync(c, "utf8");
      cached = JSON.parse(raw) as WikiLinksJson;
      return cached;
    } catch {}
  }
  // Fail silent in production — hatnotes simply don't render.
  cached = { _articleMap: {}, people: {}, places: {} };
  return cached;
}

export type WikiLink = { href: string; label: string };

/**
 * Returns "Main article" links for the given entity slug, or [] if none.
 * `entityType` is 'person' | 'place'.
 */
export function wikiLinksFor(slug: string, entityType: "person" | "place"): WikiLink[] {
  const data = load();
  const bucket = entityType === "person" ? data.people : data.places;
  const refs = bucket[slug];
  if (!refs || refs.length === 0) return [];
  const out: WikiLink[] = [];
  for (const r of refs) {
    const base = data._articleMap[r.article];
    if (!base) continue;
    const href = r.anchor ? `${base}#${r.anchor}` : base;
    out.push({ href, label: r.label });
  }
  return out;
}
