import { Hono } from "hono";
import { createHash } from "node:crypto";
import { fetchEpisodePage, fetchLastImport, fetchRowCounts } from "../db/queries.js";
import { parseEpisodeQuery, calcLastPage } from "../lib/query.js";
import { apiCache, canonicalizeQuery } from "../lib/cache.js";
import { apiRateLimit } from "../middleware/rate-limit.js";

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
