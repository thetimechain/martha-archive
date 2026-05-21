// Download every unique thumbnail (medium + source) to public/episode-images/
import { readFile, writeFile, mkdir, access, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";

const RAW_DIR = "data/marthastewart-tv/raw";
const OUT_DIR = "public/episode-images";
const MED_DIR = join(OUT_DIR, "medium");
const SRC_DIR = join(OUT_DIR, "source");
await mkdir(MED_DIR, { recursive: true });
await mkdir(SRC_DIR, { recursive: true });

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const files = await readdir(RAW_DIR);
console.log(`[thumbs] ${files.length} raw records`);

// Build target list keyed by vhx_id
const jobs = [];
for (const f of files) {
  const obj = JSON.parse(await readFile(join(RAW_DIR, f), "utf8"));
  const id = obj.id;
  const m = obj.thumbnail?.medium;
  const s = obj.thumbnail?.source;
  if (!m && !s) continue;
  jobs.push({ id, medium: m, source: s });
}

async function dlOne(url, path) {
  try { await access(path); return "skip"; } catch {}
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 500) throw new Error("too small");
  await writeFile(path, buf);
  return "ok";
}

const concurrency = 12;
const buckets = Array.from({ length: concurrency }, () => []);
jobs.forEach((j, i) => buckets[i % concurrency].push(j));

let ok = 0, skip = 0, fail = 0;
async function worker(arr) {
  for (const j of arr) {
    try {
      if (j.medium) {
        const r = await dlOne(j.medium, join(MED_DIR, `${j.id}.jpg`));
        r === "ok" ? ok++ : skip++;
      }
      if (j.source) {
        const r = await dlOne(j.source, join(SRC_DIR, `${j.id}.jpg`));
        r === "ok" ? ok++ : skip++;
      }
    } catch (e) {
      fail++;
      console.warn(`! ${j.id}: ${e.message}`);
    }
    if ((ok + skip + fail) % 100 === 0)
      process.stdout.write(`[thumbs] ok=${ok} skip=${skip} fail=${fail}\r`);
  }
}
await Promise.all(buckets.map(worker));
console.log(`\n[thumbs] done — ok=${ok} skipped=${skip} failed=${fail}`);
