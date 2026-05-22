// Fetch the raw JSON for non-video items (playlist/other) too — for archival completeness.
// These are collection-cover entries surfaced in the carousel etc.
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import "dotenv/config";

const EMAIL = process.env.MARTHA_TV_USERNAME;
const PASS = process.env.MARTHA_TV_PASSWORD;
const OUT_DIR = "data/marthastewart-tv";
const RAW_DIR = join(OUT_DIR, "raw");
const PLAYLIST_DIR = join(OUT_DIR, "raw-playlists");
await mkdir(PLAYLIST_DIR, { recursive: true });

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const cookies = new Map();
function setCookies(h) {
  for (const line of h.getSetCookie?.() ?? []) {
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
let jwt = null, exp = 0;
async function getJwt() {
  if (jwt && Date.now() / 1000 < exp - 30) return jwt;
  const r = await browser("https://www.marthastewart.tv/browse");
  const t = await r.text();
  jwt = t.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)[0];
  exp = JSON.parse(Buffer.from(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()).exp;
  return jwt;
}
async function apiTry(url, kind) {
  // Try /collections/<id> first; fall back to /videos/<id>; etc.
  for (let i = 0; i < 3; i++) {
    const tok = await getJwt();
    const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}`, "User-Agent": UA } });
    if (r.status === 401) { jwt = null; continue; }
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
    return r.json();
  }
  return null;
}

await login();
const items = JSON.parse(await readFile(join(OUT_DIR, "items.json"), "utf8"));
const targets = items.filter((it) => it.vhx_id && it.media_type !== "video" && it.media_type !== "episode");
const seen = new Set();
const uniq = targets.filter((it) => { if (seen.has(it.vhx_id)) return false; seen.add(it.vhx_id); return true; });
console.log(`[playlists] ${uniq.length} unique non-video items to fetch`);

let ok = 0, skipped = 0, failed = 0;
for (const t of uniq) {
  const p = join(PLAYLIST_DIR, `${t.vhx_id}.json`);
  try {
    await access(p);
    skipped++;
    continue;
  } catch {}
  // try /collections/<id> first (playlists are usually collections)
  let j = await apiTry(`https://api.vhx.tv/collections/${t.vhx_id}`).catch(() => null);
  if (!j) j = await apiTry(`https://api.vhx.tv/videos/${t.vhx_id}`).catch(() => null);
  if (!j) j = await apiTry(`https://api.vhx.tv/movies/${t.vhx_id}`).catch(() => null);
  if (!j) { failed++; console.warn(`! ${t.vhx_id} ${t.title} — no endpoint`); continue; }
  await writeFile(p, JSON.stringify(j));
  ok++;
  if (ok % 5 === 0) console.log(`[playlists] ${ok}/${uniq.length}`);
}
console.log(`[playlists] done — ok=${ok} skipped=${skipped} failed=${failed}`);
