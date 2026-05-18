import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { fetchShows, fetchLastImport, fetchCalendarYearsAvailable } from "../db/queries.js";
import { env } from "../lib/env.js";

export const sitemapRoute = new Hono();

function host(): string {
  const fly = env.FLY_APP_NAME ? `https://${env.FLY_APP_NAME}.fly.dev` : "";
  return env.CANONICAL_HOST ?? fly ?? "https://example.com";
}

sitemapRoute.get("/sitemap.xml", async (c) => {
  const base = host();
  const [shows, years, lastImport, episodeIds] = await Promise.all([
    fetchShows(),
    fetchCalendarYearsAvailable(),
    fetchLastImport(),
    db.execute<{ id: string }>(sql`SELECT id FROM episodes ORDER BY id`),
  ]);
  const lastmod = (lastImport?.finishedAt ?? new Date()).toISOString();
  const urls: string[] = [];
  urls.push(`<url><loc>${base}/</loc><lastmod>${lastmod}</lastmod></url>`);
  urls.push(`<url><loc>${base}/episodes</loc><lastmod>${lastmod}</lastmod></url>`);
  urls.push(`<url><loc>${base}/design-system</loc><lastmod>${lastmod}</lastmod></url>`);
  urls.push(`<url><loc>${base}/gaps</loc><lastmod>${lastmod}</lastmod></url>`);
  for (const s of shows) urls.push(`<url><loc>${base}/shows/${s.slug}</loc><lastmod>${lastmod}</lastmod></url>`);
  for (const y of years) urls.push(`<url><loc>${base}/calendar/${y}</loc><lastmod>${lastmod}</lastmod></url>`);
  for (const r of episodeIds as any) urls.push(`<url><loc>${base}/episodes/${r.id}</loc><lastmod>${lastmod}</lastmod></url>`);
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  c.header("Content-Type", "application/xml; charset=utf-8");
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(body);
});

sitemapRoute.get("/robots.txt", (c) => {
  const base = host();
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
});
