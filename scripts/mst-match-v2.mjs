// Comprehensive matcher: broadcast-code first, then one-to-one title match.
//
// Stages:
//   1. Reset photo_url / mst_* on every MSL row.
//   2. Phase A: broadcast-code match (DB.episode_number === vhx broadcast code in same season).
//   3. Phase B: greedy one-to-one bipartite assignment via title/description containment.
//   4. Persist.

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import "dotenv/config";

const RAW_DIR = "data/marthastewart-tv/raw";
const sql = postgres(process.env.DATABASE_URL_UNPOOLED, { prepare: false, max: 4 });

// ── load vhx ────────────────────────────────────────────
const files = await readdir(RAW_DIR);
const vhx = [];
for (const f of files) {
  const o = JSON.parse(await readFile(join(RAW_DIR, f), "utf8"));
  const m = (o.title || "").match(/E(?:pisode\s+)?(\d+)V?(?:\s|$|[,;])/i);
  o.broadcast_code = m ? parseInt(m[1], 10) : null;
  o.season_eff = o.season_number ?? o.metadata?.season_number ?? null;
  vhx.push(o);
}
console.log(`[v2] ${vhx.length} vhx records`);

const dbEps = await sql`
  SELECT id, season, episode_number, title, description
  FROM episodes
  WHERE show_slug = 'martha-stewart-living'
  ORDER BY season, episode_number
`;
console.log(`[v2] ${dbEps.length} DB MSL episodes`);

// ── helpers ─────────────────────────────────────────────
const STOP = new Set(["a","an","the","and","or","of","with","for","to","in","on","at","by","from","as","is","that","this"]);
function tokens(s) {
  if (!s) return [];
  return Array.from(new Set(
    s.toLowerCase().replace(/[\r\n]+/g, " ").replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/).filter(Boolean).filter(t => !STOP.has(t) && t.length >= 3)
  ));
}
function titleSegments(s) {
  if (!s) return [];
  return s.split(/[;·]/).map(t => t.trim()).filter(Boolean);
}
function descSegments(s) {
  if (!s) return [];
  return s.split(/\r?\n/).map(l => l.replace(/^[-•*●·]+\s*/, "").trim()).filter(Boolean);
}
function bestSegmentMatch(dbTitle, vhxTitle, vhxDesc) {
  const dbSegs = titleSegments(dbTitle);
  const vhxSegs = descSegments(vhxDesc).concat(vhxTitle ? [vhxTitle] : []);
  if (!dbSegs.length || !vhxSegs.length) return 0;
  let best = 0;
  for (const v of vhxSegs) {
    const vt = tokens(v);
    if (!vt.length) continue;
    for (const d of dbSegs) {
      const dt = tokens(d);
      if (!dt.length) continue;
      const inter = vt.filter(x => dt.includes(x)).length;
      const cov = inter / Math.min(vt.length, dt.length);
      if (cov > best) best = cov;
    }
  }
  return best;
}

// ── 1. clear existing matches ───────────────────────────
console.log(`[v2] clearing existing matches…`);
await sql`
  UPDATE episodes
  SET photo_url = NULL, photo_url_source = NULL,
      mst_vhx_id = NULL, mst_canonical_slug = NULL,
      mst_canonical_url = NULL, mst_match_score = NULL
  WHERE show_slug = 'martha-stewart-living'
`;

// ── 2. Phase A: broadcast-code ──────────────────────────
const taken = new Set(); // vhx_id used
const matches = {}; // db_id → { vhx, score, reason }
let codeA = 0;
for (const ep of dbEps) {
  // try exact match: same season, broadcast_code == episode_number
  const cands = vhx.filter(v => v.season_eff === ep.season && v.broadcast_code === ep.episode_number && !taken.has(v.id));
  if (cands.length === 1) {
    matches[ep.id] = { vhx: cands[0], score: 1.0, reason: "broadcast_code" };
    taken.add(cands[0].id);
    codeA++;
  } else if (cands.length > 1) {
    // pick the one with the richest description
    const pick = cands.sort((a, b) => (b.description?.length ?? 0) - (a.description?.length ?? 0))[0];
    matches[ep.id] = { vhx: pick, score: 0.95, reason: "broadcast_code_multi" };
    taken.add(pick.id);
    codeA++;
  }
}
console.log(`[v2] phase A (broadcast-code): ${codeA} matches`);

// ── 3. Phase B: one-to-one greedy on title overlap ──────
// Build list of (db, vhx, score) for all unmatched DB × unused vhx in the same season.
const dbUnmatched = dbEps.filter(ep => !matches[ep.id]);
console.log(`[v2] phase B: scoring ${dbUnmatched.length} DB × remaining vhx…`);

const pairs = [];
for (const ep of dbUnmatched) {
  for (const v of vhx) {
    if (taken.has(v.id)) continue;
    if (v.season_eff !== ep.season) continue;
    const score = bestSegmentMatch(ep.title, v.title, v.description);
    if (score >= 0.5) pairs.push({ epId: ep.id, vhxId: v.id, score });
  }
}
// sort descending by score, greedily assign
pairs.sort((a, b) => b.score - a.score);
const epUsed = new Set();
let codeB = 0;
const vhxById = new Map(vhx.map(v => [v.id, v]));
for (const p of pairs) {
  if (epUsed.has(p.epId) || taken.has(p.vhxId)) continue;
  matches[p.epId] = { vhx: vhxById.get(p.vhxId), score: p.score, reason: "title_overlap_unique" };
  epUsed.add(p.epId);
  taken.add(p.vhxId);
  codeB++;
}
console.log(`[v2] phase B (one-to-one title): ${codeB} matches`);

// ── 3b. Phase C: looser title threshold (>= 0.34), still one-to-one ──
const dbStillUnmatched = dbEps.filter(ep => !matches[ep.id]);
console.log(`[v2] phase C: trying looser threshold on ${dbStillUnmatched.length} remaining`);
const pairsC = [];
for (const ep of dbStillUnmatched) {
  for (const v of vhx) {
    if (taken.has(v.id)) continue;
    if (v.season_eff !== ep.season) continue;
    const score = bestSegmentMatch(ep.title, v.title, v.description);
    if (score >= 0.34) pairsC.push({ epId: ep.id, vhxId: v.id, score });
  }
}
pairsC.sort((a, b) => b.score - a.score);
let codeC = 0;
const epUsedC = new Set();
for (const p of pairsC) {
  if (epUsedC.has(p.epId) || taken.has(p.vhxId)) continue;
  matches[p.epId] = { vhx: vhxById.get(p.vhxId), score: p.score, reason: "title_overlap_loose" };
  epUsedC.add(p.epId);
  taken.add(p.vhxId);
  codeC++;
}
console.log(`[v2] phase C (loose, one-to-one): ${codeC} matches`);

// ── 3c. Phase D: title-only matching against ALL remaining vhx (any season, including null) ──
const dbStillUnmatchedD = dbEps.filter(ep => !matches[ep.id]);
console.log(`[v2] phase D: cross-season title match on ${dbStillUnmatchedD.length} remaining`);
const pairsD = [];
for (const ep of dbStillUnmatchedD) {
  for (const v of vhx) {
    if (taken.has(v.id)) continue;
    const score = bestSegmentMatch(ep.title, v.title, v.description);
    if (score >= 0.34) pairsD.push({ epId: ep.id, vhxId: v.id, score });
  }
}
pairsD.sort((a, b) => b.score - a.score);
let codeD = 0;
const epUsedD = new Set();
for (const p of pairsD) {
  if (epUsedD.has(p.epId) || taken.has(p.vhxId)) continue;
  matches[p.epId] = { vhx: vhxById.get(p.vhxId), score: p.score, reason: "title_cross_season" };
  epUsedD.add(p.epId);
  taken.add(p.vhxId);
  codeD++;
}
console.log(`[v2] phase D (cross-season title): ${codeD} matches`);

console.log(`[v2] total matches: ${Object.keys(matches).length} / ${dbEps.length} = ${(Object.keys(matches).length / dbEps.length * 100).toFixed(1)}%`);

// breakdown by reason
const reasons = {};
for (const m of Object.values(matches)) reasons[m.reason] = (reasons[m.reason] || 0) + 1;
console.log(`[v2] by reason:`, reasons);

// ── 4. persist ──────────────────────────────────────────
console.log(`[v2] persisting…`);
let written = 0;
for (const [epId, m] of Object.entries(matches)) {
  const v = m.vhx;
  const photoUrl = `/static/episode-images/medium/${v.id}.jpg`;
  const photoSourceUrl = `/static/episode-images/source/${v.id}.jpg`;
  const canonicalUrl = v._links?.video_page?.href ?? null;
  const canonicalSlug = canonicalUrl?.match(/\/videos\/([a-z0-9-]+)/)?.[1] ?? null;
  await sql`
    UPDATE episodes
    SET photo_url = ${photoUrl},
        photo_url_source = ${photoSourceUrl},
        mst_vhx_id = ${v.id},
        mst_canonical_slug = ${canonicalSlug},
        mst_canonical_url = ${canonicalUrl},
        mst_match_score = ${`${m.score.toFixed(3)}:${m.reason}`},
        updated_at = now()
    WHERE id = ${epId}
  `;
  written++;
  if (written % 100 === 0) process.stdout.write(`[v2] ${written}\r`);
}
console.log(`\n[v2] wrote ${written} rows`);

// audit: any vhx_id claimed by multiple DB episodes?
const collisions = await sql`
  SELECT mst_vhx_id, count(*) c FROM episodes
  WHERE show_slug='martha-stewart-living' AND mst_vhx_id IS NOT NULL
  GROUP BY mst_vhx_id HAVING count(*) > 1
`;
console.log(`[v2] collisions remaining:`, collisions.length);
if (collisions.length) {
  for (const c of collisions.slice(0, 5)) console.log(`  vhx ${c.mst_vhx_id} claimed ${c.c} times`);
}

await sql.end();
