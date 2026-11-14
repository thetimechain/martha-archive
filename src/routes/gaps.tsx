import { Hono } from "hono";
import { eq, asc } from "drizzle-orm";
import { marked } from "marked";
import { Layout } from "../views/components/Layout.js";
import { db } from "../db/client.js";
import { staticContent, importGaps } from "../db/schema.js";
import { fetchGradeCounts, fetchLastImport, fetchRowCounts } from "../db/queries.js";
import { GRADE_LABEL, GRADE_TEXT } from "../lib/honesty.js";

export const gapsRoute = new Hono();

gapsRoute.get("/gaps", async (c) => {
  const [contentRow, gaps, lastImport, counts, grades] = await Promise.all([
    db.select().from(staticContent).where(eq(staticContent.slug, "gaps")).limit(1),
    db.select().from(importGaps).orderBy(asc(importGaps.showSlug), asc(importGaps.season)),
    fetchLastImport(),
    fetchRowCounts(),
    fetchGradeCounts(),
  ]);
  const md = contentRow[0]?.bodyMd;
  const html = md ? String(marked.parse(md, { breaks: false, gfm: true })) : "";
  const bySlug = new Map<string, typeof gaps>();
  for (const g of gaps) {
    const k = g.showSlug ?? "general";
    if (!bySlug.has(k)) bySlug.set(k, []);
    bySlug.get(k)!.push(g);
  }

  return c.html(
    <Layout
      title="What we don't know yet — Martha: An Archive"
      description="Research honesty: the documented gaps in the Martha Stewart television archive."
      footerMeta={{ lastImport: lastImport?.finishedAt?.toISOString(), episodeCount: counts.episodes_titled ?? 0 }}
    >
      <article class="prose-column page">
        <h1>What we don't know yet.</h1>
        <p class="caption" style="font-style:italic;">
          A record of the missing — the episodes whose titles, dates, or details are not yet in any accessible public database.
        </p>

        {html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <p>
            The archive prefers to say what it does not know. Below is every documented gap from the most recent import — episodes
            counted but unnamed, seasons whose details did not survive their networks. Cross-references and footnotes follow.
          </p>
        )}

        <section>
          <h2>How well each record is supported</h2>
          <dl>
            {(["confirmed", "single", "partial", "inferred"] as const).map((g) => (
              <>
                <dt>
                  <span class={`confidence-badge confidence-badge--${g}`}>{GRADE_LABEL[g]}</span> {(grades[g] ?? 0).toLocaleString()} episodes
                </dt>
                <dd>{GRADE_TEXT[g]}</dd>
              </>
            ))}
          </dl>
        </section>

        {bySlug.size > 0 && (
          <section>
            <h2>By show</h2>
            <dl>
              {Array.from(bySlug.entries()).map(([slug, list]) => (
                <>
                  <dt>{slug}</dt>
                  {list.map((g) => (
                    <dd>
                      {g.season !== null && <em>Season {g.season}.</em>} {g.gapReason}
                      {g.sourceNote && <span class="caption"> — {g.sourceNote}</span>}
                    </dd>
                  ))}
                </>
              ))}
            </dl>
          </section>
        )}
      </article>
    </Layout>,
  );
});
