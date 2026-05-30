import { Hono } from "hono";
import { Layout } from "../views/components/Layout.js";
import { EpisodeCard } from "../views/components/EpisodeCard.js";
import { FeaturedTile } from "../views/components/FeaturedTile.js";
import { FilterSidebar } from "../views/components/FilterSidebar.js";
import { TagCloud } from "../views/components/TagCloud.js";
import { Pagination } from "../views/components/Pagination.js";
import { fetchEpisodePage, fetchTopTags, fetchLastImport, fetchRowCounts, fetchFeaturedTile } from "../db/queries.js";
import { parseEpisodeQuery, calcLastPage, buildHref, SORTS } from "../lib/query.js";
import { copy } from "../copy.js";

export const episodesRoute = new Hono();

episodesRoute.get("/episodes", async (c) => {
  const raw = c.req.queries() as Record<string, string[] | undefined>;
  const flat: Record<string, string | string[] | undefined> = {};
  for (const k of Object.keys(raw)) {
    const v = raw[k];
    flat[k] = v && v.length === 1 ? v[0] : v;
  }
  const params = parseEpisodeQuery(flat);
  // Featured "On this day" tile — only on the unfiltered first page, since the
  // grid is otherwise reflecting the user's current filter intent.
  const isEmpty = (v: any) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
  const isUnfilteredFirstPage =
    params.page === 1 &&
    params.sort === "date-desc" &&
    isEmpty((params as any).show) && isEmpty((params as any).season) &&
    isEmpty((params as any).year) && isEmpty((params as any).topic) &&
    isEmpty((params as any).theme) && isEmpty((params as any).tag) &&
    isEmpty((params as any).guest) && isEmpty((params as any).q) &&
    isEmpty((params as any).confidence);
  const nyParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", month: "numeric", day: "numeric",
  }).formatToParts(new Date());
  const monthPart = nyParts.find((p) => p.type === "month")?.value;
  const dayPart = nyParts.find((p) => p.type === "day")?.value;
  const fallbackDate = new Date();
  const featuredMonth = monthPart ? Number.parseInt(monthPart, 10) : fallbackDate.getMonth() + 1;
  const featuredDay = dayPart ? Number.parseInt(dayPart, 10) : fallbackDate.getDate();

  const [result, tagCloud, lastImport, counts, featured] = await Promise.all([
    fetchEpisodePage(params),
    fetchTopTags(40),
    fetchLastImport(),
    fetchRowCounts(),
    isUnfilteredFirstPage ? fetchFeaturedTile(featuredMonth, featuredDay) : Promise.resolve(null),
  ]);
  const last = calcLastPage(result.total, params.pageSize);
  if (params.page > last && last > 0) {
    return c.redirect(buildHref(params, { page: last }), 302);
  }

  // Featured tile is randomized per request — never let intermediaries cache it.
  if (featured) c.header("Cache-Control", "no-store");

  return c.html(
    <Layout
      title="Episodes — Martha Stewart Living: An Archive"
      description="The complete episode archive across all Martha Stewart programs."
      footerMeta={{ lastImport: lastImport?.finishedAt?.toISOString(), episodeCount: counts.episodes ?? 0 }}
    >
      <div class="page page--wide" style="padding-top:var(--space-4);">
        <header class="results-header">
          <p class="section-eyebrow">{copy.archive}</p>
          <h1>{copy.episodeIndex}</h1>
        </header>
        <div class="grid-2col">
          <FilterSidebar params={params} facets={result.facets} />
          <section class="main-content" data-island>
            <TagCloud tags={tagCloud} params={params} />
            <form class="sort-bar" method="get" action="/episodes">
              {Object.entries(flatOmit(flat, ["sort", "page"])).map(([k, v]) =>
                Array.isArray(v) ? v.map((vv) => <input type="hidden" name={k} value={vv} />) : <input type="hidden" name={k} value={String(v)} />,
              )}
              <label for="sort">{copy.sortBy}</label>
              <select name="sort" id="sort" onchange="this.form.submit()">
                {SORTS.map((s) => (
                  <option value={s} selected={params.sort === s}>
                    {labelForSort(s)}
                  </option>
                ))}
              </select>
              <span class="results-count">
                {result.total.toLocaleString()} episodes
              </span>
            </form>
            {result.episodes.length === 0 ? (
              <div class="empty-state">
                <h2>{copy.noEpisodes}</h2>
                <p>
                  <a href="/episodes">{copy.clearFilters}</a>
                </p>
              </div>
            ) : (
              <div class="archive-grid">
                {featured && <FeaturedTile episode={featured} />}
                {(() => {
                  const filtered = result.episodes.filter((e: any) => !featured || e.id !== featured.id);
                  const removed = result.episodes.length - filtered.length;
                  // Only trim if the featured episode was NOT in the page's results (filter removed nothing).
                  // When filter DID remove featured, the count is already correct — no trim needed.
                  const trimmed = (featured && removed === 0)
                    ? filtered.slice(0, params.pageSize - 1)
                    : filtered;
                  return trimmed.map((e: any) => (
                    <EpisodeCard
                      episode={{
                        id: e.id,
                        showName: e.show_name ?? e.showName ?? null,
                        title: e.title,
                        airDate: e.air_date ?? e.airDate ?? null,
                        airYear: e.air_year ?? e.airYear ?? null,
                        airPrecision: e.air_precision ?? e.airPrecision ?? null,
                        photoUrl: e.photo_url ?? e.photoUrl ?? null,
                      }}
                    />
                  ));
                })()}
              </div>
            )}
            <Pagination params={params} total={result.total} />
          </section>
        </div>
      </div>
      <script src="/static/episodes-island.js" defer></script>
    </Layout>,
  );
});

function flatOmit(obj: Record<string, string | string[] | undefined>, drop: string[]) {
  const out: Record<string, string | string[] | undefined> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (drop.includes(k)) continue;
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function labelForSort(s: string): string {
  switch (s) {
    case "date-desc": return "Newest first";
    case "date-asc": return "Oldest first";
    case "show": return "By show";
    case "title": return "By title";
    default: return s;
  }
}
