// Hit /videos/<id> for every unique vhx item to save full raw record.
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import "dotenv/config";

const EMAIL = process.env.MARTHA_TV_USERNAME;
const PASS = process.env.MARTHA_TV_PASSWORD;
const OUT_DIR = "data/marthastewart-tv";
const RAW_DIR = join(OUT_DIR, "raw");
await mkdir(RAW_DIR, { recursive: true });

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const cookies = new Map();
function setCookies(headers) {
  for (const line of headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const [n, ...v] = pair.split("=");
    cookies.set(n.trim(), v.join("=").trim());
  }
}
async function browser(url, init = {}) {
  const headers = { "User-Agent": UA, ...(init.headers ?? {}) };
  if (cookies.size) headers.Cookie = Array.from(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  const r = await fetch(url, { ...init, headers, redirect: "manual" });
  setCookies(r.headers);
  if (r.status >= 300 && r.status < 400) return browser(new URL(r.headers.get("location"), url).toString());
  return r;
}
async function login() {
  const g = await browser("https://www.marthastewart.tv/login");
  const html = await g.text();
  const block = html.split('id="login-form-password"')[1] ?? "";
  const tok = block.match(/name="authenticity_token"\s+value="([^"]+)"/)[1];
  const fd = new URLSearchParams({ authenticity_token: tok, "utf8": "✓", email: EMAIL, password: PASS });
  await browser("https://www.marthastewart.tv/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: "https://www.marthastewart.tv/login" },
    body: fd.toString(),
  });
}

let jwt = null;
let exp = 0;
async function getJwt() {
  if (jwt && Date.now() / 1000 < exp - 30) return jwt;
  const r = await browser("https://www.marthastewart.tv/browse");
  const t = await r.text();
  jwt = t.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)[0];
  exp = JSON.parse(Buffer.from(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()).exp;
  return jwt;
}

async function api(url) {
  for (let i = 0; i < 4; i++) {
    const tok = await getJwt();
    const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}`, "User-Agent": UA } });
    if (r.status === 401) { jwt = null; continue; }
    if (r.status === 429) { await new Promise((r) => setTimeout(r, 2 ** i * 1000)); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
    return r.json();
  }
  throw new Error("giving up");
}

await login();
const items = JSON.parse(await readFile(join(OUT_DIR, "videos.json"), "utf8"));
const targets = items.filter((it) => it.vhx_id && (it.media_type === "video" || it.media_type === "episode"));
console.log(`[full] fetching ${targets.length} videos`);

let ok = 0,
  skipped = 0,
  failed = 0;
const concurrency = 6;
async function worker(arr) {
  for (const t of arr) {
    const path = join(RAW_DIR, `${t.vhx_id}.json`);
    try {
      await access(path);
      skipped++;
      continue;
    } catch {}
    try {
      const j = await api(`https://api.vhx.tv/videos/${t.vhx_id}`);
      await writeFile(path, JSON.stringify(j));
      ok++;
      if (ok % 50 === 0) console.log(`[full] ${ok}/${targets.length - skipped}`);
    } catch (e) {
      failed++;
      console.warn(`! ${t.vhx_id}: ${e.message}`);
    }
  }
}
// split into N workers
const buckets = Array.from({ length: concurrency }, () => []);
targets.forEach((t, i) => buckets[i % concurrency].push(t));
await Promise.all(buckets.map(worker));
console.log(`[full] done — ok=${ok} skipped=${skipped} failed=${failed}`);
