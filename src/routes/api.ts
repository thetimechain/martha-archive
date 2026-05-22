import { Hono } from "hono";
import { createHash } from "node:crypto";
import { createGzip } from "node:zlib";
import { Readable } from "node:stream";
import { fetchEpisodePage, fetchLastImport, fetchRowCounts } from "../db/queries.js";
import { parseEpisodeQuery, calcLastPage } from "../lib/query.js";
import { apiCache, canonicalizeQuery } from "../lib/cache.js";
import { apiRateLimit } from "../middleware/rate-limit.js";
import { sql } from "../db/client.js";

export const apiRoute = new Hono();

apiRoute.use("/api/*", apiRateLimit);

apiRoute.get("/api/episodes", async (c) => {
  const raw = c.req.queries() as Record<string, string[] | undefined>;
  const flat: Record<string, string | string[] | undefined> = {};
  for (const k of Object.keys(raw)) {
    const v = raw[k];
    flat[k] = v && v.length === 1 ? v[0] : v;
  }
  const params = parseEpisodeQuery(flat);

  const canonical = canonicalizeQuery(flat as any);
  const cacheKey = `api:episodes:${canonical}`;
  const cached = apiCache.get(cacheKey) as { body: unknown; etag: string } | undefined;
  let payload: any;
  if (cached) {
    if (c.req.header("If-None-Match") === cached.etag) {
      c.header("ETag", cached.etag);
      return c.body(null, 304);
    }
    payload = cached.body;
  } else {
    const result = await fetchEpisodePage(params);
    const lastImport = await fetchLastImport();
    payload = {
      episodes: result.episodes.map((e: any) => ({
        id: e.id,
        title: e.title,
        show_slug: e.show_slug ?? e.showSlug,
        show_name: e.show_name ?? e.showName,
        season: e.season,
        episode_number: e.episode_number ?? e.episodeNumber,
        air_date: e.air_date ?? e.airDate,
        air_year: e.air_year ?? e.airYear,
        air_precision: e.air_precision ?? e.airPrecision,
        description: e.description,
        confidence: e.confidence,
        single_source: e.single_source ?? e.singleSource,
      })),
      total: result.total,
      page: params.page,
      page_size: params.pageSize,
      last_page: calcLastPage(result.total, params.pageSize),
      facets: result.facets,
      import_run_id: lastImport?.id ?? null,
    };
    const etag = `W/"${createHash("sha1").update(`${lastImport?.id ?? 0}:${canonical}`).digest("hex")}"`;
    apiCache.set(cacheKey, { body: payload, etag });
    c.header("ETag", etag);
  }

  c.header("Cache-Control", "public, max-age=60");
  c.header("Content-Type", "application/json; charset=utf-8");
  return c.json(payload);
});

apiRoute.get("/health", (c) => c.json({ ok: true, ts: Date.now() }));

apiRoute.get("/health/db", async (c) => {
  try {
    const counts = await fetchRowCounts();
    const lastImport = await fetchLastImport();
    return c.json({
      status: "ok",
      db: "ok",
      last_import_at: lastImport?.finishedAt?.toISOString() ?? null,
      row_counts: counts,
      import_run_id: lastImport?.id ?? null,
    });
  } catch (e) {
    return c.json({ status: "degraded", db: "unreachable", error: (e as Error).message }, 503);
  }
});

apiRoute.get("/api/health", async (c) => {
  try {
    const counts = await fetchRowCounts();
    const lastImport = await fetchLastImport();
    return c.json({
      status: "ok",
      db: "ok",
      last_import_at: lastImport?.finishedAt?.toISOString() ?? null,
      row_counts: counts,
      import_run_id: lastImport?.id ?? null,
    });
  } catch (e) {
    return c.json({ status: "degraded", db: "unreachable", error: (e as Error).message }, 503);
  }
});

// ---------------------------------------------------------------------------
// GET /api/episodes/compact
// Returns all episodes as a compact JSON array for client-side search.
// In-memory cache (10 min). Gzip when client sends Accept-Encoding: gzip.
// ---------------------------------------------------------------------------

const COMPACT_TTL_MS = 10 * 60 * 1000; // 10 minutes

type CompactCache = { ts: number; raw: ArrayBuffer; gzipped: ArrayBuffer };
let compactCache: CompactCache | null = null;

async function gzipToArrayBuffer(buf: Buffer): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const gz = createGzip();
    const chunks: Buffer[] = [];
    gz.on("data", (chunk: Buffer) => chunks.push(chunk));
    gz.on("end", () => {
      const combined = Buffer.concat(chunks);
      // Copy into a plain ArrayBuffer so the generic is ArrayBuffer, not ArrayBufferLike
      const ab = combined.buffer.slice(combined.byteOffset, combined.byteOffset + combined.byteLength);
      resolve(ab);
    });
    gz.on("error", reject);
    Readable.from(buf).pipe(gz);
  });
}

async function getCompactPayload(): Promise<CompactCache> {
  const now = Date.now();
  if (compactCache && now - compactCache.ts < COMPACT_TTL_MS) {
    return compactCache;
  }

  const rows = await sql`
    SELECT e.id, e.show_slug, e.show_name, e.season, e.episode_number,
           e.title, e.air_date::text AS air_date, e.air_year, e.runtime_minutes,
           e.description, e.photo_url, e.confidence, e.provenance,
           e.mst_canonical_url, e.streaming,
           COALESCE((SELECT json_agg(tag ORDER BY tag) FROM episode_tags WHERE episode_id = e.id), '[]') AS tags,
           COALESCE((SELECT json_agg(topic ORDER BY topic) FROM episode_topics WHERE episode_id = e.id), '[]') AS topics,
           COALESCE((SELECT json_agg(theme ORDER BY theme) FROM episode_themes WHERE episode_id = e.id), '[]') AS themes,
           COALESCE((SELECT json_agg(name ORDER BY position) FROM episode_guests WHERE episode_id = e.id), '[]') AS guests,
           COALESCE((SELECT json_agg(name ORDER BY position) FROM episode_recipes WHERE episode_id = e.id), '[]') AS recipes
    FROM episodes e
    ORDER BY e.show_slug, e.season, e.episode_number
  `;

  const rawBuf = Buffer.from(JSON.stringify(rows), "utf8");
  const raw: ArrayBuffer = rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength);
  const gzipped = await gzipToArrayBuffer(rawBuf);

  compactCache = { ts: now, raw, gzipped };
  return compactCache;
}

apiRoute.get("/api/episodes/compact", async (c) => {
  const payload = await getCompactPayload();

  c.header("Content-Type", "application/json; charset=utf-8");
  c.header("Cache-Control", "public, max-age=600");

  const acceptEncoding = c.req.header("Accept-Encoding") ?? "";
  if (acceptEncoding.includes("gzip")) {
    c.header("Content-Encoding", "gzip");
    c.header("Vary", "Accept-Encoding");
    return c.body(payload.gzipped);
  }

  return c.body(payload.raw);
});
