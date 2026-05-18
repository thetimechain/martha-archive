import { Hono } from "hono";
import { eq, asc } from "drizzle-orm";
import { marked } from "marked";
import { Layout } from "../views/components/Layout.js";
import { PaletteSwatch } from "../views/components/PaletteSwatch.js";
import { TypeRamp } from "../views/components/TypeRamp.js";
import { MotifGrid } from "../views/components/MotifGrid.js";
import { db } from "../db/client.js";
import { paletteColors, staticContent } from "../db/schema.js";
import { fetchLastImport, fetchRowCounts } from "../db/queries.js";

export const designSystemRoute = new Hono();

let cachedHtml: { mtime: number; html: string } | null = null;

designSystemRoute.get("/design-system", async (c) => {
  const [palettes, content, lastImport, counts] = await Promise.all([
    db.select().from(paletteColors).orderBy(asc(paletteColors.paletteGroup), asc(paletteColors.sortOrder)),
    db.select().from(staticContent).where(eq(staticContent.slug, "design-system-1990s")).limit(1),
    fetchLastImport(),
    fetchRowCounts(),
  ]);

  const md = content[0]?.bodyMd ?? "";
  let html = "";
  if (md) {
    if (cachedHtml && cachedHtml.mtime === content[0]!.updatedAt.valueOf()) {
      html = cachedHtml.html;
    } else {
      html = String(marked.parse(md, { breaks: false, gfm: true }));
      cachedHtml = { mtime: content[0]!.updatedAt.valueOf(), html };
    }
  }

  const grouped = new Map<string, typeof palettes>();
  for (const p of palettes) {
    if (!grouped.has(p.paletteGroup)) grouped.set(p.paletteGroup, []);
    grouped.get(p.paletteGroup)!.push(p);
  }

  const motifs = [
    "Eggs",
    "Lemons",
    "Pumpkins",
    "Hydrangeas",
    "Linen",
    "Burlap",
    "Copper",
    "Beeswax",
  ];

  return c.html(
    <Layout
      title="The design — 1990s Martha Stewart Living"
      description="A living style guide for the 1990s Martha Stewart Living identity."
      footerMeta={{ lastImport: lastImport?.finishedAt?.toISOString(), episodeCount: counts.episodes ?? 0 }}
    >
      <div class="page" style="padding-top:var(--space-4);">
        <header class="hero">
          <p class="smallcap-eyebrow" style="margin-bottom:var(--space-2);">The design</p>
          <h1 class="display">A 1990s identity, faithfully kept.</h1>
          <p class="lede">
            The palette, the type, the small things. Drawn from Martha Stewart Living, 1990 to 1999, art-directed by Gael Towey.
          </p>
        </header>

        <section class="section">
          <p class="section-eyebrow">Palette</p>
          <h2 class="display-smaller">Three palettes, one mood</h2>
          {grouped.size === 0 ? (
            <p class="caption">The palette is being prepared. Run the import job to populate it.</p>
          ) : (
            Array.from(grouped.entries()).map(([group, items]) => (
              <div style="margin-top:var(--space-4);">
                <h3 class="smallcap-eyebrow" style="color:var(--body-text);">{prettyGroup(group)}</h3>
                <div
                  class="archive-grid"
                  style="grid-template-columns:repeat(4,1fr);gap:var(--space-3) var(--space-3);margin-top:var(--space-2);"
                >
                  {items.map((p) => (
                    <PaletteSwatch name={p.name} hex={p.hex} role={p.role} notes={p.notes} />
                  ))}
                </div>
              </div>
            ))
          )}
        </section>

        <section class="section">
          <p class="section-eyebrow">Type</p>
          <h2 class="display-smaller">The voice on the page</h2>
          <TypeRamp />
        </section>

        <section class="section">
          <p class="section-eyebrow">Motifs</p>
          <h2 class="display-smaller">The dignity of small things</h2>
          <MotifGrid items={motifs} />
        </section>

        <section class="section">
          <p class="section-eyebrow">Editorial voice</p>
          <h2 class="display-smaller">Declarative. Calm. Instructive.</h2>
          <div class="good-things">
            <article class="good-thing"><blockquote>It is a good thing.</blockquote><cite>The watchword</cite></article>
            <article class="good-thing"><blockquote>Begin with the best ingredients.</blockquote><cite>Cooking</cite></article>
            <article class="good-thing"><blockquote>Photograph wanted.</blockquote><cite>Where an image would have been</cite></article>
          </div>
        </section>

        {html && (
          <section class="section">
            <p class="section-eyebrow">Notes</p>
            <h2 class="display-smaller">The brief, as written</h2>
            <div class="prose-column" style="padding-top:var(--space-2);" dangerouslySetInnerHTML={{ __html: html }} />
          </section>
        )}
      </div>
    </Layout>,
  );
});

function prettyGroup(g: string): string {
  return g
    .split(/[-_]/g)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}
