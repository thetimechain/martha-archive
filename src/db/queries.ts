import { sql as drizzleSql, eq, asc, desc } from "drizzle-orm";
import { db, sql as pg } from "./client.js";
import {
  episodes,
  shows,
  episodeGuests,
  episodeRecipes,
  episodeTopics,
  episodeThemes,
  episodeTags,
  mslSegments,
  importRuns,
} from "./schema.js";
import type { EpisodeQuery } from "../lib/query.js";

export type FacetEntry = { value: string; label: string; count: number };
export type Facets = {
  shows: FacetEntry[];
  seasons: FacetEntry[];
  years: FacetEntry[];
  topics: FacetEntry[];
  themes: FacetEntry[];
  tags: FacetEntry[];
  confidences: FacetEntry[];
};

export type EpisodeRow = {
  id: string;
  show_slug: string;
  show_id: number | null;
  show_name: string | null;
  season: number | null;
  episode_number: number | null;
  title: string;
  air_date_raw: string | null;
  air_date: string | null;
  air_year: number | null;
  air_month: number | null;
  air_precision: string | null;
  runtime_minutes: number | null;
  network: string | null;
  streaming: string[] | null;
  description: string | null;
  confidence: string;
  single_source: boolean;
  sources: string[] | null;
  photo_url: string | null;
  photo_url_source: string | null;
  mst_vhx_id: number | null;
  mst_canonical_slug: string | null;
  mst_canonical_url: string | null;
  mst_match_score: string | null;
};

export type EpisodePageResult = {
  episodes: EpisodeRow[];
  total: number;
  facets: Facets;
};

// Build a postgres-js WHERE clause fragment by composing pg`...` fragments.
function whereFor(p: EpisodeQuery, omit?: keyof EpisodeQuery) {
  const parts: any[] = [];
  if (p.show.length && omit !== "show") parts.push(pg`e.show_slug IN ${pg(p.show)}`);
  if (p.season !== undefined && omit !== "season") parts.push(pg`e.season = ${p.season}`);
  if (p.year !== undefined && omit !== "year") parts.push(pg`e.air_year = ${p.year}`);
  if (p.confidence && omit !== "confidence") parts.push(pg`e.confidence = ${p.confidence}::confidence`);
  if (p.q && omit !== "q") {
    const t = `%${p.q.replace(/[%_]/g, "\\$&")}%`;
    parts.push(pg`(e.title ILIKE ${t} OR e.description ILIKE ${t})`);
  }
  if (p.guest && omit !== "guest") {
    const t = `%${p.guest}%`;
    parts.push(pg`EXISTS (SELECT 1 FROM episode_guests g WHERE g.episode_id = e.id AND g.name ILIKE ${t})`);
  }
  if (p.topic.length && omit !== "topic") {
    parts.push(pg`(SELECT count(DISTINCT topic) FROM episode_topics et WHERE et.episode_id = e.id AND et.topic IN ${pg(p.topic)}) = ${p.topic.length}`);
  }
  if (p.theme.length && omit !== "theme") {
    parts.push(pg`(SELECT count(DISTINCT theme) FROM episode_themes et WHERE et.episode_id = e.id AND et.theme IN ${pg(p.theme)}) = ${p.theme.length}`);
  }
  if (p.tag.length && omit !== "tag") {
    parts.push(pg`(SELECT count(DISTINCT tag) FROM episode_tags et WHERE et.episode_id = e.id AND et.tag IN ${pg(p.tag)}) = ${p.tag.length}`);
  }
  if (!parts.length) return pg`WHERE TRUE`;
  let out = pg`WHERE ${parts[0]}`;
  for (let i = 1; i < parts.length; i++) out = pg`${out} AND ${parts[i]}`;
  return out;
}

function orderClause(p: EpisodeQuery) {
  switch (p.sort) {
    case "date-asc":
      return pg`ORDER BY e.air_date ASC NULLS LAST, e.show_slug, e.season, e.episode_number`;
    case "show":
      return pg`ORDER BY e.show_slug, e.season NULLS LAST, e.episode_number NULLS LAST, e.air_date`;
    case "title":
      return pg`ORDER BY e.title`;
    case "date-desc":
    default:
      return pg`ORDER BY e.air_date DESC NULLS LAST, e.show_slug, e.season DESC NULLS LAST, e.episode_number DESC NULLS LAST`;
  }
}

export async function fetchEpisodePage(p: EpisodeQuery): Promise<EpisodePageResult> {
  const where = whereFor(p);
  const order = orderClause(p);

  const totalRows = await pg<Array<{ c: number }>>`SELECT count(*)::int AS c FROM episodes e ${where}`;
  const total = totalRows[0]?.c ?? 0;

  const offset = (p.page - 1) * p.pageSize;
  const items = await pg<EpisodeRow[]>`
    SELECT e.*
    FROM episodes e
    ${where}
    ${order}
    LIMIT ${p.pageSize} OFFSET ${offset}
  `;

  const facets = await fetchFacets(p);
  return { episodes: items, total, facets };
}

export async function fetchFacets(p: EpisodeQuery): Promise<Facets> {
  const showsW = whereFor(p, "show");
  const yearW = whereFor(p, "year");
  const topicW = whereFor(p, "topic");
  const themeW = whereFor(p, "theme");
  const tagW = whereFor(p, "tag");
  const confW = whereFor(p, "confidence");

  const [showsFacet, yearsFacet, topicsFacet, themesFacet, tagsFacet, confidenceFacet] = await Promise.all([
    pg<Array<{ slug: string; name: string; c: number }>>`
      SELECT s.slug, s.name, count(*)::int as c
      FROM episodes e LEFT JOIN shows s ON s.slug = e.show_slug
      ${showsW}
      GROUP BY s.slug, s.name
      ORDER BY c DESC
    `,
    pg<Array<{ y: number; c: number }>>`
      SELECT e.air_year AS y, count(*)::int as c
      FROM episodes e
      ${yearW}
      AND e.air_year IS NOT NULL
      GROUP BY e.air_year ORDER BY e.air_year DESC
    `,
    pg<Array<{ topic: string; c: number }>>`
      SELECT et.topic, count(DISTINCT e.id)::int as c
      FROM episodes e JOIN episode_topics et ON et.episode_id = e.id
      ${topicW}
      GROUP BY et.topic ORDER BY c DESC LIMIT 60
    `,
    pg<Array<{ theme: string; c: number }>>`
      SELECT et.theme, count(DISTINCT e.id)::int as c
      FROM episodes e JOIN episode_themes et ON et.episode_id = e.id
      ${themeW}
      GROUP BY et.theme ORDER BY c DESC LIMIT 60
    `,
    pg<Array<{ tag: string; c: number }>>`
      SELECT et.tag, count(DISTINCT e.id)::int as c
      FROM episodes e JOIN episode_tags et ON et.episode_id = e.id
      ${tagW}
      GROUP BY et.tag ORDER BY c DESC LIMIT 60
    `,
    pg<Array<{ confidence: string; c: number }>>`
      SELECT e.confidence::text AS confidence, count(*)::int as c
      FROM episodes e
      ${confW}
      GROUP BY e.confidence ORDER BY c DESC
    `,
  ]);

  let seasonsFacet: Array<{ season: number; c: number }> = [];
  if (p.show.length === 1) {
    const seasonW = whereFor(p, "season");
    seasonsFacet = await pg<Array<{ season: number; c: number }>>`
      SELECT e.season, count(*)::int as c
      FROM episodes e
      ${seasonW}
      AND e.season IS NOT NULL
      GROUP BY e.season ORDER BY e.season
    `;
  }

  return {
    shows: showsFacet.map((r) => ({ value: r.slug ?? "", label: r.name ?? r.slug ?? "Unknown", count: Number(r.c) })),
    seasons: seasonsFacet.map((r) => ({ value: String(r.season), label: `Season ${r.season}`, count: Number(r.c) })),
    years: yearsFacet.map((r) => ({ value: String(r.y), label: String(r.y), count: Number(r.c) })),
    topics: topicsFacet.map((r) => ({ value: r.topic, label: r.topic, count: Number(r.c) })),
    themes: themesFacet.map((r) => ({ value: r.theme, label: r.theme, count: Number(r.c) })),
    tags: tagsFacet.map((r) => ({ value: r.tag, label: r.tag, count: Number(r.c) })),
    confidences: confidenceFacet.map((r) => ({ value: r.confidence, label: r.confidence, count: Number(r.c) })),
  };
}

export async function fetchEpisodeById(id: string): Promise<EpisodeRow | null> {
  const rows = await pg<EpisodeRow[]>`SELECT * FROM episodes WHERE id = ${id} LIMIT 1`;
  return rows[0] ?? null;
}

export async function fetchEpisodeDetail(id: string) {
  const ep = await fetchEpisodeById(id);
  if (!ep) return null;
  const showRows = ep.show_slug
    ? await pg<Array<typeof shows.$inferSelect>>`SELECT * FROM shows WHERE slug = ${ep.show_slug} LIMIT 1`
    : [];
  const show = showRows[0] ?? null;
  const [guests, recipes, topics, themes, tags, segments] = await Promise.all([
    db.select().from(episodeGuests).where(eq(episodeGuests.episodeId, id)).orderBy(asc(episodeGuests.position)),
    db.select().from(episodeRecipes).where(eq(episodeRecipes.episodeId, id)).orderBy(asc(episodeRecipes.position)),
    db.select().from(episodeTopics).where(eq(episodeTopics.episodeId, id)),
    db.select().from(episodeThemes).where(eq(episodeThemes.episodeId, id)),
    db.select().from(episodeTags).where(eq(episodeTags.episodeId, id)),
    db.select().from(mslSegments).where(eq(mslSegments.episodeId, id)).orderBy(asc(mslSegments.position)),
  ]);

  let prev: EpisodeRow | null = null;
  let next: EpisodeRow | null = null;
  if (ep.show_slug && ep.season !== null && ep.episode_number !== null) {
    const prevRows = await pg<EpisodeRow[]>`
      SELECT * FROM episodes
      WHERE show_slug = ${ep.show_slug} AND season = ${ep.season} AND episode_number < ${ep.episode_number}
      ORDER BY episode_number DESC LIMIT 1
    `;
    prev = prevRows[0] ?? null;
    const nextRows = await pg<EpisodeRow[]>`
      SELECT * FROM episodes
      WHERE show_slug = ${ep.show_slug} AND season = ${ep.season} AND episode_number > ${ep.episode_number}
      ORDER BY episode_number ASC LIMIT 1
    `;
    next = nextRows[0] ?? null;
  }

  return {
    ep: {
      ...ep,
      showSlug: ep.show_slug,
      showId: ep.show_id,
      showName: ep.show_name,
      season: ep.season,
      episodeNumber: ep.episode_number,
      airDate: ep.air_date,
      airYear: ep.air_year,
      airMonth: ep.air_month,
      airPrecision: ep.air_precision,
      runtimeMinutes: ep.runtime_minutes,
      singleSource: ep.single_source,
    } as any,
    show,
    guests,
    recipes,
    topics,
    themes,
    tags,
    segments,
    prev,
    next,
  };
}

export async function fetchShows() {
  return db.select().from(shows).orderBy(asc(shows.sortOrder), asc(shows.name));
}
export async function fetchShowBySlug(slug: string) {
  const rows = await db.select().from(shows).where(eq(shows.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function fetchShowSeasons(slug: string) {
  return pg<Array<{ season: number; ep_count: number; season_start: string | null; documented: number }>>`
    SELECT season, MIN(air_date)::text AS season_start, COUNT(*)::int AS ep_count,
           SUM(CASE WHEN confidence = 'confirmed' THEN 1 ELSE 0 END)::int AS documented
    FROM episodes WHERE show_slug = ${slug} AND season IS NOT NULL
    GROUP BY season ORDER BY season
  `;
}

export async function fetchTopTags(limit = 30) {
  const rows = await pg<Array<{ tag: string; c: number }>>`
    SELECT tag, count(*)::int as c FROM episode_tags
    GROUP BY tag ORDER BY c DESC LIMIT ${limit}
  `;
  return rows.map((r) => ({ tag: r.tag, count: Number(r.c) }));
}

export async function fetchCalendarYear(year: number) {
  return pg<Array<{
    air_date: string;
    episode_id: string | null;
    title: string | null;
    ep_title: string | null;
  }>>`
    SELECT to_char(mce.air_date, 'YYYY-MM-DD') as air_date, mce.episode_id, mce.title, e.title as ep_title
    FROM mss_calendar_entries mce
    LEFT JOIN episodes e ON e.id = mce.episode_id
    WHERE EXTRACT(YEAR FROM mce.air_date) = ${year}
    ORDER BY mce.air_date
  `;
}

export async function fetchCalendarYearsAvailable(): Promise<number[]> {
  const rows = await pg<Array<{ y: number }>>`
    SELECT DISTINCT EXTRACT(YEAR FROM air_date)::int AS y
    FROM mss_calendar_entries ORDER BY y
  `;
  return rows.map((r) => Number(r.y));
}

export async function fetchLastImport() {
  const rows = await db.select().from(importRuns).orderBy(desc(importRuns.id)).limit(1);
  return rows[0] ?? null;
}

export async function fetchRowCounts(): Promise<Record<string, number>> {
  const r = await pg<Array<{ t: string; c: number }>>`
    SELECT 'shows' as t, count(*)::int as c FROM shows UNION ALL
    SELECT 'episodes', count(*)::int FROM episodes UNION ALL
    SELECT 'episode_guests', count(*)::int FROM episode_guests UNION ALL
    SELECT 'episode_recipes', count(*)::int FROM episode_recipes UNION ALL
    SELECT 'episode_topics', count(*)::int FROM episode_topics UNION ALL
    SELECT 'episode_themes', count(*)::int FROM episode_themes UNION ALL
    SELECT 'episode_tags', count(*)::int FROM episode_tags UNION ALL
    SELECT 'msl_segments', count(*)::int FROM msl_segments UNION ALL
    SELECT 'mss_calendar_entries', count(*)::int FROM mss_calendar_entries UNION ALL
    SELECT 'palette_colors', count(*)::int FROM palette_colors
  `;
  const out: Record<string, number> = {};
  for (const row of r) out[row.t] = Number(row.c);
  return out;
}

export async function fetchTopGuests(limit = 30) {
  const rows = await pg<Array<{ name: string; c: number }>>`
    SELECT name, count(*)::int as c FROM episode_guests
    GROUP BY name ORDER BY c DESC LIMIT ${limit}
  `;
  return rows.map((r) => ({ name: r.name, count: Number(r.c) }));
}

export async function fetchNotableEpisodes(showSlug: string, limit = 6): Promise<EpisodeRow[]> {
  return pg<EpisodeRow[]>`
    SELECT e.* FROM episodes e
    LEFT JOIN (SELECT episode_id, count(*) as c FROM episode_tags GROUP BY episode_id) t ON t.episode_id = e.id
    WHERE e.show_slug = ${showSlug}
    ORDER BY COALESCE(t.c, 0) DESC, e.air_date DESC
    LIMIT ${limit}
  `;
}
