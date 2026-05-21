// Persist match data + mst collections into the DB.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import "dotenv/config";

const sql = postgres(process.env.DATABASE_URL_UNPOOLED, { prepare: false, max: 4 });

// ── 1) episodes photo_url + mst_* fields ────────────────
const matches = JSON.parse(await readFile("data/marthastewart-tv/matches.json", "utf8"));
const rawDir = "data/marthastewart-tv/raw";

console.log(`[persist] applying ${Object.keys(matches).length} episode → vhx matches`);
let epUpdated = 0;
for (const [episode_id, m] of Object.entries(matches)) {
  // Local-hosted thumb path
  const photoUrl = `/static/episode-images/medium/${m.vhx_id}.jpg`;
  const photoSourceUrl = `/static/episode-images/source/${m.vhx_id}.jpg`;
  const canonicalUrl = m.canonical_url;
  const canonicalSlug = canonicalUrl?.match(/\/videos\/([a-z0-9-]+)/)?.[1] ?? null;
  await sql`
    UPDATE episodes
    SET photo_url = ${photoUrl},
        photo_url_source = ${photoSourceUrl},
        mst_vhx_id = ${m.vhx_id},
        mst_canonical_slug = ${canonicalSlug},
        mst_canonical_url = ${canonicalUrl},
        mst_match_score = ${String(m.score)},
        updated_at = now()
    WHERE id = ${episode_id}
  `;
  epUpdated++;
  if (epUpdated % 100 === 0) process.stdout.write(`[persist] eps ${epUpdated}\r`);
}
console.log(`\n[persist] updated ${epUpdated} episodes`);

// ── 2) mst_collections ─────────────────────────────────
const cols = JSON.parse(await readFile("data/marthastewart-tv/collections.json", "utf8"));
console.log(`[persist] upserting ${cols.length} collections`);
let pos = 0;
for (const c of cols) {
  await sql`
    INSERT INTO mst_collections (slug, name, vhx_collection_id, items_count, thumbnail_url, sort_order)
    VALUES (${c.slug}, ${c.name}, ${Number(c.collection_id)}, ${c.items_count ?? 0}, ${c.thumbnail ?? null}, ${pos++})
    ON CONFLICT (slug) DO UPDATE
      SET name = EXCLUDED.name,
          items_count = EXCLUDED.items_count,
          thumbnail_url = EXCLUDED.thumbnail_url,
          sort_order = EXCLUDED.sort_order
  `;
}
console.log(`[persist] ${pos} collections upserted`);

// ── 3) mst_collection_items ────────────────────────────
const items = JSON.parse(await readFile("data/marthastewart-tv/items.json", "utf8"));
// Build vhx_id → episode_id lookup from matches
const vhxToEp = new Map();
for (const [epId, m] of Object.entries(matches)) vhxToEp.set(m.vhx_id, epId);

console.log(`[persist] truncating + inserting ${items.length} collection items`);
await sql`TRUNCATE mst_collection_items RESTART IDENTITY`;

// chunked inserts
function chunk(a, n) { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }

const rows = items
  .filter((it) => it.vhx_id)
  .map((it, i) => ({
    collection_slug: it.collection_slug,
    vhx_id: it.vhx_id,
    episode_id: vhxToEp.get(it.vhx_id) ?? null,
    position: i,
    title: it.title,
    description: it.description,
    photo_url: it.vhx_id ? `/static/episode-images/medium/${it.vhx_id}.jpg` : null,
    photo_source_url: it.vhx_id ? `/static/episode-images/source/${it.vhx_id}.jpg` : null,
    canonical_url: it.video_page_url,
    canonical_slug: it.canonical_slug,
    season_number: it.season_number,
    episode_number_vhx: it.episode_number,
    duration_seconds: it.duration_seconds,
  }));

// position should be per-collection
const positionByCol = new Map();
for (const r of rows) {
  const p = positionByCol.get(r.collection_slug) ?? 0;
  r.position = p;
  positionByCol.set(r.collection_slug, p + 1);
}

let inserted = 0;
for (const batch of chunk(rows, 200)) {
  await sql`INSERT INTO mst_collection_items ${sql(batch)} ON CONFLICT DO NOTHING`;
  inserted += batch.length;
  process.stdout.write(`[persist] items ${inserted}/${rows.length}\r`);
}
console.log(`\n[persist] inserted ${inserted} items`);

// summary
const cnt = await sql`SELECT count(*) FROM episodes WHERE photo_url IS NOT NULL`;
const cols2 = await sql`SELECT count(*) FROM mst_collections`;
const items2 = await sql`SELECT count(*) FROM mst_collection_items`;
console.log(`[persist] DB now has:`);
console.log(`  episodes w/ photo:    ${cnt[0].count}`);
console.log(`  mst_collections:      ${cols2[0].count}`);
console.log(`  mst_collection_items: ${items2[0].count}`);

await sql.end();
