import { Hono } from "hono";
import { Layout } from "../views/components/Layout.js";
import { fetchLastImport, fetchRowCounts } from "../db/queries.js";
import { sql } from "../db/client.js";

export const guestsRoute = new Hono();

const SHOW_SHORT: Record<string, string> = {
  "martha-stewart-living":        "LIVING",
  "martha-stewart-show":          "SHOW",
  "martha-bakes":                 "BAKES",
  "cooking-school":               "SCHOOL",
  "martha-and-snoops":            "SNOOP",
  "martha-knows-best":            "KNOWS",
  "martha-cooks":                 "COOKS",
  "martha-holidays":              "HOLIDAY",
  "from-marthas-kitchen":         "KITCHEN",
  "martha-gets-down-and-dirty":   "DIRTY",
  "apprentice-martha-stewart":    "APPRNTCE",
  "holiday-special":              "SPECIAL",
};

const BADGE_CLASS: Record<string, string> = {
  "martha-stewart-living":        "badge-martha-stewart-living",
  "martha-stewart-show":          "badge-martha-stewart-show",
  "martha-bakes":                 "badge-martha-bakes",
  "cooking-school":               "badge-cooking-school",
  "martha-and-snoops":            "badge-martha-and-snoops",
  "martha-knows-best":            "badge-martha-knows-best",
  "martha-cooks":                 "badge-martha-cooks",
  "martha-holidays":              "badge-martha-holidays",
  "from-marthas-kitchen":         "badge-from-marthas-kitchen",
  "martha-gets-down-and-dirty":   "badge-martha-gets-down-and-dirty",
  "apprentice-martha-stewart":    "badge-apprentice-martha-stewart",
  "holiday-special":              "badge-holiday-special",
};

type GuestRow = {
  name: string;
  appearances: number;
  shows: string[];
  sample_titles: string[];
  roles: string[];
};

async function fetchGuests(): Promise<GuestRow[]> {
  const rows = await sql<Array<{
    name: string;
    appearances: number;
    shows: string[];
    sample_titles: string[];
    roles: string[];
  }>>`
    SELECT
      g.name,
      count(*)::int AS appearances,
      array_agg(DISTINCT e.show_slug ORDER BY e.show_slug) AS shows,
      array_agg(e.title ORDER BY e.air_date NULLS LAST)
        FILTER (WHERE e.title IS NOT NULL) AS sample_titles,
      array_agg(DISTINCT g.role) FILTER (WHERE g.role IS NOT NULL AND g.role <> '') AS roles
    FROM episode_guests g
    JOIN episodes e ON e.id = g.episode_id
    GROUP BY g.name
    ORDER BY appearances DESC, g.name ASC
  `;
  return rows;
}

function firstLetter(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

guestsRoute.get("/guests", async (c) => {
  const [guests, lastImport, counts] = await Promise.all([
    fetchGuests(),
    fetchLastImport(),
    fetchRowCounts(),
  ]);

  const recurring = guests.filter((g) => g.appearances >= 3);
  const multi     = guests.filter((g) => g.appearances === 2);
  const single    = guests.filter((g) => g.appearances === 1);

  // Alphabetical index — group by first letter
  const alpha = new Map<string, GuestRow[]>();
  for (const g of guests) {
    const l = firstLetter(g.name);
    if (!alpha.has(l)) alpha.set(l, []);
    alpha.get(l)!.push(g);
  }
  const letters = Array.from(alpha.keys()).sort();

  const GuestCard = ({ g }: { g: GuestRow }) => (
    <a
      href={`/episodes?guest=${encodeURIComponent(g.name)}`}
      style="text-decoration:none;display:block;padding:var(--space-2) 0;border-bottom:var(--hairline-thin);"
    >
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-3);">
        <span style="font-family:var(--font-body);font-size:var(--size-body);color:var(--body-text);">
          {g.name}
        </span>
        <span style="font-family:var(--font-display);font-size:1.4rem;color:var(--bedford-gray);flex-shrink:0;">
          {g.appearances}
        </span>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;align-items:center;">
        {g.shows.map((s) => (
          <span
            class={`ep-badge ${BADGE_CLASS[s] ?? "badge-default"}`}
            style="font-size:9px;padding:1px 5px;"
          >
            {SHOW_SHORT[s] ?? s.toUpperCase().slice(0, 7)}
          </span>
        ))}
        {g.roles?.[0] && (
          <span class="caption" style="font-size:0.75rem;font-style:italic;color:var(--bedford-gray);">
            {g.roles[0].slice(0, 60)}
          </span>
        )}
      </div>
      {g.appearances >= 3 && g.sample_titles?.[0] && (
        <p class="caption" style="margin-top:4px;font-style:italic;color:var(--bedford-gray);">
          First: {g.sample_titles[0].slice(0, 70)}{g.sample_titles[0].length > 70 ? "…" : ""}
        </p>
      )}
    </a>
  );

  return c.html(
    <Layout
      title="Guest Index — Martha Stewart Archive"
      description={`${guests.length} documented guests across all Martha Stewart programs.`}
      footerMeta={{ lastImport: lastImport?.finishedAt?.toISOString(), episodeCount: counts.episodes ?? 0 }}
    >
      <div class="page" style="padding-top:var(--space-5);padding-bottom:var(--space-8);">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <header style="border-bottom:var(--hairline-bold);padding-bottom:var(--space-4);margin-bottom:var(--space-6);">
          <p class="smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-2);">The archive</p>
          <h1 class="display">Who was there.</h1>
          <p class="caption" style="font-size:var(--size-body);font-style:italic;color:var(--mid-gray);margin-top:var(--space-2);max-width:var(--measure-prose);">
            {guests.length} documented guests across {counts.episodes?.toLocaleString() ?? "—"} episodes.
            Every name links to their appearances.
          </p>
        </header>

        {/* ── Stats row ────────────────────────────────────────────────── */}
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-5);border-top:var(--hairline);padding-top:var(--space-4);margin-bottom:var(--space-7);">
          <div>
            <p style="font-family:var(--font-display);font-size:var(--size-display-xl);line-height:1;">{guests.length}</p>
            <p class="caption" style="margin-top:var(--space-1);">unique guests</p>
          </div>
          <div>
            <p style="font-family:var(--font-display);font-size:var(--size-display-xl);line-height:1;">{recurring.length}</p>
            <p class="caption" style="margin-top:var(--space-1);">appeared 3 or more times</p>
          </div>
          <div>
            <p style="font-family:var(--font-display);font-size:var(--size-display-xl);line-height:1);">
              {guests[0]?.appearances ?? 0}
            </p>
            <p class="caption" style="margin-top:var(--space-1);">most appearances by one guest</p>
            <p style="font-size:var(--size-caption);color:var(--bedford-gray);margin-top:4px;">
              {guests[0]?.name}
            </p>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-8);align-items:start;">

          {/* ── Left: recurring + multi ───────────────────────────────── */}
          <div>
            {recurring.length > 0 && (
              <section style="margin-bottom:var(--space-6);">
                <p class="smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-3);">
                  Recurring guests — 3 or more appearances
                </p>
                {recurring.map((g) => <GuestCard g={g} />)}
              </section>
            )}

            {multi.length > 0 && (
              <section style="margin-bottom:var(--space-6);">
                <p class="smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-3);">
                  Appeared twice
                </p>
                {multi.map((g) => <GuestCard g={g} />)}
              </section>
            )}
          </div>

          {/* ── Right: alpha index ────────────────────────────────────── */}
          <div>
            {/* Jump-to nav */}
            <nav style="display:flex;flex-wrap:wrap;gap:var(--space-1) var(--space-2);margin-bottom:var(--space-4);" aria-label="Jump to letter">
              {letters.map((l) => (
                <a href={`#letter-${l}`}
                   class="smallcap-eyebrow"
                   style="color:var(--body-text);text-decoration:none;padding:2px var(--space-1);">
                  {l}
                </a>
              ))}
            </nav>
            <hr class="hairline" style="margin-bottom:var(--space-4);" />

            {letters.map((l) => (
              <section id={`letter-${l}`} style="margin-bottom:var(--space-4);">
                <p style="font-family:var(--font-display);font-size:2.5rem;line-height:1;color:var(--bedford-gray);margin-bottom:var(--space-1);">{l}</p>
                {(alpha.get(l) ?? []).map((g) => <GuestCard g={g} />)}
              </section>
            ))}
          </div>

        </div>

        {/* ── Method note ──────────────────────────────────────────────── */}
        <p class="caption" style="margin-top:var(--space-7);color:var(--bedford-gray);max-width:var(--measure-prose);">
          Guest records come from episode metadata in the source archive. Coverage is incomplete —
          only episodes with explicit guest data in the source files are represented here.
          Many MSL episodes had guests but were catalogued without names.
        </p>

      </div>
    </Layout>
  );
});
