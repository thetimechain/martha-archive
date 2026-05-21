// Crawl marthastewart.tv (vhx.tv) collection items via the api.vhx.tv REST API.
// Pulls FULL movie metadata: title, description, season/episode, all thumbnail
// sizes, canonical video_page URL, vhx slug.

import { writeFile, readFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import "dotenv/config";

const EMAIL = process.env.MARTHA_TV_USERNAME;
const PASS = process.env.MARTHA_TV_PASSWORD;
if (!EMAIL || !PASS) throw new Error("MARTHA_TV_USERNAME/PASSWORD missing in .env");

const PRODUCT = "https://api.vhx.tv/products/35217";
const HUB_ID = 1232854;
const OUT_DIR = "data/marthastewart-tv";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

await mkdir(OUT_DIR, { recursive: true });

const cookies = new Map();
function setCookies(headers) {
  const sc = headers.getSetCookie?.() ?? [];
  for (const line of sc) {
    const [pair] = line.split(";");
    const [name, ...vals] = pair.split("=");
    cookies.set(name.trim(), vals.join("=").trim());
  }
}
function cookieHeader() {
  return Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}
async function browser(url, init = {}) {
  const headers = { "User-Agent": UA, Accept: "text/html,application/json", ...(init.headers ?? {}) };
  if (cookies.size) headers.Cookie = cookieHeader();
  const r = await fetch(url, { ...init, headers, redirect: "manual" });
  setCookies(r.headers);
  if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
    return browser(new URL(r.headers.get("location"), url).toString(), { method: "GET" });
  }
  return r;
}

async function login() {
  console.log("[login] GET /login");
  const get = await browser("https://www.marthastewart.tv/login");
  const html = await get.text();
  const block = html.split('id="login-form-password"')[1] ?? "";
  const m = block.match(/name="authenticity_token"\s+value="([^"]+)"/);
  if (!m) throw new Error("no authenticity_token");
  console.log("[login] POST /login");
  const form = new URLSearchParams();
  form.set("authenticity_token", m[1]);
  form.set("utf8", "✓");
  form.set("email", EMAIL);
  form.set("password", PASS);
  const post = await browser("https://www.marthastewart.tv/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: "https://www.marthastewart.tv/login" },
    body: form.toString(),
  });
  const body = await post.text();
  if (body.includes("incorrect email or password")) throw new Error("login failed: bad creds");
  console.log("[login] ok");
}

let jwt = null;
let jwtExp = 0;
async function getJwt() {
  if (jwt && Date.now() / 1000 < jwtExp - 30) return jwt;
  console.log("[jwt] refresh");
  const r = await browser("https://www.marthastewart.tv/browse");
  const html = await r.text();
  const m = html.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  if (!m) throw new Error("no JWT");
  jwt = m[0];
  const payload = JSON.parse(Buffer.from(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  jwtExp = payload.exp;
  return jwt;
}

async function api(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const tok = await getJwt();
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${tok}`, "User-Agent": UA, Accept: "application/json" },
    });
    if (r.status === 401) {
      jwt = null;
      continue;
    }
    if (r.status === 429) {
      const wait = 2 ** attempt * 1000;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
    return r.json();
  }
  throw new Error(`${url} → giving up`);
}

async function fetchAllPages(href) {
  const base = new URL(href);
  // include_embedded=true gives full movie objects inline
  if (!base.searchParams.has("include_embedded")) base.searchParams.set("include_embedded", "true");
  base.searchParams.set("per_page", "100");
  const out = [];
  let page = 1;
  while (true) {
    base.searchParams.set("page", String(page));
    const j = await api(base.toString());
    const items = j._embedded?.items ?? [];
    out.push(...items);
    const total = j.total ?? items.length;
    if (out.length >= total || items.length === 0) break;
    page++;
    if (page > 200) break;
  }
  return out;
}

function extractItem(it, collection_slug, collection_id, collection_name) {
  // Items can be {_embedded:{movie:{...}}} OR direct movie. Collection items
  // returned from /collections/<id>/items?include_embedded=true come as movies directly.
  const m = it._embedded?.movie ?? it._embedded?.item ?? it;
  if (!m) return null;
  const videoPage = m._links?.video_page?.href ?? null;
  const self = m._links?.self?.href ?? null;
  // canonical slug like "msl5011v-hi-res" → strip "-hi-res"
  let canonicalSlug = null;
  if (videoPage) {
    const sm = videoPage.match(/\/videos\/([a-z0-9-]+)/);
    canonicalSlug = sm ? sm[1] : null;
  }
  return {
    collection_slug,
    collection_id,
    collection_name,
    vhx_id: m.id ?? null,
    canonical_slug: canonicalSlug,
    title: m.title ?? m.name ?? null,
    description: m.description ?? null,
    short_description: m.short_description ?? null,
    season_number: m.season_number ?? m.metadata?.season_number ?? null,
    episode_number: m.episode_number ?? m.metadata?.episode_number ?? null,
    season_name: m.metadata?.season_name ?? null,
    series_name: m.metadata?.series_name ?? null,
    series_id: m.metadata?.series_id ?? null,
    duration_seconds: m.duration?.seconds ?? null,
    created_at: m.created_at ?? null,
    updated_at: m.updated_at ?? null,
    media_type: m.media_type ?? m.type ?? null,
    thumb_small: m.thumbnail?.small ?? null,
    thumb_medium: m.thumbnail?.medium ?? null,
    thumb_large: m.thumbnail?.large ?? null,
    thumb_source: m.thumbnail?.source ?? null,
    thumb_blurred: m.thumbnail?.blurred ?? null,
    video_page_url: videoPage,
    self_href: self,
  };
}

// ── main ────────────────────────────────────────────────
await login();
console.log("[crawl] enumerate hub");
const cols = await fetchAllPages(`https://api.vhx.tv/hubs/${HUB_ID}?product=${encodeURIComponent(PRODUCT)}`);
const realCols = cols.filter((c) => c._links?.items?.href?.includes("/collections/"));
console.log(`[crawl] ${cols.length} hub entries; ${realCols.length} real collections`);

const collections = realCols.map((c) => ({
  slug: c.slug,
  name: c.name,
  items_count: c.items_count,
  collection_id: c._links.items.href.match(/collections\/(\d+)/)[1],
  items_href: c._links.items.href,
  thumbnail: c.thumbnail?.source ?? null,
}));
await writeFile(join(OUT_DIR, "collections.json"), JSON.stringify(collections, null, 2));

const allRows = [];
let n = 0;
for (const col of collections) {
  process.stdout.write(`[crawl] ${col.slug} (${col.items_count})… `);
  try {
    const items = await fetchAllPages(col.items_href);
    for (const it of items) {
      const row = extractItem(it, col.slug, col.collection_id, col.name);
      if (row) allRows.push(row);
    }
    console.log(`${items.length}`);
    n++;
  } catch (e) {
    console.log(`! ${e.message}`);
  }
}
console.log(`[crawl] ${n} collections, ${allRows.length} item rows`);

await writeFile(join(OUT_DIR, "items.json"), JSON.stringify(allRows, null, 2));

// dedupe by vhx_id, preferring rows from a season-specific collection
const byId = new Map();
for (const r of allRows) {
  if (!r.vhx_id) continue;
  const cur = byId.get(r.vhx_id);
  const seasonish = r.collection_slug.startsWith("martha-stewart-living-season-");
  if (!cur || (seasonish && !cur.from_season)) {
    byId.set(r.vhx_id, { ...r, from_season: seasonish });
  }
}
const uniq = Array.from(byId.values());
console.log(`[crawl] unique vhx items: ${uniq.length}`);
await writeFile(join(OUT_DIR, "videos.json"), JSON.stringify(uniq, null, 2));

console.log("[done]");
