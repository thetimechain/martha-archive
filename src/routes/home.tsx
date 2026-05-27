import { Hono } from "hono";
import { Layout } from "../views/components/Layout.js";
import { fetchShows, fetchLastImport, fetchRowCounts, fetchNotableEpisodes, fetchOnThisDay } from "../db/queries.js";
import { sql } from "../db/client.js";
import { copy } from "../copy.js";
import { canonical, websiteJsonLd } from "../lib/seo.js";

export const homeRoute = new Hono();

type HomeEntity = { slug: string; name: string; kind: string; role: string | null; mentions: number };

const MOBILE_UA_RE = /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
// Crawlers see the desktop home so they index the server-rendered JSON-LD,
// canonical, and OG tags. /m/ is a SPA shell with no SSR'd content.
const BOT_UA_RE = /bot|spider|crawl|GPT|Claude|Perplexity|Google-Extended|CCBot|facebookexternalhit|Slackbot|Twitterbot|Discordbot|Applebot/i;

const SHOW_TONES: Record<string, string> = {
  "martha-stewart-living": "eggshell",
  "martha-stewart-show": "sage",
  "martha-bakes": "buttermilk",
  "cooking-school": "crocus",
  "martha-and-snoops": "wisteria",
  "martha-knows-best": "hydrangea",
  "martha-cooks": "stone",
  "martha-holidays": "putty",
  "from-marthas-kitchen": "sage",
  "martha-gets-down-and-dirty": "crocus",
  "apprentice-martha-stewart": "buttermilk",
  "holiday-special": "wisteria",
};

homeRoute.get("/", async (c) => {
  // Redirect mobile browsers to the search-first mobile SPA.
  // Desktop users stay at /. Append ?desktop=1 to force the desktop view.
  const ua = c.req.header("User-Agent") ?? "";
  if (c.req.query("desktop") !== "1" && MOBILE_UA_RE.test(ua) && !BOT_UA_RE.test(ua)) {
    return c.redirect("/m/", 302);
  }

  const [shows, lastImport, counts] = await Promise.all([fetchShows(), fetchLastImport(), fetchRowCounts()]);

  // pull a few notable episodes for the Good Things callouts
  const notable = await fetchNotableEpisodes("martha-stewart-living", 3);

  // Compute today's MM-DD in America/New_York for "On this day" widget.
  const nyParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", month: "numeric", day: "numeric",
  }).formatToParts(new Date());
  const todayMonth = Number.parseInt(nyParts.find((p) => p.type === "month")!.value, 10);
  const todayDay = Number.parseInt(nyParts.find((p) => p.type === "day")!.value, 10);
  const todayEps = await fetchOnThisDay(todayMonth, todayDay);
  const todayMd = `${todayMonth.toString().padStart(2, "0")}-${todayDay.toString().padStart(2, "0")}`;
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  // Surface MSL TV's recurring contributors and a few favorite field-trip destinations.
  const [topPeople, topPlaces] = await Promise.all([
    sql<HomeEntity[]>`
      SELECT slug, name, kind, role, mentions FROM mst_entities
      WHERE entity_type = 'person' AND mentions >= 1
      ORDER BY mentions DESC, name ASC LIMIT 8
    `,
    sql<HomeEntity[]>`
      SELECT slug, name, kind, role, mentions FROM mst_entities
      WHERE entity_type = 'place' AND mentions >= 1
        AND kind IN ('business','museum','farm','garden','zoo','historic-house')
      ORDER BY mentions DESC, name ASC LIMIT 10
    `,
  ]);

  // Order shows so Martha Stewart Living (the 1990s TV show) leads, with the others by sort_order.
  const orderedShows = [...shows].sort((a, b) => {
    const aLiving = a.slug === "martha-stewart-living" ? 0 : 1;
    const bLiving = b.slug === "martha-stewart-living" ? 0 : 1;
    if (aLiving !== bLiving) return aLiving - bLiving;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });

  return c.html(
    <Layout
      title="Martha Stewart Living: An Archive"
      description="A complete record of Martha Stewart television episodes, with the recipes and small good things they contained."
      canonical={canonical("/")}
      og={{
        title: "Martha Stewart Living — An Archive",
        description: "A complete record of Martha Stewart television episodes.",
        url: canonical("/"),
      }}
      jsonLd={[websiteJsonLd()]}
      footerMeta={{ lastImport: lastImport?.finishedAt?.toISOString(), episodeCount: counts.episodes ?? 0 }}
    >
      <section class="page hero">
        <p class="smallcap-eyebrow" style="margin-bottom:var(--space-2);">{copy.bestIngredients}</p>
        <h1 class="display">Martha Stewart Living: An Archive</h1>
        <p class="lede">{copy.homeOpener}</p>
        <p style="margin-top:var(--space-3);">
          <a href="/episodes" class="smallcap-eyebrow" style="color:var(--body-text);text-decoration-thickness:0.5px;">
            {copy.viewArchive} →
          </a>
        </p>
        <hr class="hairline" style="margin-top:var(--space-5);" />
      </section>

      {todayEps.length > 0 && (
        <section class="page section" aria-label="On this day">
          <p class="section-eyebrow">On this day · {MONTHS[todayMonth - 1]} {todayDay}</p>
          <h2 class="display-smaller">Years ago, on Martha.</h2>
          <div style="display:grid;gap:var(--space-3);margin-top:var(--space-4);">
            {todayEps.slice(0, 4).map((e) => (
              <a href={`/episodes/${e.id}`} style="text-decoration:none;color:inherit;display:grid;grid-template-columns:60px 1fr;gap:var(--space-4);align-items:baseline;border-bottom:var(--hairline-thin);padding-bottom:var(--space-2);">
                <span style="font-family:var(--font-display);font-size:1.6rem;line-height:1;color:var(--bedford-gray);">{e.air_year ?? "—"}</span>
                <span>
                  <span style="font-family:var(--font-body);">{e.title}</span>
                  <span class="caption" style="display:block;color:var(--bedford-gray);font-size:0.78rem;margin-top:2px;">{e.show_name ?? e.show_slug}</span>
                </span>
              </a>
            ))}
          </div>
          <p style="margin-top:var(--space-3);">
            <a href={`/today/${todayMd}`} class="smallcap-eyebrow" style="color:var(--body-text);text-decoration-thickness:0.5px;">
              All anniversaries for {MONTHS[todayMonth - 1]} {todayDay} →
            </a>
          </p>
        </section>
      )}

      {topPeople.length > 0 && (
        <section class="page section" aria-label="People on MSL TV">
          <p class="section-eyebrow">Martha Stewart Living Television</p>
          <h2 class="display-smaller">The people who were there.</h2>
          <p class="caption" style="font-style:italic;color:var(--mid-gray);max-width:var(--measure-prose);margin-top:var(--space-2);">
            Mothers, neighbors, pet experts, chefs, lords. The recurring cast of Martha's first show — drawn from the marthastewart.tv archive.
          </p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--space-3) var(--space-4);margin-top:var(--space-4);">
            {topPeople.map((p) => (
              <a href={`/people/${p.slug}`} style="text-decoration:none;color:inherit;border-bottom:var(--hairline-thin);padding:var(--space-2) 0;display:block;">
                <div style="display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-2);">
                  <span style="font-family:var(--font-body);">{p.name}</span>
                  <span style="font-family:var(--font-display);color:var(--bedford-gray);">{p.mentions}</span>
                </div>
                {p.role && (
                  <p class="caption" style="margin-top:4px;font-size:0.78rem;color:var(--bedford-gray);line-height:1.35;">
                    {p.role.length > 100 ? p.role.slice(0, 100) + "…" : p.role}
                  </p>
                )}
              </a>
            ))}
          </div>
          <p style="margin-top:var(--space-3);">
            <a href="/people" class="smallcap-eyebrow" style="color:var(--body-text);text-decoration-thickness:0.5px;">
              Every named person →
            </a>
          </p>
        </section>
      )}

      {topPlaces.length > 0 && (
        <section class="page section" aria-label="Field trips">
          <p class="section-eyebrow">Field trips</p>
          <h2 class="display-smaller">Where Martha went.</h2>
          <p class="caption" style="font-style:italic;color:var(--mid-gray);max-width:var(--measure-prose);margin-top:var(--space-2);">
            Bakeries, hatcheries, gardens, museums. The businesses and places the camera followed Martha to.
          </p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:var(--space-3) var(--space-4);margin-top:var(--space-4);">
            {topPlaces.map((p) => (
              <a href={`/places/${p.slug}`} style="text-decoration:none;color:inherit;border-bottom:var(--hairline-thin);padding:var(--space-2) 0;display:block;">
                <div style="display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-2);">
                  <span style="font-family:var(--font-body);">{p.name}</span>
                  <span style="font-family:var(--font-display);color:var(--bedford-gray);font-size:0.95rem;">{p.kind}</span>
                </div>
                {p.role && (
                  <p class="caption" style="margin-top:4px;font-size:0.78rem;color:var(--bedford-gray);line-height:1.35;">
                    {p.role.length > 120 ? p.role.slice(0, 120) + "…" : p.role}
                  </p>
                )}
              </a>
            ))}
          </div>
          <p style="margin-top:var(--space-3);">
            <a href="/places" class="smallcap-eyebrow" style="color:var(--body-text);text-decoration-thickness:0.5px;">
              Every field trip and location →
            </a>
          </p>
        </section>
      )}

      <section class="page section" aria-label="Shows">
        <p class="section-eyebrow">{copy.byShow}</p>
        <h2 class="display-smaller">Twelve programs, four decades</h2>
        <div class="taxonomy-grid" style="margin-top:var(--space-3);">
          {orderedShows.map((s) => (
            <a class="taxonomy-tile" href={`/shows/${s.slug}`}>
              <div
                class={`taxonomy-tile__photo taxonomy-tile__photo--${SHOW_TONES[s.slug] ?? "eggshell"}`}
                aria-hidden="true"
              >
                <span class="episode-card__photo-caption">{copy.photographWanted}</span>
              </div>
              <span class="taxonomy-tile__label">{s.name}</span>
              <span class="taxonomy-tile__meta">
                {s.yearsLabel ?? ""} · {(s.documented ?? 0).toLocaleString()} documented
              </span>
            </a>
          ))}
        </div>
      </section>

      {notable.length > 0 && (
        <section class="page section" aria-label="Good Things">
          <p class="section-eyebrow">{copy.goodThings}</p>
          <h2 class="display-smaller">A few small things, well done</h2>
          <div class="good-things">
            {notable.map((e: any) => (
              <article class="good-thing">
                <a href={`/episodes/${e.id}`}>
                  <blockquote>{e.title}</blockquote>
                  <cite>
                    {e.show_name ?? "Martha Stewart Living"} · {e.air_year ?? ""}
                  </cite>
                </a>
              </article>
            ))}
          </div>
        </section>
      )}

      <section class="page section" aria-label="Begin">
        <hr class="hairline" />
        <p class="caption" style="margin-top:var(--space-3);font-style:italic;">{copy.tagline}</p>
      </section>
    </Layout>,
  );
});
