// For each DB episode, find the best vhx item by title-overlap.
// Writes data/marthastewart-tv/matches.json: { db_episode_id: { vhx_id, score, ... } }

import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import "dotenv/config";

const RAW_DIR = "data/marthastewart-tv/raw";
const OUT = "data/marthastewart-tv/matches.json";

const sql = postgres(process.env.DATABASE_URL_UNPOOLED, { prepare: false, max: 2 });

const files = await readdir(RAW_DIR);
const vhx = [];
for (const f of files) {
  const o = JSON.parse(await readFile(join(RAW_DIR, f), "utf8"));
  vhx.push(o);
}
console.log(`[match] ${vhx.length} vhx records`);

const dbEps = await sql`
  SELECT id, season, episode_number, title, description
  FROM episodes
  WHERE show_slug = 'martha-stewart-living'
  ORDER BY season, episode_number
`;
console.log(`[match] ${dbEps.length} DB MSL episodes`);

const STOP = new Set([
  "a","an","the","and","or","of","with","for","to","in","on","at","by","from","as","is","that","this",
]);

function tokens(s) {
  if (!s) return [];
  return Array.from(
    new Set(
      s
        .toLowerCase()
        .replace(/[\r\n]+/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .filter((t) => !STOP.has(t) && t.length >= 3),
    ),
  );
}

function descSegments(s) {
  if (!s) return [];
  return s
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-•*●·]+\s*/, "").trim())
    .filter(Boolean);
}

function titleSegments(s) {
  // DB titles like "Roast Chicken 101; Luminaries; Succulent Strawberry Jars"
  if (!s) return [];
  return s.split(/[;·]/).map((t) => t.trim()).filter(Boolean);
}

// score a single (db, vhx) pair: how much of the DB title's content is reflected in vhx?
function score(dbTitle, dbDesc, vhxTitle, vhxDesc) {
  const dbSegs = titleSegments(dbTitle);
  const vhxSegs = descSegments(vhxDesc).concat(vhxTitle ? [vhxTitle] : []);
  if (!dbSegs.length || !vhxSegs.length) return 0;

  // The best vhx item for a DB episode is one whose first segment overlaps strongly
  // with ANY of the DB title's segments.
  let best = 0;
  for (const v of vhxSegs) {
    const vt = tokens(v);
    if (!vt.length) continue;
    for (const d of dbSegs) {
      const dt = tokens(d);
      if (!dt.length) continue;
      const inter = vt.filter((t) => dt.includes(t)).length;
      // containment of the shorter side
      const shortest = Math.min(vt.length, dt.length);
      const cov = inter / shortest;
      best = Math.max(best, cov);
    }
  }
  return best;
}

// Group vhx by season for speed
const vhxBySeason = new Map();
for (const v of vhx) {
  const s = v.season_number ?? v.metadata?.season_number ?? null;
  if (s === null) continue;
  if (!vhxBySeason.has(s)) vhxBySeason.set(s, []);
  vhxBySeason.get(s).push(v);
}

// For each DB episode, pick the best vhx item
const matches = {}; // db_id → { vhx_id, score, vhx_title, vhx_lead, db_title }
let high = 0, mid = 0, low = 0, none = 0;
for (const ep of dbEps) {
  const cands = vhxBySeason.get(ep.season) ?? [];
  let best = null;
  for (const v of cands) {
    const s = score(ep.title, ep.description, v.title, v.description);
    if (!best || s > best.score) best = { v, score: s };
  }
  if (!best || best.score < 0.34) {
    none++;
    continue;
  }
  matches[ep.id] = {
    vhx_id: best.v.id,
    score: Number(best.score.toFixed(3)),
    vhx_title: best.v.title,
    vhx_lead: descSegments(best.v.description)[0] ?? "",
    db_title: ep.title,
    thumb_medium: best.v.thumbnail?.medium ?? null,
    thumb_source: best.v.thumbnail?.source ?? null,
    canonical_url: best.v._links?.video_page?.href ?? null,
  };
  if (best.score >= 0.75) high++;
  else if (best.score >= 0.5) mid++;
  else low++;
}

console.log(`[match] high(>=.75)=${high}  mid(.5-.75)=${mid}  low(.34-.5)=${low}  none=${none}`);
console.log(`[match] coverage: ${Object.keys(matches).length}/${dbEps.length} = ${((Object.keys(matches).length/dbEps.length)*100).toFixed(1)}%`);

// sample low and high
const sorted = Object.entries(matches).sort((a, b) => b[1].score - a[1].score);
console.log("\n[match] high-confidence samples:");
for (const [id, m] of sorted.slice(0, 5)) console.log(`  ${id} ${m.score} — db: ${m.db_title}\n    vhx: ${m.vhx_lead}`);
console.log("\n[match] low-confidence samples:");
for (const [id, m] of sorted.slice(-5)) console.log(`  ${id} ${m.score} — db: ${m.db_title}\n    vhx: ${m.vhx_lead}`);

await writeFile(OUT, JSON.stringify(matches, null, 2));
await sql.end();
