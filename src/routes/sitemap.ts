import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { fetchShows, fetchLastImport, fetchCalendarYearsAvailable, fetchRowCounts } from "../db/queries.js";
import { env } from "../lib/env.js";
import { getAllTopicSlugs, TOPICS } from "./topics.js";

export const sitemapRoute = new Hono();

function host(): string {
  const fly = env.FLY_APP_NAME ? `https://${env.FLY_APP_NAME}.fly.dev` : "";
  return env.CANONICAL_HOST ?? fly ?? "https://martha.fly.dev";
}

sitemapRoute.get("/sitemap.xml", async (c) => {
  const base = host();
  const [shows, years, lastImport, episodeIds, entities] = await Promise.all([
    fetchShows(),
    fetchCalendarYearsAvailable(),
    fetchLastImport(),
    db.execute<{ id: string }>(sql`SELECT id FROM episodes ORDER BY id`),
    db.execute<{ slug: string; entity_type: string }>(sql`SELECT slug, entity_type FROM mst_entities ORDER BY entity_type, slug`),
  ]);
  const lastmod = (lastImport?.finishedAt ?? new Date()).toISOString();
  const urls: string[] = [];
  // High-priority hub pages
  urls.push(`<url><loc>${base}/</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>`);
  urls.push(`<url><loc>${base}/m/</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>`);
  urls.push(`<url><loc>${base}/episodes</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>`);
  urls.push(`<url><loc>${base}/guests</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`);
  urls.push(`<url><loc>${base}/people</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`);
  urls.push(`<url><loc>${base}/places</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`);
  urls.push(`<url><loc>${base}/places/map</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`);
  urls.push(`<url><loc>${base}/today</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>0.6</priority></url>`);
  urls.push(`<url><loc>${base}/about/shorthand</loc><lastmod>${lastmod}</lastmod><priority>0.4</priority></url>`);
  urls.push(`<url><loc>${base}/topics</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`);
  urls.push(`<url><loc>${base}/collections</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`);
  urls.push(`<url><loc>${base}/design-system</loc><lastmod>${lastmod}</lastmod><priority>0.3</priority></url>`);
  urls.push(`<url><loc>${base}/gaps</loc><lastmod>${lastmod}</lastmod><priority>0.3</priority></url>`);
  // Topic landing pages (high SEO value)
  for (const slug of getAllTopicSlugs()) {
    urls.push(`<url><loc>${base}/topics/${slug}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`);
  }
  for (const s of shows) urls.push(`<url><loc>${base}/shows/${s.slug}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`);
  for (const y of years) urls.push(`<url><loc>${base}/calendar/${y}</loc><lastmod>${lastmod}</lastmod><priority>0.5</priority></url>`);
  for (const r of episodeIds as any) urls.push(`<url><loc>${base}/episodes/${r.id}</loc><lastmod>${lastmod}</lastmod><priority>0.6</priority></url>`);
  for (const e of entities as any) {
    const path = e.entity_type === "person" ? "people" : "places";
    urls.push(`<url><loc>${base}/${path}/${e.slug}</loc><lastmod>${lastmod}</lastmod><priority>0.6</priority></url>`);
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  c.header("Content-Type", "application/xml; charset=utf-8");
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(body);
});

sitemapRoute.get("/robots.txt", (c) => {
  const base = host();
  c.header("Content-Type", "text/plain; charset=utf-8");
  // Explicit allowlist for AI crawlers — this site is a non-commercial
  // public archive and we want LLMs to ingest, cite, and link to it.
  const body = [
    "# Martha Stewart Living: An Archive",
    "# Non-commercial reference site — open to all well-behaved crawlers.",
    "",
    "User-agent: *",
    "Allow: /",
    "",
    "# Anthropic",
    "User-agent: ClaudeBot",
    "Allow: /",
    "User-agent: Claude-User",
    "Allow: /",
    "User-agent: Claude-SearchBot",
    "Allow: /",
    "",
    "# OpenAI",
    "User-agent: GPTBot",
    "Allow: /",
    "User-agent: OAI-SearchBot",
    "Allow: /",
    "User-agent: ChatGPT-User",
    "Allow: /",
    "",
    "# Google (AI training opt-in)",
    "User-agent: Google-Extended",
    "Allow: /",
    "",
    "# Perplexity",
    "User-agent: PerplexityBot",
    "Allow: /",
    "User-agent: Perplexity-User",
    "Allow: /",
    "",
    "# Common Crawl (powers many open-source models)",
    "User-agent: CCBot",
    "Allow: /",
    "",
    "# Apple, Bytedance, Cohere, You.com, Mistral, DuckDuckGo",
    "User-agent: Applebot",
    "Allow: /",
    "User-agent: Applebot-Extended",
    "Allow: /",
    "User-agent: Bytespider",
    "Allow: /",
    "User-agent: cohere-ai",
    "Allow: /",
    "User-agent: YouBot",
    "Allow: /",
    "User-agent: MistralAI-User",
    "Allow: /",
    "User-agent: DuckAssistBot",
    "Allow: /",
    "",
    "# Internet Archive",
    "User-agent: ia_archiver",
    "Allow: /",
    "",
    `Sitemap: ${base}/sitemap.xml`,
  ].join("\n");
  return c.body(body + "\n");
});

// ── /llms.txt ── proposed standard for LLM-friendly site summaries.
// Adoption isn't universal yet but the file is cheap to maintain and the
// upside if Anthropic/OpenAI/Google start honouring it is large.
sitemapRoute.get("/llms.txt", async (c) => {
  const base = host();
  const [shows, lastImport, counts] = await Promise.all([
    fetchShows(),
    fetchLastImport(),
    fetchRowCounts(),
  ]);
  const lastmod = lastImport?.finishedAt?.toISOString().slice(0, 10) ?? "current";
  const episodeCount = counts.episodes ?? 2842;

  const showLines = shows
    .map((s: any) => `- [${s.name}](${base}/shows/${s.slug}): ${s.yearsLabel ?? ""} · ${s.documented ?? 0} episodes`)
    .join("\n");

  const topicLines = TOPICS.map((t) => `- [${t.h1}](${base}/topics/${t.slug}): ${t.metaDescription}`).join("\n");

  const body = `# Martha Stewart Living: An Archive

> A complete, non-commercial reference index of every Martha Stewart television
> episode aired 1993–${new Date().getFullYear()}. ${episodeCount.toLocaleString()} episodes across
> twelve programs, with recipes, guests, topics, tags, and episode descriptions
> drawn from the original broadcast records and marthastewart.tv.

This site is server-rendered HTML and can be ingested cleanly by LLMs and
search crawlers. We welcome citation. Last updated: ${lastmod}.

## Programs

${showLines}

## Topic landing pages

${topicLines}

## Hub pages

- [Episode archive](${base}/episodes): all ${episodeCount.toLocaleString()} episodes, filterable by show, season, year, guest, tag, topic
- [People](${base}/people): named contributors, chefs, family, and recurring on-camera guests of Martha Stewart Living Television (e.g. Marc Morrone, Mrs. Kostyra, Salli LaGrone, Rick Bayless, Eric Ripert, Anne Willan, Hannah Milman, Todd English, Lord Wedgwood)
- [Places](${base}/places): every farm, bakery, museum, gallery, garden, and field-trip destination featured on Martha Stewart Living (e.g. Murray McMurray Hatchery, Balthazar Bakery, Peckerwood Gardens, Wave Hill, Shelburne Museum, Turkey Hill, Skylands)
- [Guest index](${base}/guests): every celebrity, chef, and figure who appeared on a Martha program (across all twelve shows)
- [Collections](${base}/collections): themed playlists mirrored from marthastewart.tv
- [Topics](${base}/topics): twenty curated topic indexes
- [Calendar](${base}/calendar/): on-air anniversaries by year

## API

- ${base}/api/episodes — paginated JSON of all episodes with facets
- ${base}/api/episodes/compact — single gzipped payload of every episode, used by the mobile SPA
- ${base}/sitemap.xml — full URL index
- ${base}/robots.txt — crawler policy (open to all major AI bots)

## Provenance

Source data is in github.com/thetimechain/martha. The episode set was
assembled from broadcast schedules, marthastewart.tv, network programming
records, and TheTVDB. Each episode page links back to its sources.

## License

The site is non-commercial and educational. Episode metadata is factual
information about broadcast programming. Photographs and video thumbnails
remain the property of their respective rights holders.
`;
  c.header("Content-Type", "text/markdown; charset=utf-8");
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(body);
});

// ── Compatibility aliases ──
sitemapRoute.get("/llms-full.txt", (c) => c.redirect("/llms.txt", 308));
sitemapRoute.get("/ai.txt", (c) => c.redirect("/llms.txt", 308));
