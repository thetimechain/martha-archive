// Insert new `episodes` rows for vhx items that aren't already linked to a DB row.
// Stable id: derived from the canonical_slug (e.g. "msl5363v-hi-res" → "mst-msl5363v-hi-res").
// Provenance: 'marthastewart-tv'. Confidence: 'inferred'.
// Skips playlist/other media types (they're collection covers, not broadcasts).

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import "dotenv/config";

const RAW_DIR = "data/marthastewart-tv/raw";
const sql = postgres(process.env.DATABASE_URL_UNPOOLED, { prepare: false, max: 4 });

// ── 1) load everything ──────────────────────────────────
const used = new Set((await sql`SELECT mst_vhx_id FROM episodes WHERE mst_vhx_id IS NOT NULL`).map(r => r.mst_vhx_id));
console.log(`[augment] already-linked vhx ids: ${used.size}`);

const showsRow = await sql`SELECT id FROM shows WHERE slug = 'martha-stewart-living' LIMIT 1`;
const showId = showsRow[0]?.id ?? null;

// Years per season for MSL (from episodes.json meta + general knowledge)
const SEASON_YEAR = { 1:1993, 2:1994, 3:1995, 4:1996, 5:1997, 6:1998, 7:1999, 8:2000, 9:2001, 10:2002, 11:2003 };

function parseBroadcastCode(title) {
  if (!title) return null;
  const m = title.match(/E(?:pisode\s+)?(\d+)V?(?:\s|$|[,;])/i);
  return m ? parseInt(m[1], 10) : null;
}

function deriveSlug(canonical, vhxId) {
  if (canonical) return canonical.replace(/-hi-res(-\d+)?$/, ""); // strip "-hi-res" suffix
  return `vhx-${vhxId}`;
}

function dbId(canonical, vhxId) {
  return `mst-${deriveSlug(canonical, vhxId)}`;
}

// ── 2) walk all raw records, pick unused video/episode types ──
const files = await readdir(RAW_DIR);
const toInsert = [];
const skipped = { used: 0, no_season: 0, non_video: 0 };

for (const f of files) {
  const o = JSON.parse(await readFile(join(RAW_DIR, f), "utf8"));
  if (used.has(o.id)) { skipped.used++; continue; }
  const mediaType = o.media_type ?? o.type;
  if (mediaType !== "video" && mediaType !== "episode") { skipped.non_video++; continue; }
  const season = o.season_number ?? o.metadata?.season_number ?? null;
  if (!season) { skipped.no_season++; continue; }

  const canonicalUrl = o._links?.video_page?.href ?? null;
  const canonical = canonicalUrl?.match(/\/videos\/([a-z0-9-]+)/)?.[1] ?? null;
  const id = dbId(canonical, o.id);
  const code = parseBroadcastCode(o.title);
  const description = o.description ?? null;
  const airYear = SEASON_YEAR[season] ?? null;
  // Title cleanup: vhx ones are "MSL Season N Episode CCCV [optional segment hint]"
  let title = o.title ?? "Untitled";
  // Strip the "MSL Season N Episode " prefix if there's a substantive trailing description
  const titleMatch = title.match(/^MSL\s+(?:S(?:eason)?\s*)?\d+\s*E(?:pisode\s+)?\d+V?\s*(.*)$/i);
  if (titleMatch && titleMatch[1] && titleMatch[1].length > 3) {
    title = titleMatch[1].trim();
  }
  // Otherwise keep the canonical "MSL Season N Episode CCCV" as the title.

  toInsert.push({
    id,
    show_slug: "martha-stewart-living",
    show_id: showId,
    show_name: "Martha Stewart Living",
    season,
    episode_number: code,
    title,
    air_date_raw: null,
    air_date: null,
    air_year: airYear,
    air_month: null,
    air_precision: airYear ? "year" : "unknown",
    runtime_minutes: o.duration?.seconds ? Math.round(o.duration.seconds / 60) : null,
    network: season <= 9 ? "Syndicated / CBS" : "Hallmark Channel",
    streaming: ["marthastewart.tv"],
    description,
    confidence: "inferred",
    single_source: true,
    sources: canonicalUrl ? [canonicalUrl] : [],
    photo_url: `/static/episode-images/medium/${o.id}.jpg`,
    photo_url_source: `/static/episode-images/source/${o.id}.jpg`,
    mst_vhx_id: o.id,
    mst_canonical_slug: canonical,
    mst_canonical_url: canonicalUrl,
    mst_match_score: "1.000:augmented",
    mst_duration_seconds: o.duration?.seconds ?? null,
    provenance: "marthastewart-tv",
  });
}

console.log(`[augment] candidates: ${toInsert.length}`);
console.log(`[augment] skipped: used=${skipped.used} non_video=${skipped.non_video} no_season=${skipped.no_season}`);

// ── 3) Resolve ID collisions: dedupe by id, keep the one with the richest description ──
const byId = new Map();
for (const r of toInsert) {
  const cur = byId.get(r.id);
  if (!cur || (r.description?.length ?? 0) > (cur.description?.length ?? 0)) byId.set(r.id, r);
}
const uniqRows = Array.from(byId.values());
console.log(`[augment] unique after id collapse: ${uniqRows.length}`);

// ── 4) Resolve (show_slug, season, episode_number) unique-index conflicts ──
// Existing episodes that share season+code will block inserts. Strategy: if there's
// already a row with the same (season, episode_number) and provenance='seed', skip
// the augmented one (the seed row already exists, we're just adding photo if we can).
const conflictKeys = new Set();
const existingSeedRows = await sql`
  SELECT season, episode_number FROM episodes
  WHERE show_slug = 'martha-stewart-living' AND provenance = 'seed' AND season IS NOT NULL AND episode_number IS NOT NULL
`;
for (const e of existingSeedRows) conflictKeys.add(`${e.season}:${e.episode_number}`);

const filtered = uniqRows.filter((r) => !conflictKeys.has(`${r.season}:${r.episode_number}`));
console.log(`[augment] dropping ${uniqRows.length - filtered.length} that would collide with existing seed rows on (season, episode_number)`);

// ── 5) Bulk insert (no upsert needed: ids are new) ──
function chunk(a, n) { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }

let inserted = 0;
for (const c of chunk(filtered, 200)) {
  await sql`INSERT INTO episodes ${sql(c)} ON CONFLICT (id) DO NOTHING`;
  inserted += c.length;
  process.stdout.write(`[augment] inserted ${inserted}/${filtered.length}\r`);
}
console.log(`\n[augment] inserted ${inserted} new episode rows`);

// ── 6) Audit ──
const counts = await sql`
  SELECT provenance, count(*)::int c FROM episodes WHERE show_slug = 'martha-stewart-living' GROUP BY provenance ORDER BY provenance
`;
console.log(`[augment] MSL row counts by provenance:`);
for (const r of counts) console.log(`  ${r.provenance}: ${r.c}`);

const photoCounts = await sql`
  SELECT provenance, count(*) FILTER (WHERE photo_url IS NOT NULL) AS with_photo, count(*)::int total
  FROM episodes WHERE show_slug = 'martha-stewart-living' GROUP BY provenance ORDER BY provenance
`;
console.log(`[augment] photo coverage:`);
for (const r of photoCounts) console.log(`  ${r.provenance}: ${r.with_photo}/${r.total} with photo`);

const overall = await sql`SELECT count(*)::int c FROM episodes`;
console.log(`[augment] total episodes (all shows): ${overall[0].c}`);

await sql.end();
