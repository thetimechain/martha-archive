// Loader for data/places-geo.json — hand-curated lat/lng for the most
// well-documented Martha-orbit places. Used by /places/map.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

type GeoJson = Record<string, [number, number]>;

let cached: GeoJson | null = null;

function load(): GeoJson {
  if (cached) return cached;
  const __dirname = typeof import.meta.url === "string"
    ? fileURLToPath(new URL(".", import.meta.url))
    : process.cwd();
  const candidates = [
    join(__dirname, "..", "..", "data", "places-geo.json"),
    join(process.cwd(), "data", "places-geo.json"),
  ];
  for (const c of candidates) {
    try {
      const raw = readFileSync(c, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const out: GeoJson = {};
      for (const [slug, val] of Object.entries(parsed)) {
        if (slug.startsWith("_")) continue;
        if (Array.isArray(val) && val.length === 2 && typeof val[0] === "number" && typeof val[1] === "number") {
          out[slug] = [val[0], val[1]];
        }
      }
      cached = out;
      return cached;
    } catch {}
  }
  cached = {};
  return cached;
}

export function placeCoord(slug: string): [number, number] | null {
  return load()[slug] ?? null;
}

export function allCoords(): GeoJson {
  return load();
}
