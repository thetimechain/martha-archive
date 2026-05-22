// Build a manifest of every vhx asset we hold locally, for posterity.
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";

const RAW = "data/marthastewart-tv/raw";
const PL  = "data/marthastewart-tv/raw-playlists";
const MED = "public/episode-images/medium";
const SRC = "public/episode-images/source";

async function totalBytes(dir) {
  let n = 0, count = 0;
  for (const f of await readdir(dir)) {
    const s = await stat(join(dir, f));
    n += s.size; count++;
  }
  return { count, bytes: n };
}

const [rawStat, plStat, medStat, srcStat] = await Promise.all([
  totalBytes(RAW), totalBytes(PL), totalBytes(MED), totalBytes(SRC),
]);

const rawIds = (await readdir(RAW)).map(f => Number(f.replace(".json","")));
const plIds  = (await readdir(PL)).map(f => Number(f.replace(".json","")));
const medIds = (await readdir(MED)).map(f => Number(f.replace(".jpg","")));
const srcIds = (await readdir(SRC)).map(f => Number(f.replace(".jpg","")));

const allKnown = new Set([...rawIds, ...plIds]);
const allImg   = new Set([...medIds, ...srcIds]);
const noImg    = [...allKnown].filter(id => !allImg.has(id));

const items = JSON.parse(await readFile("data/marthastewart-tv/items.json", "utf8"));
const itemIds = new Set(items.map(i => i.vhx_id).filter(Boolean));

const manifest = {
  generated_at: new Date().toISOString(),
  source: "https://www.marthastewart.tv (Vimeo OTT, site 47779, product 35217)",
  counts: {
    items_in_items_json: itemIds.size,
    raw_video_records: rawStat.count,
    raw_playlist_records: plStat.count,
    medium_thumbnails: medStat.count,
    source_thumbnails: srcStat.count,
  },
  bytes: {
    raw: rawStat.bytes,
    playlists: plStat.bytes,
    medium: medStat.bytes,
    source: srcStat.bytes,
    total: rawStat.bytes + plStat.bytes + medStat.bytes + srcStat.bytes,
  },
  coverage: {
    items_with_raw_or_playlist: [...itemIds].filter(id => allKnown.has(id)).length,
    items_with_image: [...itemIds].filter(id => allImg.has(id)).length,
    items_missing_image: [...itemIds].filter(id => !allImg.has(id)),
  },
  ids_without_image: noImg,
};

await writeFile("data/marthastewart-tv/manifest.json", JSON.stringify(manifest, null, 2));
console.log("[manifest] written");
console.log(`  items in items.json:    ${manifest.counts.items_in_items_json}`);
console.log(`  raw records:            ${manifest.counts.raw_video_records} (+ ${manifest.counts.raw_playlist_records} playlist)`);
console.log(`  medium thumbnails:      ${manifest.counts.medium_thumbnails}`);
console.log(`  source thumbnails:      ${manifest.counts.source_thumbnails}`);
console.log(`  with raw/playlist:      ${manifest.coverage.items_with_raw_or_playlist}/${manifest.counts.items_in_items_json}`);
console.log(`  with image:             ${manifest.coverage.items_with_image}/${manifest.counts.items_in_items_json}`);
console.log(`  total bytes on disk:    ${(manifest.bytes.total / 1024 / 1024).toFixed(1)} MB`);
