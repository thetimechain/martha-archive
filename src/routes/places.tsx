import { Hono } from "hono";
import { Layout } from "../views/components/Layout.js";
import { sql } from "../db/client.js";
import { fetchLastImport, fetchRowCounts, fetchConnections } from "../db/queries.js";
import { canonical, breadcrumbsJsonLd } from "../lib/seo.js";
import { wikiLinksFor } from "../lib/wiki-links.js";

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
      title="Field Trips & Places — Martha Stewart Living Archive"
      description="Every farm, bakery, museum, gallery, garden, and location featured on Martha Stewart Living. From Murray McMurray Hatchery to Balthazar Bakery to Peckerwood Garden."
      canonical={canonical("/places")}
      jsonLd={[breadcrumbsJsonLd([{ name: "Archive", url: canonical("/") }, { name: "Places", url: canonical("/places") }])]}
      footerMeta={{ lastImport: lastImport?.finishedAt?.toISOString(), episodeCount: counts.episodes ?? 0 }}
    >
      <div class="page" style="padding-top:var(--space-5);padding-bottom:var(--space-8);">
        <header style="border-bottom:var(--hairline-bold);padding-bottom:var(--space-4);margin-bottom:var(--space-6);">
          <p class="smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-2);">Martha Stewart Living Television</p>
          <h1 class="display">Where Martha went.</h1>
          <p class="caption" style="font-size:var(--size-body);font-style:italic;color:var(--mid-gray);margin-top:var(--space-2);max-width:var(--measure-prose);">
            {places.length} farms, bakeries, museums, gardens, and field-trip destinations drawn from
            the marthastewart.tv archive. Some you've heard of (Balthazar, the Metropolitan Museum).
            Some you haven't (Murray McMurray Hatchery, Peckerwood Garden, Gilberties Herb Farm).
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

  const connections = await fetchConnections(slug, 10);

  const eps = await sql<Array<{
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
  `;

  return c.html(
    <Layout
      title={`${place.name} — Martha Stewart Living Archive`}
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
