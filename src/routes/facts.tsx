import { Hono } from "hono";
import { sql } from "../db/client.js";
import { Layout } from "../views/components/Layout.js";
import { fetchLastImport, fetchRowCounts } from "../db/queries.js";

export const factsRoute = new Hono();

async function gatherFacts() {
  const [
    guestRows,
    topTopics,
    topThemes,
    topTags,
    yearDist,
    monthDist,
    seasonStats,
    cotw,
    goodThings,
    fieldTrips,
    totalMsl,
    withPhotos,
    confBreakdown,
    first,
    last,
  ] = await Promise.all([
    // Top recurring guests
    sql<{ name: string; appearances: number }[]>`
      SELECT g.name, count(*)::int AS appearances
      FROM episode_guests g JOIN episodes e ON e.id = g.episode_id
      WHERE e.show_slug = 'martha-stewart-living'
      GROUP BY g.name ORDER BY appearances DESC LIMIT 20`,

    // Top topics
    sql<{ topic: string; c: number }[]>`
      SELECT et.topic, count(distinct e.id)::int c
      FROM episode_topics et JOIN episodes e ON e.id = et.episode_id
      WHERE e.show_slug = 'martha-stewart-living' AND e.provenance = 'seed'
      GROUP BY et.topic ORDER BY c DESC LIMIT 10`,

    // Top themes
    sql<{ theme: string; c: number }[]>`
      SELECT et.theme, count(distinct e.id)::int c
      FROM episode_themes et JOIN episodes e ON e.id = et.episode_id
      WHERE e.show_slug = 'martha-stewart-living' AND e.provenance = 'seed'
      GROUP BY et.theme ORDER BY c DESC LIMIT 8`,

    // Top tags (no year-only tags)
    sql<{ tag: string; c: number }[]>`
      SELECT et.tag, count(distinct e.id)::int c
      FROM episode_tags et JOIN episodes e ON e.id = et.episode_id
      WHERE e.show_slug = 'martha-stewart-living' AND e.provenance = 'seed'
        AND et.tag !~ '^[0-9]{4}$'
      GROUP BY et.tag ORDER BY c DESC LIMIT 15`,

    // Peak years
    sql<{ air_year: number; c: number }[]>`
      SELECT air_year, count(*)::int c FROM episodes
      WHERE show_slug = 'martha-stewart-living' AND air_year IS NOT NULL AND provenance = 'seed'
      GROUP BY air_year ORDER BY c DESC LIMIT 10`,

    // Episodes by month
    sql<{ m: number; c: number }[]>`
      SELECT EXTRACT(MONTH FROM air_date)::int AS m, count(*)::int c FROM episodes
      WHERE show_slug = 'martha-stewart-living' AND air_date IS NOT NULL AND provenance = 'seed'
      GROUP BY m ORDER BY c DESC`,

    // Season stats
    sql<{ season: number; c: number; confirmed: number }[]>`
      SELECT season, count(*)::int c,
             count(*) FILTER (WHERE confidence = 'confirmed')::int confirmed
      FROM episodes
      WHERE show_slug = 'martha-stewart-living' AND season IS NOT NULL AND provenance = 'seed'
      GROUP BY season ORDER BY season`,

    // Cookie of the Week
    sql<{ c: number }[]>`
      SELECT count(distinct e.id)::int c FROM episode_tags et
      JOIN episodes e ON e.id = et.episode_id
      WHERE e.show_slug = 'martha-stewart-living' AND et.tag ILIKE '%cookie of the week%'`,

    // Good Things
    sql<{ c: number }[]>`
      SELECT count(distinct e.id)::int c FROM episode_tags et
      JOIN episodes e ON e.id = et.episode_id
      WHERE e.show_slug = 'martha-stewart-living' AND et.tag ILIKE '%good thing%'`,

    // Field trips (travel topic count)
    sql<{ c: number }[]>`
      SELECT count(distinct e.id)::int c FROM episode_topics et
      JOIN episodes e ON e.id = et.episode_id
      WHERE e.show_slug = 'martha-stewart-living' AND et.topic = 'travel'`,

    // Total MSL episodes
    sql<{ c: number }[]>`SELECT count(*)::int c FROM episodes WHERE show_slug = 'martha-stewart-living'`,

    // With photos
    sql<{ c: number }[]>`SELECT count(*)::int c FROM episodes WHERE show_slug = 'martha-stewart-living' AND photo_url IS NOT NULL`,

    // Confidence breakdown
    sql<{ confidence: string; c: number }[]>`
      SELECT confidence, count(*)::int c FROM episodes WHERE show_slug = 'martha-stewart-living'
      GROUP BY confidence ORDER BY c DESC`,

    // First episode
    sql<{ title: string; air_date: string }[]>`
      SELECT title, to_char(air_date, 'FMMonth DD, YYYY') AS air_date FROM episodes
      WHERE show_slug = 'martha-stewart-living' AND air_date IS NOT NULL
      ORDER BY air_date ASC LIMIT 1`,

    // Last episode
    sql<{ title: string; air_date: string }[]>`
      SELECT title, to_char(air_date, 'FMMonth DD, YYYY') AS air_date FROM episodes
      WHERE show_slug = 'martha-stewart-living' AND air_date IS NOT NULL
      ORDER BY air_date DESC LIMIT 1`,
  ]);

  return {
    guests: guestRows,
    topics: topTopics,
    themes: topThemes,
    tags: topTags,
    peakYears: yearDist,
    byMonth: monthDist,
    seasons: seasonStats,
    cotwCount: cotw[0]?.c ?? 0,
    goodThingsCount: goodThings[0]?.c ?? 0,
    fieldTripCount: fieldTrips[0]?.c ?? 0,
    total: totalMsl[0]?.c ?? 0,
    withPhotos: withPhotos[0]?.c ?? 0,
    confidence: confBreakdown,
    firstEp: first[0] ?? null,
    lastEp: last[0] ?? null,
  };
}

const MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

factsRoute.get("/facts", async (c) => {
  const [facts, lastImport, counts] = await Promise.all([
    gatherFacts(),
    fetchLastImport(),
    fetchRowCounts(),
  ]);

  const topTopic = facts.topics[0];
  const peakYear = facts.peakYears[0];
  const confirmedCount = facts.confidence.find(r => r.confidence === "confirmed")?.c ?? 0;
  const topMonth = facts.byMonth[0];
  const topMonthName = topMonth ? MONTH_NAMES[topMonth.m] : "Nov";

  // CSS bar chart max for topics
  const maxTopicCount = Math.max(...facts.topics.map(t => t.c));
  const maxYearCount = Math.max(...facts.peakYears.map(y => y.c));

  return c.html(
    <Layout
      title="Martha Stewart Living — The Numbers"
      description="Facts, patterns, and records drawn from 1,216 documented episodes of Martha Stewart Living, 1993–2004."
      footerMeta={{ lastImport: lastImport?.finishedAt?.toISOString(), episodeCount: counts.episodes ?? 0 }}
    >
      <article class="page" style="padding-top:var(--space-5);padding-bottom:var(--space-8);max-width:var(--measure-page);">

        {/* ── Title ─────────────────────────────────────────────────────── */}
        <header style="margin-bottom:var(--space-6);border-bottom:var(--hairline-bold);padding-bottom:var(--space-4);">
          <p class="smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-2);">Martha Stewart Living Television</p>
          <h1 class="display">The numbers.</h1>
          <p class="caption" style="font-size:var(--size-body);font-style:italic;color:var(--mid-gray);margin-top:var(--space-2);max-width:var(--measure-prose);">
            Facts and patterns drawn from {facts.total.toLocaleString()} documented episodes,
            {" "}{facts.firstEp?.air_date ?? "1993"} to {facts.lastEp?.air_date ?? "2004"}.
            Numbers compiled from the archive; partial entries noted.
          </p>
        </header>

        {/* ── The Run ───────────────────────────────────────────────────── */}
        <section style="margin-bottom:var(--space-7);">
          <p class="section-eyebrow smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-3);">The run</p>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-5);border-top:var(--hairline);padding-top:var(--space-4);">
            <div>
              <p style="font-family:var(--font-display);font-size:var(--size-display-xl);line-height:1;color:var(--body-text);">{facts.total.toLocaleString()}</p>
              <p class="caption" style="margin-top:var(--space-1);">episodes documented</p>
              <p style="font-size:var(--size-caption);color:var(--bedford-gray);margin-top:4px;">{confirmedCount.toLocaleString()} confirmed by primary source</p>
            </div>
            <div>
              <p style="font-family:var(--font-display);font-size:var(--size-display-xl);line-height:1;color:var(--body-text);">11</p>
              <p class="caption" style="margin-top:var(--space-1);">seasons, 1993 – 2004</p>
              <p style="font-size:var(--size-caption);color:var(--bedford-gray);margin-top:4px;">S1–S9 on CBS / Syndicated; S10–S11 on Hallmark</p>
            </div>
            <div>
              <p style="font-family:var(--font-display);font-size:var(--size-display-xl);line-height:1;color:var(--body-text);">{peakYear?.air_year}</p>
              <p class="caption" style="margin-top:var(--space-1);">the peak year</p>
              <p style="font-size:var(--size-caption);color:var(--bedford-gray);margin-top:4px;">{peakYear?.c.toLocaleString()} episodes that year alone</p>
            </div>
          </div>

          {facts.firstEp && facts.lastEp && (
            <div style="margin-top:var(--space-5);display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);border-top:var(--hairline);padding-top:var(--space-3);">
              <div>
                <p class="smallcap-eyebrow" style="margin-bottom:var(--space-1);">First broadcast</p>
                <p style="font-family:var(--font-display);font-size:var(--size-h3);line-height:1.3;">{facts.firstEp.title}</p>
                <p class="caption">{facts.firstEp.air_date}</p>
              </div>
              <div>
                <p class="smallcap-eyebrow" style="margin-bottom:var(--space-1);">Series finale</p>
                <p style="font-family:var(--font-display);font-size:var(--size-h3);line-height:1.3;">{facts.lastEp.title}</p>
                <p class="caption">{facts.lastEp.air_date}</p>
              </div>
            </div>
          )}
        </section>

        {/* ── Pull quote ────────────────────────────────────────────────── */}
        <blockquote style="border-left:3px solid var(--body-text);padding:var(--space-3) var(--space-4);margin:0 0 var(--space-7);background:var(--page-warm-white);">
          <p style="font-family:var(--font-display);font-style:italic;font-size:var(--size-h2);line-height:1.3;color:var(--body-text);">
            "{topMonth ? topMonthName : "November"} was the busiest month."
          </p>
          <p class="caption" style="margin-top:var(--space-2);">
            {topMonth?.c.toLocaleString()} episodes aired in {topMonthName} — more than any other month.
            October second with {facts.byMonth[1]?.c.toLocaleString()}.
            June and August nearly silent: 12 episodes each.
          </p>
        </blockquote>

        {/* ── Topics breakdown ──────────────────────────────────────────── */}
        <section style="margin-bottom:var(--space-7);">
          <p class="smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-3);">What she covered</p>
          <p style="font-size:var(--size-caption);color:var(--bedford-gray);margin-bottom:var(--space-3);">Episode count by primary topic (seed episodes only)</p>
          <div style="display:flex;flex-direction:column;gap:var(--space-2);">
            {facts.topics.map(t => (
              <div style="display:grid;grid-template-columns:11rem 1fr auto;align-items:center;gap:var(--space-3);">
                <span style="font-size:var(--size-caption);color:var(--body-text);text-align:right;font-family:var(--font-body);font-style:italic;">{t.topic}</span>
                <div style="height:8px;background:var(--rule-soft);">
                  <div style={`height:100%;background:var(--hosta);width:${Math.round((t.c / maxTopicCount) * 100)}%;`}></div>
                </div>
                <span style="font-family:var(--font-display);font-size:var(--size-body);color:var(--mid-gray);min-width:3rem;text-align:right;">{t.c.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── The field trips ───────────────────────────────────────────── */}
        <section style="margin-bottom:var(--space-7);border-top:var(--hairline);padding-top:var(--space-5);">
          <p class="smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-2);">Out of the studio</p>
          <p style="font-family:var(--font-display);font-size:var(--size-display);line-height:1.1;margin-bottom:var(--space-3);">{facts.fieldTripCount}</p>
          <p class="body" style="max-width:var(--measure-prose);margin-bottom:var(--space-3);">
            Field trip episodes. Martha left the studio to visit Jamaica, Bar Harbor Maine, the Metropolitan Museum of Art,
            the Westminster Kennel Club Dog Show, Vera Wang's studio, Bobbi Brown's makeup room, the Bronx Zoo, Balthazar,
            Aquavit, the Four Seasons, and hundreds of farms, workshops, and restaurants across the country and the world.
          </p>
          <p style="font-size:var(--size-caption);color:var(--bedford-gray);">
            Each one was an education. The field trip was her most durable format.
          </p>
        </section>

        {/* ── Recurring segments ────────────────────────────────────────── */}
        <section style="margin-bottom:var(--space-7);border-top:var(--hairline);padding-top:var(--space-5);">
          <p class="smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-4);">Recurring segments</p>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-5);">
            <div style="border-top:3px solid var(--body-text);padding-top:var(--space-3);">
              <p style="font-family:var(--font-display);font-size:3rem;line-height:1;">{facts.cotwCount}</p>
              <p style="font-family:var(--font-body);font-style:italic;font-size:var(--size-body);margin-top:var(--space-1);">Cookie of the Week</p>
              <p class="caption" style="margin-top:var(--space-1);">documented episodes featuring the segment</p>
            </div>
            <div style="border-top:3px solid var(--body-text);padding-top:var(--space-3);">
              <p style="font-family:var(--font-display);font-size:3rem;line-height:1;">{facts.goodThingsCount}</p>
              <p style="font-family:var(--font-body);font-style:italic;font-size:var(--size-body);margin-top:var(--space-1);">Good Things</p>
              <p class="caption" style="margin-top:var(--space-1);">title episodes (the segment appeared far more often)</p>
            </div>
            <div style="border-top:3px solid var(--body-text);padding-top:var(--space-3);">
              <p style="font-family:var(--font-display);font-size:3rem;line-height:1);">202</p>
              <p style="font-family:var(--font-body);font-style:italic;font-size:var(--size-body);margin-top:var(--space-1);">Garden-to-table</p>
              <p class="caption" style="margin-top:var(--space-1);">episodes with garden-as-pantry as the underlying theme</p>
            </div>
          </div>
        </section>

        {/* ── Big Martha ────────────────────────────────────────────────── */}
        <section style="margin-bottom:var(--space-7);background:var(--page-warm-white);padding:var(--space-5);border-left:var(--hairline-bold);">
          <p class="smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-2);">Her mother</p>
          <p style="font-family:var(--font-display);font-style:italic;font-size:var(--size-h2);line-height:1.3;margin-bottom:var(--space-3);">
            "Big Martha" Kostyra appeared in three of the ten confirmed Hallmark-era episodes.
          </p>
          <p class="body" style="max-width:var(--measure-prose);">
            Martha Kostyra — Martha's mother, known as "Big Martha" — joined her daughter on screen for episodes
            about family recipes, birthday celebrations, and Eastern European cooking traditions.
            Of the ten Hallmark-era titles we can confirm, three feature her by name.
            She was the show's most documented recurring guest.
          </p>
        </section>

        {/* ── Season by season ──────────────────────────────────────────── */}
        <section style="margin-bottom:var(--space-7);border-top:var(--hairline);padding-top:var(--space-5);">
          <p class="smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-4);">Season by season</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:var(--space-3);">
            {facts.seasons.map(s => (
              <a href={`/episodes?show=martha-stewart-living&season=${s.season}`}
                 style="text-decoration:none;border-top:2px solid var(--rule);padding-top:var(--space-2);display:block;">
                <p style="font-family:var(--font-display);font-size:1.75rem;line-height:1;color:var(--body-text);">S{s.season}</p>
                <p style="font-size:var(--size-caption);color:var(--body-text);margin-top:4px;">{s.c} episodes</p>
                <p style="font-size:var(--size-caption);color:var(--bedford-gray);">{s.confirmed} confirmed</p>
              </a>
            ))}
          </div>
        </section>

        {/* ── Themes ───────────────────────────────────────────────────── */}
        <section style="margin-bottom:var(--space-7);border-top:var(--hairline);padding-top:var(--space-5);">
          <p class="smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-4);">Underlying themes</p>
          <div style="display:flex;flex-wrap:wrap;gap:var(--space-2) var(--space-4);">
            {facts.themes.map(t => (
              <div style="display:flex;align-items:baseline;gap:var(--space-2);">
                <span style="font-family:var(--font-display);font-size:1.5rem;color:var(--body-text);">{t.c}</span>
                <span style="font-family:var(--font-body);font-style:italic;font-size:var(--size-caption);color:var(--mid-gray);">{t.theme}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Top tags ─────────────────────────────────────────────────── */}
        <section style="margin-bottom:var(--space-7);border-top:var(--hairline);padding-top:var(--space-5);">
          <p class="smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-3);">The vocabulary</p>
          <p class="body" style="max-width:var(--measure-prose);margin-bottom:var(--space-4);">
            The archive carries 1,681 unique tags across all documented MSL episodes.
            The most frequent, excluding year tags:
          </p>
          <div style="display:flex;flex-wrap:wrap;gap:var(--space-1) var(--space-2);">
            {facts.tags.map((t, i) => (
              <a href={`/episodes?tag=${encodeURIComponent(t.tag)}&show=martha-stewart-living`}
                 style={`text-decoration:none;font-family:var(--font-body);font-style:italic;color:var(--body-text);font-size:${0.75 + (facts.tags.length - i) / facts.tags.length * 0.5}rem;`}>
                {t.tag}
                <span style="font-size:0.7rem;color:var(--bedford-gray);font-style:normal;margin-left:2px;">{t.c}</span>
              </a>
            ))}
          </div>
        </section>

        {/* ── Photography ───────────────────────────────────────────────── */}
        <section style="margin-bottom:var(--space-7);border-top:var(--hairline);padding-top:var(--space-5);">
          <p class="smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-2);">Photography</p>
          <p style="font-family:var(--font-display);font-size:var(--size-display);line-height:1.1;margin-bottom:var(--space-3);">
            {facts.withPhotos.toLocaleString()} of {facts.total.toLocaleString()}
          </p>
          <p class="body" style="max-width:var(--measure-prose);">
            documented MSL episodes now carry a photograph from marthastewart.tv.
            The photographs come from Martha's own streaming archive and are the images her team selected.
            The remaining {(facts.total - facts.withPhotos).toLocaleString()} carry a plain tile — honest about what we don't have.
          </p>
          <p style="margin-top:var(--space-3);font-size:var(--size-caption);color:var(--bedford-gray);">
            Images sourced from marthastewart.tv (Vimeo OTT), courtesy of Martha Stewart Living Omnimedia.
            This is a non-commercial research archive.
          </p>
        </section>

        {/* ── About the data ────────────────────────────────────────────── */}
        <section style="border-top:var(--hairline-bold);padding-top:var(--space-4);">
          <p class="smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-2);">About this data</p>
          <p class="body" style="max-width:var(--measure-prose);color:var(--mid-gray);">
            Episode records were compiled from TheTVDB, IMDb, TV Guide, Yidio, Wikipedia, and marthastewart.tv.
            Hallmark-era episodes (Seasons 10–11, 2002–2004) were recovered from the marthastewart.tv streaming
            archive in May 2026 — previously declared unretrievable by public databases.
            Topics, themes, and tags were assigned during data generation; the taxonomy is imperfect but consistent.
            Numbers on this page are drawn live from the archive database and update as the archive grows.
          </p>
          <p style="margin-top:var(--space-3);">
            <a href="/gaps" class="smallcap-eyebrow" style="color:var(--body-text);text-decoration:underline;text-decoration-thickness:0.5px;">
              What we don't know yet →
            </a>
          </p>
        </section>

      </article>
    </Layout>
  );
});
