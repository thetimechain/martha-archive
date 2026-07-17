import { Hono } from "hono";
import { Layout } from "../views/components/Layout.js";
import { sql } from "../db/client.js";
import { fetchLastImport, fetchRowCounts, fetchConnections } from "../db/queries.js";
import { canonical, breadcrumbsJsonLd } from "../lib/seo.js";
import { wikiLinksFor } from "../lib/wiki-links.js";
import { allCoords } from "../lib/places-geo.js";
import { safeJsonForScriptTag } from "../lib/safe-json.js";

export const placesRoute = new Hono();

type PlaceRow = {
  slug: string;
  name: string;
  kind: string;
  role: string | null;
  mentions: number;
};

const KIND_LABEL: Record<string, string> = {
  business: "Business",
  restaurant: "Restaurant",
  museum: "Museum",
  garden: "Garden",
  farm: "Farm",
  zoo: "Zoo",
  park: "Park",
  location: "Location",
  residence: "Residence",
  event: "Event",
  organization: "Organization",
  "historic-house": "Historic house",
  "field-trip": "Field trip",
};

const KIND_GROUP: Record<string, string> = {
  business: "Businesses she visited",
  restaurant: "Businesses she visited",
  museum: "Museums",
  garden: "Gardens",
  farm: "Farms & nurseries",
  zoo: "Zoos & parks",
  park: "Zoos & parks",
  location: "Locations & landscapes",
  residence: "Martha's own places",
  event: "Annual events",
  organization: "Organizations",
  "historic-house": "Historic houses",
  "field-trip": "Other field trips",
};

placesRoute.get("/places", async (c) => {
  const [places, lastImport, counts] = await Promise.all([
    sql<PlaceRow[]>`
      SELECT slug, name, kind, role, mentions
      FROM mst_entities
      WHERE entity_type = 'place'
      ORDER BY mentions DESC, name ASC
    `,
    fetchLastImport(),
    fetchRowCounts(),
  ]);

  // group by kind
  const groups = new Map<string, PlaceRow[]>();
  for (const p of places) {
    const key = KIND_GROUP[p.kind] ?? "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  // alphabetical jump-to (all places)
  const alpha = new Map<string, PlaceRow[]>();
  for (const p of places) {
    const letter = p.name.trim().charAt(0).toUpperCase();
    if (!alpha.has(letter)) alpha.set(letter, []);
    alpha.get(letter)!.push(p);
  }
  const letters = [...alpha.keys()].sort();
  const GROUP_ORDER = [
    "Martha's own places",
    "Businesses she visited",
    "Farms & nurseries",
    "Gardens",
    "Museums",
    "Historic houses",
    "Zoos & parks",
    "Annual events",
    "Locations & landscapes",
    "Organizations",
    "Other field trips",
    "Other",
  ];

  return c.html(
    <Layout
      title="Field Trips & Places"
      description="Every farm, bakery, museum, gallery, garden, and location featured on Martha Stewart Living. From Murray McMurray Hatchery to Balthazar Bakery to Peckerwood Garden."
      canonical={canonical("/places")}
      jsonLd={[breadcrumbsJsonLd([{ name: "Archive", url: canonical("/") }, { name: "Places", url: canonical("/places") }])]}
      footerMeta={{ lastImport: lastImport?.finishedAt?.toISOString(), episodeCount: counts.episodes ?? 0 }}
    >
      <div class="page" style="padding-top:var(--space-5);padding-bottom:var(--space-8);">
        <header style="border-bottom:var(--hairline-bold);padding-bottom:var(--space-4);margin-bottom:var(--space-6);">
          <p class="smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-2);">Martha Stewart Living Television</p>
          <h1 class="display">Where Martha went.</h1>
          {places.length > 0 ? (
            <p class="caption" style="font-size:var(--size-body);font-style:italic;color:var(--mid-gray);margin-top:var(--space-2);max-width:var(--measure-prose);">
              {places.length} farms, bakeries, museums, gardens, and field-trip destinations drawn from
              the marthastewart.tv archive. Some you've heard of (Balthazar, the Metropolitan Museum).
              Some you haven't (Murray McMurray Hatchery, Peckerwood Garden, Gilberties Herb Farm).
            </p>
          ) : (
            <p class="caption" style="font-size:var(--size-body);font-style:italic;color:var(--mid-gray);margin-top:var(--space-2);max-width:var(--measure-prose);">
              No places are loaded yet — this hub is populated by the entity pipeline
              (see “A note on data completeness” in the README).
            </p>
          )}
          <p style="margin-top:var(--space-3);">
            <a href="/places/map" class="smallcap-eyebrow" style="color:var(--body-text);text-decoration-thickness:0.5px;">
              View on the atlas →
            </a>
          </p>
        </header>

        {GROUP_ORDER.map((groupKey) => {
          const list = groups.get(groupKey);
          if (!list || list.length === 0) return null;
          return (
            <section style="margin-bottom:var(--space-7);">
              <p class="smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-3);">{groupKey}</p>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--space-3) var(--space-5);">
                {list.map((p) => (
                  <a href={`/places/${p.slug}`} style="text-decoration:none;color:inherit;display:block;padding:var(--space-2) 0;border-bottom:var(--hairline-thin);">
                    <div style="display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-2);">
                      <span style="font-family:var(--font-body);font-size:1.05rem;color:var(--body-text);">{p.name}</span>
                      <span style="font-family:var(--font-display);font-size:1.2rem;color:var(--bedford-gray);">{p.mentions}</span>
                    </div>
                    <p class="caption" style="margin-top:4px;color:var(--bedford-gray);font-size:0.75rem;">
                      {KIND_LABEL[p.kind] ?? p.kind}
                    </p>
                    {p.role && (
                      <p style="margin-top:4px;font-size:var(--size-caption);color:var(--mid-gray);line-height:1.4;">
                        {p.role.length > 160 ? p.role.slice(0, 160) + "…" : p.role}
                      </p>
                    )}
                  </a>
                ))}
              </div>
            </section>
          );
        })}

        <hr class="hairline" />

        <section style="margin-top:var(--space-6);margin-bottom:var(--space-4);">
          <p class="smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-3);">Alphabetical</p>
          <nav style="display:flex;flex-wrap:wrap;gap:var(--space-1) var(--space-2);margin-bottom:var(--space-4);" aria-label="Jump to letter">
            {letters.map((l) => (
              <a href={`#letter-${l}`} class="smallcap-eyebrow"
                 style="color:var(--body-text);text-decoration:none;padding:2px var(--space-1);">{l}</a>
            ))}
          </nav>
          {letters.map((l) => (
            <section id={`letter-${l}`} style="margin-bottom:var(--space-3);">
              <p style="font-family:var(--font-display);font-size:2rem;line-height:1;color:var(--bedford-gray);margin-bottom:var(--space-1);">{l}</p>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--space-1) var(--space-4);">
                {(alpha.get(l) ?? []).map((p) => (
                  <a href={`/places/${p.slug}`} style="text-decoration:none;color:inherit;padding:2px 0;border-bottom:var(--hairline-thin);display:flex;justify-content:space-between;gap:var(--space-2);">
                    <span>{p.name}</span>
                    <span style="color:var(--bedford-gray);font-size:0.75rem;">{KIND_LABEL[p.kind] ?? p.kind}</span>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </section>

        <p class="caption" style="margin-top:var(--space-7);color:var(--bedford-gray);max-width:var(--measure-prose);">
          Field-trip subjects are extracted from MSL TV segment descriptions on marthastewart.tv.
          Curated entries include researched context (founding, location, link to Martha); discovered
          entries show only the segment they appeared in.
        </p>
      </div>
    </Layout>,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// /places/map — illustrated atlas of every researched Martha-orbit place.
// Hand-curated coords in data/places-geo.json. Tiles via CARTO Positron with
// a sepia/parchment CSS filter applied client-side.
// ─────────────────────────────────────────────────────────────────────────────
placesRoute.get("/places/map", async (c) => {
  // Force every visitor to the latest HTML — Safari was caching the older
  // bare-less version. Asset URLs already carry ?v=BUILD_ID so once the
  // fresh HTML arrives the new CSS/JS pulls through too.
  c.header("Cache-Control", "no-cache, no-store, must-revalidate");
  c.header("Pragma", "no-cache");
  c.header("Expires", "0");
  const places = await sql<PlaceRow[]>`
    SELECT slug, name, kind, role, mentions
    FROM mst_entities
    WHERE entity_type = 'place'
    ORDER BY mentions DESC, name ASC
  `;

  const coords = allCoords();
  // Build the dataset the client will consume.
  const mapPoints = places
    .filter((p) => coords[p.slug])
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      kind: p.kind,
      role: p.role ? (p.role.length > 200 ? p.role.slice(0, 200) + "…" : p.role) : null,
      mentions: p.mentions,
      lat: coords[p.slug]![0],
      lng: coords[p.slug]![1],
    }));

  const unmappedCount = places.length - mapPoints.length;

  return c.html(
    <Layout
      title="Atlas — Where Martha Went"
      description={`Every farm, bakery, museum, gallery, garden, and field-trip destination featured on Martha Stewart programming, mapped. ${mapPoints.length} located, ${unmappedCount} yet to be pinned.`}
      canonical={canonical("/places/map")}
      jsonLd={[breadcrumbsJsonLd([
        { name: "Archive", url: canonical("/") },
        { name: "Places", url: canonical("/places") },
        { name: "Atlas", url: canonical("/places/map") },
      ])]}
      bare
      head={
        <>
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
          <link rel="stylesheet" href="/static/styles/places-map.css" />
        </>
      }
    >
      <div class="atlas atlas--fullscreen">
        <header class="atlas-bar">
          <a href="/places" class="atlas-bar__back" aria-label="Back to places">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M14 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </a>
          <span class="atlas-bar__title">Where Martha went</span>
          <span class="atlas-bar__count">{mapPoints.length}</span>
        </header>

        <div id="atlas-map" role="region" aria-label="Atlas of Martha-orbit places"></div>

        <nav class="atlas-chips" aria-label="Filter by kind">
          <button type="button" class="atlas-chip atlas-chip--all is-active" data-kind="all">All</button>
          <button type="button" class="atlas-chip" data-kind="residence">Residences</button>
          <button type="button" class="atlas-chip" data-kind="business">Businesses</button>
          <button type="button" class="atlas-chip" data-kind="museum">Museums</button>
          <button type="button" class="atlas-chip" data-kind="garden">Gardens</button>
          <button type="button" class="atlas-chip" data-kind="farm">Farms</button>
          <button type="button" class="atlas-chip" data-kind="historic-house">Historic</button>
          <button type="button" class="atlas-chip" data-kind="event">Events</button>
          <button type="button" class="atlas-chip" data-kind="location">Locations</button>
        </nav>

        <aside id="atlas-sheet" class="atlas-sheet" aria-hidden="true" role="dialog" aria-label="Place details">
          <button type="button" class="atlas-sheet__close" aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </button>
          <div id="atlas-sheet-body"></div>
        </aside>

        {/* Bottom tab bar — mirrors the /m/ SPA so navigation feels the
            same on every page. "Map" is the active item here. */}
        <nav class="atlas-tabbar" role="navigation" aria-label="Main navigation">
          <a class="atlas-tabbar__item" href="/m/" aria-label="Home">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <rect x="13.5" y="1.5" width="2.5" height="5" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
              <polyline points="1,11 11,3 21,11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              <line x1="2" y1="11" x2="20" y2="11" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
              <rect x="3" y="11" width="16" height="9.5" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
              <path d="M9.5 20.5V16C9.5 15.2 10 14.8 11 14.8S12.5 15.2 12.5 16V20.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
              <rect x="4.5" y="13" width="3" height="3" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
              <line x1="6" y1="13" x2="6" y2="16" stroke="currentColor" stroke-width="0.8"/>
              <line x1="4.5" y1="14.5" x2="7.5" y2="14.5" stroke="currentColor" stroke-width="0.8"/>
              <rect x="14.5" y="13" width="3" height="3" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
              <line x1="16" y1="13" x2="16" y2="16" stroke="currentColor" stroke-width="0.8"/>
              <line x1="14.5" y1="14.5" x2="17.5" y2="14.5" stroke="currentColor" stroke-width="0.8"/>
            </svg>
            <span>Home</span>
          </a>
          <a class="atlas-tabbar__item" href="/m/guests" aria-label="Guest index">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <circle cx="11" cy="8" r="4" stroke="currentColor" stroke-width="1.6"/>
              <path d="M3 20c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
            </svg>
            <span>Guests</span>
          </a>
          <a class="atlas-tabbar__item is-active" href="/places/map" aria-label="Atlas — where Martha went" aria-current="page">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <path d="M11 2.5c-3 0-5.5 2.4-5.5 5.5 0 4.2 5.5 11.5 5.5 11.5s5.5-7.3 5.5-11.5C16.5 4.9 14 2.5 11 2.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
              <circle cx="11" cy="8" r="2" stroke="currentColor" stroke-width="1.4"/>
            </svg>
            <span>Map</span>
          </a>
          <a class="atlas-tabbar__item" href="/m/random" aria-label="Random episode">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="9" stroke="currentColor" stroke-width="1.6"/>
              <circle cx="11" cy="11" r="2" fill="currentColor"/>
              <circle cx="7" cy="8" r="1.2" fill="currentColor"/>
              <circle cx="15" cy="8" r="1.2" fill="currentColor"/>
              <circle cx="7" cy="14" r="1.2" fill="currentColor"/>
              <circle cx="15" cy="14" r="1.2" fill="currentColor"/>
            </svg>
            <span>Random</span>
          </a>
          <a class="atlas-tabbar__item" href="/m/about" aria-label="About">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="9" stroke="currentColor" stroke-width="1.6"/>
              <line x1="11" y1="10" x2="11" y2="16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              <circle cx="11" cy="7" r="1.1" fill="currentColor"/>
            </svg>
            <span>About</span>
          </a>
        </nav>

        <script id="atlas-data" type="application/json" dangerouslySetInnerHTML={{ __html: safeJsonForScriptTag(mapPoints) }}></script>
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
        <script src="/static/scripts/places-map.js" defer></script>
      </div>
    </Layout>,
  );
});

placesRoute.get("/places/:slug", async (c) => {
  const slug = c.req.param("slug");
  const rows = await sql<PlaceRow[]>`
    SELECT slug, name, kind, role, mentions
    FROM mst_entities
    WHERE entity_type = 'place' AND slug = ${slug}
    LIMIT 1
  `;
  if (!rows.length) return c.notFound();
  const place = rows[0]!;
  const wikiLinks = wikiLinksFor(place.slug, "place");

  const [connections, eps] = await Promise.all([
    fetchConnections(slug, 10),
    sql<Array<{
      id: string;
      title: string;
      season: number | null;
      air_year: number | null;
      photo_url: string | null;
      context: string | null;
    }>>`
      SELECT e.id, e.title, e.season, e.air_year, e.photo_url, mee.context
      FROM mst_episode_entities mee
      JOIN episodes e ON e.id = mee.episode_id
      WHERE mee.entity_slug = ${slug}
      ORDER BY COALESCE(e.air_date, make_date(COALESCE(e.air_year, 1993), COALESCE(e.air_month, 1), 1)) ASC NULLS LAST, e.season ASC, e.title ASC
    `,
  ]);

  return c.html(
    <Layout
      title={place.name}
      description={place.role ?? `${place.name} was featured on Martha Stewart Living Television.`}
      canonical={canonical(`/places/${slug}`)}
      jsonLd={[breadcrumbsJsonLd([
        { name: "Archive", url: canonical("/") },
        { name: "Places", url: canonical("/places") },
        { name: place.name, url: canonical(`/places/${slug}`) },
      ])]}
    >
      <div class="page" style="padding-top:var(--space-5);padding-bottom:var(--space-8);">
        <p class="smallcap-eyebrow" style="margin-bottom:var(--space-2);">
          <a href="/places" style="color:var(--body-text);">Places</a>
        </p>
        <h1 class="display" style="margin-bottom:var(--space-2);">{place.name}</h1>
        <p class="caption" style="color:var(--bedford-gray);margin-bottom:var(--space-3);">
          {KIND_LABEL[place.kind] ?? place.kind} · {place.mentions} appearance{place.mentions === 1 ? "" : "s"}
        </p>
        {place.role && (
          <p class="lede" style="max-width:var(--measure-prose);margin-bottom:var(--space-5);">{place.role}</p>
        )}
        {wikiLinks.length > 0 && (
          <p class="caption" style="font-style:italic;color:var(--bedford-gray);max-width:var(--measure-prose);margin-top:calc(-1 * var(--space-3));margin-bottom:var(--space-5);">
            Main article on the research wiki:{" "}
            {wikiLinks.map((l, i) => (
              <>
                {i > 0 && " · "}
                <a href={l.href} target="_blank" rel="noopener" style="color:var(--body-text);text-decoration-thickness:0.5px;">{l.label}</a>
              </>
            ))}
          </p>
        )}

        <hr class="hairline" style="margin-bottom:var(--space-5);" />

        {connections.length > 0 && (
          <section style="margin-bottom:var(--space-6);">
            <p class="smallcap-eyebrow" style="margin-bottom:var(--space-3);">Often featured alongside</p>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:var(--space-2) var(--space-4);">
              {connections.map((c) => (
                <a href={`/${c.entity_type === "person" ? "people" : "places"}/${c.slug}`}
                   style="text-decoration:none;color:inherit;display:block;padding:var(--space-1) 0;border-bottom:var(--hairline-thin);">
                  <div style="display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-2);">
                    <span style="font-family:var(--font-body);">{c.name}</span>
                    <span style="font-family:var(--font-display);color:var(--bedford-gray);font-size:1.05rem;">{c.shared}</span>
                  </div>
                  <p class="caption" style="margin-top:2px;color:var(--bedford-gray);font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;">
                    {c.entity_type === "person" ? c.kind : `${c.kind} · place`}
                  </p>
                </a>
              ))}
            </div>
          </section>
        )}

        <p class="smallcap-eyebrow" style="margin-bottom:var(--space-3);">Featured in</p>
        {eps.length === 0 && (
          <p class="caption" style="color:var(--bedford-gray);font-style:italic;max-width:var(--measure-prose);">
            Documented as a Martha-orbit location in the research notes above; matching it to a specific
            MSL TV episode is open work. The vhx segment descriptions don't name it directly.
          </p>
        )}
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--space-4);">
          {eps.map((e) => (
            <a href={`/episodes/${e.id}`} style="text-decoration:none;color:inherit;display:block;">
              {e.photo_url ? (
                <div style="aspect-ratio:16/9;overflow:hidden;background:var(--bedford-gray);">
                  <img src={e.photo_url} alt={e.title} loading="lazy" style="width:100%;height:100%;object-fit:cover;" />
                </div>
              ) : (
                <div style="aspect-ratio:16/9;background:var(--eggshell);" aria-hidden="true" />
              )}
              <p style="margin-top:var(--space-1);font-family:var(--font-body);">{e.title}</p>
              <p class="caption" style="color:var(--bedford-gray);font-size:var(--size-caption);">
                Season {e.season ?? "—"} · {e.air_year ?? "—"}
              </p>
              {e.context && (
                <p class="caption" style="font-style:italic;color:var(--bedford-gray);font-size:0.75rem;margin-top:2px;">
                  {e.context.length > 90 ? e.context.slice(0, 90) + "…" : e.context}
                </p>
              )}
            </a>
          ))}
        </div>
      </div>
    </Layout>,
  );
});
