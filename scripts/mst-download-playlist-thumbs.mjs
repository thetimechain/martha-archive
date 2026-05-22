// Download thumbnails for the 27 playlist (sub-collection) raw records.
import { readdir, readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";

const PL = "data/marthastewart-tv/raw-playlists";
const MED = "public/episode-images/medium";
const SRC = "public/episode-images/source";
await mkdir(MED, { recursive: true });
await mkdir(SRC, { recursive: true });

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const files = await readdir(PL);
let ok = 0, skip = 0, fail = 0;
for (const f of files) {
  const o = JSON.parse(await readFile(join(PL, f), "utf8"));
  const id = o.id ?? Number(f.replace(".json", ""));
  for (const [size, dir] of [["medium", MED], ["source", SRC]]) {
    const url = o.thumbnail?.[size];
    if (!url) continue;
    const dest = join(dir, `${id}.jpg`);
    try { await access(dest); skip++; continue; } catch {}
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) { fail++; console.warn(`! ${id} ${size}: HTTP ${r.status}`); continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    await writeFile(dest, buf);
    ok++;
  }
}
console.log(`[playlist-thumbs] ok=${ok} skip=${skip} fail=${fail}`);
