import { Hono } from "hono";
import { sql as drizzleSql } from "drizzle-orm";
import { Layout } from "../views/components/Layout.js";
import { EpisodeCard } from "../views/components/EpisodeCard.js";
import { sql } from "../db/client.js";
import { fetchLastImport, fetchRowCounts } from "../db/queries.js";
import { copy } from "../copy.js";

export const collectionsRoute = new Hono();

const PAGE_SIZE = 36;

// Skip Vimeo OTT's user-state pseudo-collections in the index view.
const SKIP_SLUGS = new Set(["continue-watching", "my-list", "carousel"]);

collectionsRoute.get("/collections", async (c) => {
  const [cols, lastImport, counts] = await Promise.all([
    sql<Array<{ slug: string; name: string; items_count: number; thumbnail_url: string | null; sort_order: number }>>`
      SELECT slug, name, items_count, thumbnail_url, sort_order
      FROM mst_collections
      ORDER BY sort_order
    `,
    fetchLastImport(),
    fetchRowCounts(),
  ]);
  const visible = cols.filter((c) => !SKIP_SLUGS.has(c.slug));
  return c.html(
    <Layout
      title="Collections — Martha Stewart Living: An Archive"
      description="Themed playlists drawn from marthastewart.tv — the same groupings you'll find in the Martha app."
      footerMeta={{ lastImport: lastImport?.finishedAt?.toISOString(), episodeCount: counts.episodes ?? 0 }}
    >
      <div class="page page--wide" style="padding-top:var(--space-4);">
        <header class="hero">
          <p class="smallcap-eyebrow" style="margin-bottom:var(--space-2);">Collections</p>
          <h1 class="display">Browse as Martha does.</h1>
          <p class="lede">
            The themed playlists from marthastewart.tv, kept in step with the Martha app so the two move together.
          </p>
        </header>

        <section class="page" style="padding:0;">
          <div class="archive-grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--space-4) var(--space-3);">
            {visible.map((col) => (
              <a class="taxonomy-tile" href={`/collections/${col.slug}`} style="text-decoration:none;">
                {col.thumbnail_url ? (
                  <div class="taxonomy-tile__photo" style="aspect-ratio:4/3;padding:0;background:var(--bedford-gray);overflow:hidden;">
                    <img
                      src={col.thumbnail_url}
                      alt={col.name}
                      loading="lazy"
                      decoding="async"
                      style="width:100%;height:100%;object-fit:cover;"
                    />
                  </div>
                ) : (
                  <div class="taxonomy-tile__photo taxonomy-tile__photo--eggshell" style="aspect-ratio:4/3;" aria-hidden="true" />
                )}
                <span class="taxonomy-tile__label">{col.name}</span>
                <span class="taxonomy-tile__meta">{col.items_count.toLocaleString()} videos</span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </Layout>,
  );
});

collectionsRoute.get("/collections/:slug", async (c) => {
  const slug = c.req.param("slug");
  const pageStr = c.req.query("page");
  const page = Math.max(1, Number.parseInt(pageStr ?? "1", 10) || 1);

  const colRows = await sql<Array<{ slug: string; name: string; items_count: number }>>`
    SELECT slug, name, items_count FROM mst_collections WHERE slug = ${slug} LIMIT 1
  `;
  if (!colRows.length) return c.notFound();
  const col = colRows[0]!;

  const offset = (page - 1) * PAGE_SIZE;
  const items = await sql<Array<{
    vhx_id: number;
    episode_id: string | null;
    title: string | null;
    description: string | null;
    photo_url: string | null;
    canonical_url: string | null;
    season_number: number | null;
    episode_number_vhx: number | null;
    duration_seconds: number | null;
    ep_title: string | null;
    ep_air_year: number | null;
    ep_air_precision: string | null;
    ep_air_date: string | null;
    ep_show_name: string | null;
  }>>`
    SELECT i.vhx_id, i.episode_id, i.title, i.description, i.photo_url, i.canonical_url,
           i.season_number, i.episode_number_vhx, i.duration_seconds,
           e.title AS ep_title, e.air_year AS ep_air_year, e.air_precision AS ep_air_precision,
           e.air_date::text AS ep_air_date, e.show_name AS ep_show_name
    FROM mst_collection_items i
    LEFT JOIN episodes e ON e.id = i.episode_id
    WHERE i.collection_slug = ${slug}
    ORDER BY i.position
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `;

  const totalRows = await sql<Array<{ c: number }>>`SELECT count(*)::int AS c FROM mst_collection_items WHERE collection_slug = ${slug}`;
  const total = totalRows[0]?.c ?? col.items_count;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const [lastImport, counts] = await Promise.all([fetchLastImport(), fetchRowCounts()]);

  return c.html(
    <Layout
      title={`${col.name} — Collections`}
      description={`${col.name}: ${total} videos from marthastewart.tv.`}
      footerMeta={{ lastImport: lastImport?.finishedAt?.toISOString(), episodeCount: counts.episodes ?? 0 }}
    >
      <div class="page page--wide" style="padding-top:var(--space-4);">
        <p class="caption" style="margin-bottom:var(--space-2);">
          <a href="/collections" style="text-decoration:none;">← Collections</a>
        </p>
        <header class="hero">
          <p class="smallcap-eyebrow">From marthastewart.tv</p>
          <h1 class="display">{col.name}</h1>
          <p class="lede">{total.toLocaleString()} videos</p>
        </header>

        <div class="archive-grid">
          {items.map((it) => {
            const fallbackTitle = it.title ?? it.ep_title ?? "Untitled";
            const dur = it.duration_seconds
              ? `${Math.floor(it.duration_seconds / 60)}:${String(it.duration_seconds % 60).padStart(2, "0")}`
              : null;
            // If we matched it to a DB episode, link there. Otherwise link to marthastewart.tv.
            const href = it.episode_id ? `/episodes/${it.episode_id}` : it.canonical_url ?? "#";
            const ext = !it.episode_id;
            return (
              <article class="episode-card">
                <a href={href} {...(ext ? { rel: "noreferrer", target: "_blank" } : {})}>
                  {it.photo_url ? (
                    <div class="episode-card__photo episode-card__photo--image">
                      <img src={it.photo_url} alt={fallbackTitle} loading="lazy" decoding="async" />
                    </div>
                  ) : (
                    <div class="episode-card__photo" aria-hidden="true">
                      <span class="episode-card__photo-caption">{copy.photographWanted}</span>
                    </div>
                  )}
                  {it.season_number !== null && (
                    <p class="episode-card__eyebrow">
                      MSL Season {it.season_number}
                      {dur ? ` · ${dur}` : ""}
                    </p>
                  )}
                  <h3 class="episode-card__title">{it.ep_title ?? fallbackTitle}</h3>
                  {it.description && (
                    <p class="caption" style="margin:0;">
                      {firstSegment(it.description)}
                    </p>
                  )}
                  <hr class="episode-card__rule" />
                </a>
              </article>
            );
          })}
        </div>

        {lastPage > 1 && (
          <nav class="pagination" aria-label="Pagination">
            {page > 1 ? <a href={`/collections/${slug}?page=${page - 1}`}>‹</a> : <span class="disabled">‹</span>}
            <span class="current">{page}</span>
            <span class="sep">·</span>
            <span>{lastPage}</span>
            {page < lastPage ? <a href={`/collections/${slug}?page=${page + 1}`}>›</a> : <span class="disabled">›</span>}
          </nav>
        )}
      </div>
    </Layout>,
  );
});

function firstSegment(desc: string): string {
  const lines = desc.split(/\r?\n/).map((l) => l.replace(/^[-•*●·]+\s*/, "").trim()).filter(Boolean);
  return lines[0] ?? "";
}
