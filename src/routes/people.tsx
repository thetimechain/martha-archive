import { Hono } from "hono";
import { Layout } from "../views/components/Layout.js";
import { fetchLastImport, fetchRowCounts, fetchUnifiedPeople, fetchPersonDetail, fetchConnections } from "../db/queries.js";
import { canonical, breadcrumbsJsonLd } from "../lib/seo.js";
import { wikiLinksFor } from "../lib/wiki-links.js";

export const peopleRoute = new Hono();

const KIND_LABEL: Record<string, string> = {
  contributor: "Recurring contributor",
  chef: "Chef",
  family: "Family",
  guest: "Guest",
  celebrity: "Celebrity guest",
};

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

peopleRoute.get("/people", async (c) => {
  const [people, lastImport, counts] = await Promise.all([
    fetchUnifiedPeople(),
    fetchLastImport(),
    fetchRowCounts(),
  ]);

  const recurring = people.filter((p) => p.total >= 3);
  const handful = people.filter((p) => p.total === 2);
  const once = people.filter((p) => p.total === 1);

  // alphabetical index
  const alpha = new Map<string, typeof people>();
  for (const p of people) {
    const letter = p.name.trim().charAt(0).toUpperCase();
    if (!alpha.has(letter)) alpha.set(letter, []);
    alpha.get(letter)!.push(p);
  }
  const letters = [...alpha.keys()].sort();

  const PersonRow = ({ p }: { p: typeof people[number] }) => (
    <a href={`/people/${p.slug}`} style="text-decoration:none;color:inherit;display:block;padding:var(--space-2) 0;border-bottom:var(--hairline-thin);">
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-2);">
        <span style="font-family:var(--font-body);">{p.name}</span>
        <span style="font-family:var(--font-display);color:var(--mid-gray);font-size:1.2rem;">{p.total}</span>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;align-items:center;">
        {p.shows.slice(0, 4).map((s) => (
          <span style="font-family:var(--font-display);font-size:9px;letter-spacing:0.08em;padding:1px 5px;border:1px solid var(--bedford-gray);color:var(--mid-gray);">
            {SHOW_SHORT[s] ?? s.toUpperCase().slice(0, 7)}
          </span>
        ))}
        <span class="caption" style="font-size:0.7rem;color:var(--mid-gray);">
          {KIND_LABEL[p.kind] ?? p.kind}
        </span>
      </div>
      {p.role && p.total >= 3 && (
        <p style="margin-top:4px;font-size:0.78rem;color:var(--mid-gray);line-height:1.4;">
          {p.role.length > 180 ? p.role.slice(0, 180) + "…" : p.role}
        </p>
      )}
    </a>
  );

  return c.html(
    <Layout
      title="People"
      description={`${people.length} people who appeared on a Martha Stewart television program across four decades — Marc Morrone, Mrs. Kostyra, Snoop Dogg, Aretha Franklin, Bill Clinton, Conan O'Brien, Mario Batali, Helen Mirren, Jacques Pépin, and many more.`}
      canonical={canonical("/people")}
      jsonLd={[breadcrumbsJsonLd([{ name: "Archive", url: canonical("/") }, { name: "People", url: canonical("/people") }])]}
      footerMeta={{ lastImport: lastImport?.finishedAt?.toISOString(), episodeCount: counts.episodes ?? 0 }}
    >
      <div class="page" style="padding-top:var(--space-5);padding-bottom:var(--space-8);">
        <header style="border-bottom:var(--hairline-bold);padding-bottom:var(--space-4);margin-bottom:var(--space-6);">
          <p class="smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-2);">The archive</p>
          <h1 class="display">Everyone who was there.</h1>
          <p class="caption" style="font-size:var(--size-body);font-style:italic;color:var(--mid-gray);margin-top:var(--space-2);max-width:var(--measure-prose);">
            {people.length} named people across {counts.episodes?.toLocaleString() ?? "—"} episodes —
            the recurring 1990s cast (Marc Morrone, Mrs. Kostyra, Salli LaGrone), the master chefs
            (Eric Ripert, Anne Willan, Diana Kennedy, Mario Batali), and the parade of celebrities
            from Martha's daytime show (Aretha Franklin, Snoop Dogg, Conan O'Brien, Bill Clinton,
            Helen Mirren, Kermit the Frog).
          </p>
        </header>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-5);border-top:var(--hairline);padding-top:var(--space-4);margin-bottom:var(--space-7);">
          <div>
            <p style="font-family:var(--font-display);font-size:var(--size-display-xl);line-height:1;">{people.length}</p>
            <p class="caption" style="margin-top:var(--space-1);">named people</p>
          </div>
          <div>
            <p style="font-family:var(--font-display);font-size:var(--size-display-xl);line-height:1;">{recurring.length}</p>
            <p class="caption" style="margin-top:var(--space-1);">three or more appearances</p>
          </div>
          <div>
            <p style="font-family:var(--font-display);font-size:var(--size-display-xl);line-height:1;">{people[0]?.total ?? 0}</p>
            <p class="caption" style="margin-top:var(--space-1);">most appearances</p>
            <p style="font-size:var(--size-caption);color:var(--mid-gray);margin-top:4px;">{people[0]?.name}</p>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-8);align-items:start;">

          <div>
            {recurring.length > 0 && (
              <section style="margin-bottom:var(--space-6);">
                <p class="smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-3);">
                  Recurring — three or more appearances
                </p>
                {recurring.map((p) => <PersonRow p={p} />)}
              </section>
            )}

            {handful.length > 0 && (
              <section style="margin-bottom:var(--space-6);">
                <p class="smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-3);">
                  Appeared twice
                </p>
                {handful.map((p) => <PersonRow p={p} />)}
              </section>
            )}
          </div>

          <div>
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
            <p class="smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-3);">Alphabetical</p>

            {letters.map((l) => (
              <section id={`letter-${l}`} style="margin-bottom:var(--space-4);">
                <p style="font-family:var(--font-display);font-size:2.5rem;line-height:1;color:var(--mid-gray);margin-bottom:var(--space-1);">{l}</p>
                {(alpha.get(l) ?? []).map((p) => <PersonRow p={p} />)}
              </section>
            ))}
          </div>

        </div>

        <p class="caption" style="margin-top:var(--space-7);color:var(--mid-gray);max-width:var(--measure-prose);">
          People come from two sources: structured guest records seeded from broadcast research (mostly
          The Martha Stewart Show, Cooking School, and Martha & Snoop's), plus entities extracted from
          marthastewart.tv segment descriptions (mostly Martha Stewart Living Television, 1993–2004).
          Coverage of celebrity guests on the 2005–2012 talk show is incomplete — we have what was
          documented at the time. Single mentions are listed in the alphabetical index.
        </p>

      </div>
    </Layout>,
  );
});

peopleRoute.get("/people/:slug", async (c) => {
  const slug = c.req.param("slug");
  const [{ person, appearances }, connections] = await Promise.all([
    fetchPersonDetail(slug),
    fetchConnections(slug, 10),
  ]);
  if (!person) return c.notFound();
  const wikiLinks = wikiLinksFor(person.slug, "person");

  return c.html(
    <Layout
      title={person.name}
      description={person.role ?? `${person.name} appeared on Martha Stewart television.`}
      canonical={canonical(`/people/${person.slug}`)}
      jsonLd={[breadcrumbsJsonLd([
        { name: "Archive", url: canonical("/") },
        { name: "People", url: canonical("/people") },
        { name: person.name, url: canonical(`/people/${person.slug}`) },
      ])]}
    >
      <div class="page" style="padding-top:var(--space-5);padding-bottom:var(--space-8);">
        <p class="smallcap-eyebrow" style="margin-bottom:var(--space-2);">
          <a href="/people" style="color:var(--body-text);">People</a>
        </p>
        <h1 class="display" style="margin-bottom:var(--space-2);">{person.name}</h1>
        <p class="caption" style="color:var(--mid-gray);margin-bottom:var(--space-3);">
          {KIND_LABEL[person.kind] ?? person.kind} ·{" "}
          {person.total} appearance{person.total === 1 ? "" : "s"}
          {person.shows.length > 0 && (
            <>
              {" · "}
              {person.shows.map((s, i) => (
                <>
                  {i > 0 && ", "}
                  <a href={`/shows/${s}`} style="color:var(--mid-gray);">{SHOW_SHORT[s] ?? s}</a>
                </>
              ))}
            </>
          )}
        </p>
        {person.role && (
          <p class="lede" style="max-width:var(--measure-prose);margin-bottom:var(--space-5);">{person.role}</p>
        )}
        {wikiLinks.length > 0 && (
          <p class="caption" style="font-style:italic;color:var(--mid-gray);max-width:var(--measure-prose);margin-top:calc(-1 * var(--space-3));margin-bottom:var(--space-5);">
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
            <p class="smallcap-eyebrow" style="margin-bottom:var(--space-3);">Often appeared with</p>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:var(--space-2) var(--space-4);">
              {connections.map((c) => (
                <a href={`/${c.entity_type === "person" ? "people" : "places"}/${c.slug}`}
                   style="text-decoration:none;color:inherit;display:block;padding:var(--space-1) 0;border-bottom:var(--hairline-thin);">
                  <div style="display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-2);">
                    <span style="font-family:var(--font-body);">{c.name}</span>
                    <span style="font-family:var(--font-display);color:var(--mid-gray);font-size:1.05rem;">{c.shared}</span>
                  </div>
                  <p class="caption" style="margin-top:2px;color:var(--mid-gray);font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;">
                    {c.entity_type === "person" ? c.kind : `${c.kind} · place`}
                  </p>
                </a>
              ))}
            </div>
          </section>
        )}

        <p class="smallcap-eyebrow" style="margin-bottom:var(--space-3);">Appearances</p>
        {appearances.length === 0 && (
          <p class="caption" style="color:var(--mid-gray);font-style:italic;max-width:var(--measure-prose);">
            No specific episode appearances have been cross-referenced yet. Their connection to Martha
            is documented in the bio above; matching them to a specific MSL TV episode is open work.
          </p>
        )}
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--space-4);">
          {appearances.map((e) => (
            <a href={`/episodes/${e.episode_id}`} style="text-decoration:none;color:inherit;display:block;">
              {e.photo_url ? (
                <div style="aspect-ratio:16/9;overflow:hidden;background:var(--bedford-gray);">
                  <img src={e.photo_url} alt={e.title} loading="lazy" style="width:100%;height:100%;object-fit:cover;" />
                </div>
              ) : (
                <div style="aspect-ratio:16/9;background:var(--eggshell);" aria-hidden="true" />
              )}
              <p style="margin-top:var(--space-1);font-family:var(--font-body);">{e.title}</p>
              <p class="caption" style="color:var(--mid-gray);font-size:var(--size-caption);">
                {e.show_name ?? e.show_slug}
                {e.air_year ? ` · ${e.air_year}` : ""}
              </p>
              {e.context && (
                <p class="caption" style="font-style:italic;color:var(--mid-gray);font-size:0.75rem;margin-top:2px;">
                  {e.context.length > 120 ? e.context.slice(0, 120) + "…" : e.context}
                </p>
              )}
            </a>
          ))}
        </div>
      </div>
    </Layout>,
  );
});
