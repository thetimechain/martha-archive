// Persist entities.json into mst_entities + mst_episode_entities.
//
// Resolves vhx_id → episode_id by joining against `episodes.mst_vhx_id`. Skips
// appearances whose vhx item has no corresponding episode row.

import { readFile } from "node:fs/promises";
import postgres from "postgres";
import "dotenv/config";

const sql = postgres(process.env.DATABASE_URL_UNPOOLED, { prepare: false, max: 4 });

const data = JSON.parse(await readFile("data/marthastewart-tv/entities.json", "utf8"));

// Build vhx_id → episode_id map (only episodes with mst_vhx_id are reachable).
const epRows = await sql`SELECT id, mst_vhx_id FROM episodes WHERE mst_vhx_id IS NOT NULL`;
const epByVhx = new Map(epRows.map((r) => [r.mst_vhx_id, r.id]));
console.log(`[persist] ${epByVhx.size} episodes have mst_vhx_id linkage`);

// Tally mentions per entity (count only appearances that resolve to a known episode).
const mentions = new Map();
const resolvedApps = [];
const orphanCounts = new Map();
for (const a of data.appearances) {
  const epId = epByVhx.get(a.vhx_id);
  if (!epId) {
    orphanCounts.set(a.slug, (orphanCounts.get(a.slug) || 0) + 1);
    continue;
  }
  mentions.set(a.slug, (mentions.get(a.slug) || 0) + 1);
  resolvedApps.push({ episode_id: epId, entity_slug: a.slug, source: a.source, context: a.context });
}
console.log(`[persist] ${resolvedApps.length} resolved appearances (of ${data.appearances.length} total)`);

// Build entity rows. `entityType` = 'person' | 'place'.
const personSlugs = new Set(data.people.map((p) => p.slug));
const placeSlugs = new Set(data.places.map((p) => p.slug));
const entityRows = [];
for (const p of data.people) {
  entityRows.push({
    slug: p.slug, name: p.name, kind: p.kind ?? "guest",
    entity_type: "person", role: p.role ?? null,
    mentions: mentions.get(p.slug) ?? 0,
  });
}
for (const p of data.places) {
  entityRows.push({
    slug: p.slug, name: p.name, kind: p.kind ?? "business",
    entity_type: "place", role: p.role ?? null,
    mentions: mentions.get(p.slug) ?? 0,
  });
}
// Keep entities that either (a) have resolved episode mentions, OR (b) come with a researched
// role (curated entry — every curated PEOPLE / CURATED_PLACES item has a role even if the alias
// regex hasn't yet matched any vhx description). Drop only the discovered-with-no-role-and-no-
// mentions noise.
const insertable = entityRows.filter((r) => r.mentions > 0 || (r.role && r.role.length > 60));
console.log(`[persist] ${insertable.length} entities will be written (skipping ${entityRows.length - insertable.length} discovered-without-role-or-mention)`);

// Wipe + re-insert (entity universe is fully derived; safe to rebuild).
await sql`TRUNCATE mst_episode_entities RESTART IDENTITY`;
await sql`TRUNCATE mst_entities CASCADE`;

if (insertable.length) {
  await sql`INSERT INTO mst_entities ${sql(insertable)}`;
}
console.log(`[persist] inserted ${insertable.length} entity rows`);

// Insert appearances in chunks; the unique (episode_id, entity_slug) index will collapse dupes.
const validSlugs = new Set(insertable.map((r) => r.slug));
const apps = resolvedApps.filter((r) => validSlugs.has(r.entity_slug));
function chunk(a, n) { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
let inserted = 0;
for (const batch of chunk(apps, 200)) {
  await sql`INSERT INTO mst_episode_entities ${sql(batch)} ON CONFLICT (episode_id, entity_slug) DO NOTHING`;
  inserted += batch.length;
  process.stdout.write(`[persist] ${inserted}/${apps.length}\r`);
}
console.log(`\n[persist] wrote ${inserted} appearance rows`);

// Coverage report
const peopleCount = await sql`SELECT count(*)::int c FROM mst_entities WHERE entity_type = 'person'`;
const placesCount = await sql`SELECT count(*)::int c FROM mst_entities WHERE entity_type = 'place'`;
const epsCovered = await sql`
  SELECT count(DISTINCT episode_id)::int c FROM mst_episode_entities
`;
console.log(`[persist] ${peopleCount[0].c} people, ${placesCount[0].c} places`);
console.log(`[persist] ${epsCovered[0].c} unique episodes have at least one entity credit`);

await sql.end();
