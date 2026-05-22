import { Hono } from "hono";
import { Layout } from "../views/components/Layout.js";
import { EpisodeCard } from "../views/components/EpisodeCard.js";
import {
  fetchShowBySlug,
  fetchShowSeasons,
  fetchEpisodePage,
  fetchNotableEpisodes,
  fetchLastImport,
  fetchRowCounts,
} from "../db/queries.js";
import { parseEpisodeQuery } from "../lib/query.js";
import { canonical, siteHost, tvSeriesJsonLd, breadcrumbsJsonLd } from "../lib/seo.js";

export const showRoute = new Hono();

showRoute.get("/shows", async (c) => {
  return c.redirect("/", 302);
});

showRoute.get("/shows/:slug", async (c) => {
  const slug = c.req.param("slug");
  const show = await fetchShowBySlug(slug);
  if (!show) return c.notFound();
  const [seasonsRaw, notable, recent, lastImport, counts] = await Promise.all([
    fetchShowSeasons(slug),
    fetchNotableEpisodes(slug, 6),
    fetchEpisodePage(parseEpisodeQuery({ show: slug, sort: "date-desc" })),
    fetchLastImport(),
    fetchRowCounts(),
  ]);
  const seasons = (seasonsRaw as any[]).map((r) => ({
    season: Number(r.season),
    seasonStart: r.season_start,
    epCount: Number(r.ep_count),
    documented: Number(r.documented),
  }));

  const totalEps = recent.total;
  const docPct = show.totalEpisodes ? Math.round(((show.documented ?? 0) / show.totalEpisodes) * 100) : 100;

  const url = canonical(`/shows/${slug}`);
  const seriesLd = tvSeriesJsonLd({
    slug,
    name: show.name,
    description: show.description ?? undefined,
    numberOfEpisodes: show.totalEpisodes ?? totalEps,
    startYear: (show as any).startYear ?? undefined,
    endYear: (show as any).endYear ?? undefined,
  });
  const crumbs = breadcrumbsJsonLd([
    { name: "Archive", url: siteHost() },
    { name: show.name, url },
  ]);

  return c.html(
    <Layout
      title={`${show.name} — episode archive`}
      description={show.description ?? `${show.name} episode archive.`}
      canonical={url}
      og={{
        title: `${show.name} — Episode Archive`,
        description: show.description ?? `${show.name} episode archive — every episode, sorted.`,
        url,
        type: "video.tv_show",
      }}
      jsonLd={[seriesLd, crumbs]}
      footerMeta={{ lastImport: lastImport?.finishedAt?.toISOString(), episodeCount: counts.episodes ?? 0 }}
    >
      <div class="page page--wide" style="padding-top:var(--space-4);">
        <header class="show-hero">
          <p class="meta">{show.network ?? ""} {show.yearsLabel ? `· ${show.yearsLabel}` : ""}</p>
          <h1>{show.name}</h1>
          {show.gapNote && <p class="lede">{show.gapNote}</p>}
          <p class="caption" style="margin-top:var(--space-2);">
            {totalEps.toLocaleString()} episodes documented
            {show.totalEpisodes && (
              <>
                {" "}of {show.totalEpisodes.toLocaleString()} ·{" "}
                <span class="completeness-bar" aria-label={`${docPct}% complete`}>
                  <span class="fill" style={`width:${docPct}%;`}></span>
                </span>{" "}
                {docPct}%
              </>
            )}
          </p>
        </header>

        {seasons.length > 0 && (
          <section>
            <h2 class="display-smaller">Seasons</h2>
            <table class="seasons-table">
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Started</th>
                  <th>Episodes</th>
                  <th>Confirmed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((s) => (
                  <tr>
                    <td>S{s.season}</td>
                    <td>{s.seasonStart ?? "—"}</td>
                    <td>{s.epCount}</td>
                    <td>{s.documented}</td>
                    <td>
                      <a href={`/episodes?show=${slug}&season=${s.season}`}>Browse season {s.season} →</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {notable.length > 0 && (
          <section style="margin-top:var(--space-5);">
            <p class="section-eyebrow">Notable</p>
            <h2 class="display-smaller">A few to begin with</h2>
            <div class="archive-grid" style="margin-top:var(--space-3);">
              {(notable as any[]).slice(0, 3).map((e: any) => (
                <EpisodeCard
                  episode={{
                    id: e.id,
                    showName: show.name,
                    title: e.title,
                    airDate: e.air_date,
                    airYear: e.air_year,
                    airPrecision: e.air_precision,
                    photoUrl: e.photo_url ?? null,
                  }}
                />
              ))}
            </div>
          </section>
        )}

        <section style="margin-top:var(--space-5);">
          <p class="section-eyebrow">Recent</p>
          <h2 class="display-smaller">All episodes</h2>
          <div class="archive-grid" style="margin-top:var(--space-3);">
            {recent.episodes.slice(0, 12).map((e: any) => (
              <EpisodeCard
                episode={{
                  id: e.id,
                  showName: show.name,
                  title: e.title,
                  airDate: e.air_date ?? e.airDate,
                  airYear: e.air_year ?? e.airYear,
                  airPrecision: e.air_precision ?? e.airPrecision,
                  photoUrl: e.photo_url ?? e.photoUrl ?? null,
                }}
              />
            ))}
          </div>
          <p style="margin-top:var(--space-3);">
            <a href={`/episodes?show=${slug}`} class="smallcap-eyebrow" style="color:var(--body-text);">
              See all {totalEps.toLocaleString()} →
            </a>
          </p>
        </section>
      </div>
    </Layout>,
  );
});
