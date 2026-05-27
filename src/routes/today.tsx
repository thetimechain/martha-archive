import { Hono } from "hono";
import { Layout } from "../views/components/Layout.js";
import { fetchOnThisDay, fetchLastImport, fetchRowCounts } from "../db/queries.js";
import { canonical, breadcrumbsJsonLd } from "../lib/seo.js";

export const todayRoute = new Hono();

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Resolve today's month/day in America/New_York — Martha's home tz.
// Fly containers run UTC; without this conversion the page flips at 8pm ET.
function todayInNY(): { month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  const month = Number.parseInt(parts.find((p) => p.type === "month")!.value, 10);
  const day = Number.parseInt(parts.find((p) => p.type === "day")!.value, 10);
  return { month, day };
}

function parseMd(md: string): { month: number; day: number } | null {
  const m = md.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const month = Number.parseInt(m[1]!, 10);
  const day = Number.parseInt(m[2]!, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

todayRoute.get("/today", (c) => {
  const { month, day } = todayInNY();
  // 302 redirect (not 308) — "today" changes daily, intermediaries shouldn't cache.
  return c.redirect(`/today/${pad2(month)}-${pad2(day)}`, 302);
});

todayRoute.get("/today/:md", async (c) => {
  const parsed = parseMd(c.req.param("md"));
  if (!parsed) return c.notFound();
  const { month, day } = parsed;

  const [eps, lastImport, counts] = await Promise.all([
    fetchOnThisDay(month, day),
    fetchLastImport(),
    fetchRowCounts(),
  ]);

  const monthName = MONTH_NAMES[month - 1]!;
  const pretty = `${monthName} ${day}`;
  const slug = `${pad2(month)}-${pad2(day)}`;
  const isToday = (() => {
    const t = todayInNY();
    return t.month === month && t.day === day;
  })();

  // Deterministic per-MM-DD content — safe to cache aggressively.
  c.header("Cache-Control", "public, max-age=3600, s-maxage=21600");

  return c.html(
    <Layout
      title={`On this day, ${pretty} — Martha Stewart Archive`}
      description={`Martha Stewart episodes that aired on ${pretty} across the years. ${eps.length} documented broadcast${eps.length === 1 ? "" : "s"}.`}
      canonical={canonical(`/today/${slug}`)}
      jsonLd={[breadcrumbsJsonLd([
        { name: "Archive", url: canonical("/") },
        { name: "On this day", url: canonical("/today") },
        { name: pretty, url: canonical(`/today/${slug}`) },
      ])]}
      footerMeta={{ lastImport: lastImport?.finishedAt?.toISOString(), episodeCount: counts.episodes ?? 0 }}
    >
      <div class="page" style="padding-top:var(--space-5);padding-bottom:var(--space-8);">
        <header style="border-bottom:var(--hairline-bold);padding-bottom:var(--space-4);margin-bottom:var(--space-6);">
          <p class="smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-2);">
            {isToday ? "On this day" : "Anniversaries"}
          </p>
          <h1 class="display">{pretty} in Martha history.</h1>
          <p class="caption" style="font-size:var(--size-body);font-style:italic;color:var(--mid-gray);margin-top:var(--space-2);max-width:var(--measure-prose);">
            {eps.length === 0 ? (
              <>No documented broadcasts aired on {pretty}.{" "}Only episodes with day-precision air dates are listed here, so the 1990s Martha Stewart Living TV episodes (most of which are dated to the year only) won't appear.</>
            ) : (
              <>{eps.length} episode{eps.length === 1 ? "" : "s"} of Martha Stewart programming aired on this date.</>
            )}
          </p>
        </header>

        {eps.length > 0 && (
          <section style="display:grid;gap:var(--space-5);">
            {eps.map((e) => (
              <a href={`/episodes/${e.id}`} style="text-decoration:none;color:inherit;display:grid;grid-template-columns:minmax(180px,260px) 1fr;gap:var(--space-5);align-items:start;border-bottom:var(--hairline-thin);padding-bottom:var(--space-4);">
                {e.photo_url ? (
                  <div style="aspect-ratio:16/9;overflow:hidden;background:var(--bedford-gray);">
                    <img src={e.photo_url} alt={e.title} loading="lazy" style="width:100%;height:100%;object-fit:cover;" />
                  </div>
                ) : (
                  <div style="aspect-ratio:16/9;background:var(--eggshell);" aria-hidden="true" />
                )}
                <div>
                  <p style="font-family:var(--font-display);font-size:2.4rem;line-height:1;color:var(--bedford-gray);">
                    {e.air_year ?? "—"}
                  </p>
                  <p style="font-family:var(--font-body);font-size:1.1rem;margin-top:var(--space-2);">
                    {e.title}
                  </p>
                  <p class="caption" style="color:var(--bedford-gray);font-size:var(--size-caption);margin-top:4px;">
                    {e.show_name ?? e.show_slug}
                  </p>
                </div>
              </a>
            ))}
          </section>
        )}

        <hr class="hairline" style="margin-top:var(--space-7);" />
        <p class="caption" style="margin-top:var(--space-3);color:var(--bedford-gray);max-width:var(--measure-prose);">
          Anniversaries are computed from <code style="font-family:var(--font-body);background:var(--eggshell);padding:1px 5px;">air_date</code> on episodes with day-precision broadcasts —
          primarily The Martha Stewart Show (2005–2012) and a handful of holiday specials.
          MSL Television (1993–2004) episodes are dated by year/season only and are not listed
          here. <a href="/episodes" style="color:var(--body-text);">Browse the full archive →</a>
        </p>
      </div>
    </Layout>,
  );
});
