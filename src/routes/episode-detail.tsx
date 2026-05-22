import { Hono } from "hono";
import { Layout } from "../views/components/Layout.js";
import { fetchEpisodeDetail, fetchLastImport, fetchRowCounts } from "../db/queries.js";
import { formatDate } from "../views/components/EpisodeCard.js";
import { copy } from "../copy.js";
import { canonical, siteHost, tvEpisodeJsonLd, breadcrumbsJsonLd } from "../lib/seo.js";

export const episodeDetailRoute = new Hono();

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const lastSp = cut.lastIndexOf(" ");
  return (lastSp > 40 ? cut.slice(0, lastSp) : cut).trimEnd() + "…";
}

episodeDetailRoute.get("/episodes/:id", async (c) => {
  const id = c.req.param("id");
  const detail = await fetchEpisodeDetail(id);
  if (!detail) return c.notFound();
  const { ep, show, guests, recipes, topics, themes, tags, segments, prev, next } = detail;
  const [lastImport, counts] = await Promise.all([fetchLastImport(), fetchRowCounts()]);
  const date = formatDate(ep.airDate as any, ep.airYear, ep.airPrecision);
  const ogTitle = `${show?.name ?? "Episode"}${ep.season !== null && ep.episodeNumber !== null ? `, S${ep.season}E${ep.episodeNumber}` : ""} — "${ep.title}"`;
  const url = canonical(`/episodes/${ep.id}`);
  const epLd = tvEpisodeJsonLd({
    id: ep.id,
    title: ep.title,
    description: truncate(ep.description, 500),
    air_date: (ep as any).airDate as any,
    air_year: ep.airYear ?? null,
    season: ep.season ?? null,
    episode_number: ep.episodeNumber ?? null,
    runtime_minutes: ep.runtimeMinutes ?? null,
    photo_url: (ep as any).photo_url ?? null,
    show_name: show?.name ?? null,
    show_slug: show?.slug ?? null,
    guests: guests.map((g: any) => g.name).slice(0, 20),
  });
  const crumbs = breadcrumbsJsonLd([
    { name: "Archive", url: siteHost() },
    ...(show ? [{ name: show.name, url: canonical(`/shows/${show.slug}`) }] : []),
    { name: ep.title, url },
  ]);

  return c.html(
    <Layout
      title={ogTitle}
      description={truncate(ep.description, 200)}
      canonical={url}
      og={{
        title: ogTitle,
        description: truncate(ep.description, 200),
        url,
        type: "video.episode",
        image: (ep as any).photo_url ?? undefined,
      }}
      jsonLd={[epLd, crumbs]}
      footerMeta={{ lastImport: lastImport?.finishedAt?.toISOString(), episodeCount: counts.episodes ?? 0 }}
    >
      <article class="episode-detail page page--prose">
        {(ep as any).photo_url && (
          <figure class="episode-detail__hero" style="margin:0 0 var(--space-3);">
            <img
              src={(ep as any).photo_url}
              alt={ep.title}
              loading="eager"
              decoding="async"
              style="width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;background:var(--bedford-gray);"
            />
            {((ep as any).mst_match_score ?? "").includes("title_cross_season") && (
              <figcaption class="caption" style="margin-top:var(--space-1);">
                Photograph from a related segment on marthastewart.tv (not the exact broadcast).
              </figcaption>
            )}
          </figure>
        )}
        <p class="eyebrow">
          {show ? <a href={`/shows/${show.slug}`} style="text-decoration:none;">{show.name}</a> : "Episode"}
          {ep.season !== null && ep.episodeNumber !== null && (
            <>
              {" "}· Season {ep.season}, Episode {ep.episodeNumber}
            </>
          )}
        </p>
        <h1 class="serif-title">{ep.title}</h1>
        <p class="air-date italic">{date}</p>
        {ep.description && <p class="description">{ep.description}</p>}
        {(ep as any).mst_canonical_url && (
          <p class="caption" style="margin-top:var(--space-2);">
            {((ep as any).provenance === "marthastewart-tv") ? (
              <>
                <span class="confidence-badge confidence-badge--inferred" style="margin-right:var(--space-2);">
                  via marthastewart.tv
                </span>
                <a href={(ep as any).mst_canonical_url} rel="noreferrer" target="_blank" style="text-decoration:underline;">
                  Watch on marthastewart.tv →
                </a>
              </>
            ) : (
              <>
                Watch on{" "}
                <a href={(ep as any).mst_canonical_url} rel="noreferrer" target="_blank" style="text-decoration:underline;">
                  marthastewart.tv →
                </a>
              </>
            )}
          </p>
        )}
        {ep.network && (
          <p class="caption">
            Network: {ep.network}
            {ep.streaming && ep.streaming.length > 0 && <> · Streaming: {ep.streaming.join(", ")}</>}
            {ep.runtimeMinutes ? <> · {ep.runtimeMinutes} min</> : null}
          </p>
        )}

        {recipes.length > 0 && (
          <section>
            <h2>{copy.recipes}</h2>
            <ul>
              {recipes.map((r) => (
                <li>
                  {r.name}
                  {r.note && <span class="item-note">— {r.note}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {guests.length > 0 && (
          <section>
            <h2>{copy.guests}</h2>
            <ul>
              {guests.map((g) => (
                <li>
                  <a href={`/episodes?guest=${encodeURIComponent(g.name)}`} style="text-decoration:none;">{g.name}</a>
                  {g.role && <span class="item-note">— {g.role}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {topics.length > 0 && (
          <section>
            <h2>{copy.topics}</h2>
            <ul>
              {topics.map((t) => (
                <li>
                  <a href={`/episodes?topic=${encodeURIComponent(t.topic)}`} style="text-decoration:none;">{t.topic}</a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {themes.length > 0 && (
          <section>
            <h2>{copy.themes}</h2>
            <ul>
              {themes.map((t) => (
                <li>
                  <a href={`/episodes?theme=${encodeURIComponent(t.theme)}`} style="text-decoration:none;">{t.theme}</a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tags.length > 0 && (
          <section>
            <h2>{copy.tags}</h2>
            <p>
              {tags.map((t, i) => (
                <>
                  <a href={`/episodes?tag=${encodeURIComponent(t.tag)}`} style="text-decoration:none;font-style:italic;color:var(--bedford-gray);">
                    {t.tag}
                  </a>
                  {i < tags.length - 1 ? "  ·  " : ""}
                </>
              ))}
            </p>
          </section>
        )}

        {segments.length > 0 && (
          <section>
            <h2>{copy.segments}</h2>
            <div class="segment-grid">
              {segments.map((s) => (
                <article class="segment">
                  <span class="numeral">{(s.position + 1).toString().padStart(2, "0")}</span>
                  {s.kind && <span class="kind">{s.kind}</span>}
                  <span class="title">{s.title}</span>
                  {s.description && <p class="caption">{s.description}</p>}
                </article>
              ))}
            </div>
          </section>
        )}

        {ep.sources && ep.sources.length > 0 && (
          <section>
            <h2>{copy.sources}</h2>
            <ul class="sources">
              {ep.sources.map((src: string) => (
                <li>
                  <a href={src} rel="noreferrer">{src}</a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p style="margin-top:var(--space-3);">
          <span class={`confidence-badge confidence-badge--${ep.confidence}`}>{ep.confidence}</span>
          {ep.singleSource && <span class="caption" style="margin-left:var(--space-2);">single source</span>}
        </p>

        <nav class="prev-next" aria-label="Episode navigation">
          {prev ? (
            <a href={`/episodes/${prev.id}`}>
              <span class="nav-direction">{copy.prev}</span>
              <span>{prev.title}</span>
            </a>
          ) : (
            <span class="placeholder">
              <span class="nav-direction">{copy.prev}</span>
              <span class="caption">—</span>
            </span>
          )}
          {next ? (
            <a href={`/episodes/${next.id}`} style="text-align:right;">
              <span class="nav-direction">{copy.next}</span>
              <span>{next.title}</span>
            </a>
          ) : (
            <span class="placeholder" style="text-align:right;">
              <span class="nav-direction">{copy.next}</span>
              <span class="caption">—</span>
            </span>
          )}
        </nav>
      </article>
    </Layout>,
  );
});
