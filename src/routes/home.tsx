import { Hono } from "hono";
import { Layout } from "../views/components/Layout.js";
import { fetchShows, fetchLastImport, fetchRowCounts, fetchNotableEpisodes } from "../db/queries.js";
import { copy } from "../copy.js";
import { canonical, websiteJsonLd } from "../lib/seo.js";

export const homeRoute = new Hono();

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

      <section class="page section" aria-label="Shows">
        <p class="section-eyebrow">{copy.byShow}</p>
        <h2 class="display-smaller">Twelve programs, four decades</h2>
        <div class="taxonomy-grid" style="margin-top:var(--space-3);">
          {shows.map((s) => (
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
