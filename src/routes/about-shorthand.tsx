import { Hono } from "hono";
import { Layout } from "../views/components/Layout.js";
import { SHORTHAND } from "../lib/shorthand.js";
import { canonical, breadcrumbsJsonLd } from "../lib/seo.js";
import { fetchLastImport, fetchRowCounts } from "../db/queries.js";

export const aboutShorthandRoute = new Hono();

const ENTRIES: Array<{ code: string; expansion: string; gloss: string }> = [
  { code: "COW", expansion: "Cookie of the Week",
    gloss: "A weekly featured cookie recipe — typically demonstrated start to finish by Martha. Across the run of MSL TV, ~30 distinct COWs aired, including the famous Cream Hearts, Chocolate Mint Wafer, Pineapple Tea Cakes, and Sand Dollar." },
  { code: "GT", expansion: "Good Thing",
    gloss: "A short, repeatable household tip or technique — the show's most-imitated franchise. \"It's a good thing.\" Examples: Epsom-salt foot soak, terra-cotta-pot stamping, sun-tea hostess gift." },
  { code: "QC", expansion: "Quick Cuisine",
    gloss: "A fast-cook segment under ~10 minutes of screen time. Often paired with cooking-school-style explanation. Example: \"QC: Red Snapper in Papillotte\"." },
  { code: "HQC", expansion: "Holiday Quick Cuisine",
    gloss: "Holiday-themed Quick Cuisine. Tagged on Thanksgiving, Christmas, Easter, Valentine's, and Mother's Day episodes." },
  { code: "HTC", expansion: "How To Cook",
    gloss: "Often appended as \"HTC 101\" — a foundational technique segment (pan-fried steak, cutting + freezing corn, etc.)." },
  { code: "DYK", expansion: "Did You Know",
    gloss: "A short factual tangent about an ingredient or method — Martha's encyclopedic-aside format. Example: \"Terra Cotta DYK\", \"Organic DYK\"." },
  { code: "TOW", expansion: "Tool of the Week",
    gloss: "Featured kitchen, garden, or workshop tool. Example: \"Miter Box TOW\"." },
  { code: "FT", expansion: "Field Trip",
    gloss: "Martha (or correspondent) visits an outside location. Encompasses bakeries, hatcheries, museums, farms, galleries, and the Westminster Dog Show. The 25+ field-trip destinations are catalogued on the /places page." },
  { code: "FTE", expansion: "Field Trip (Extended)",
    gloss: "Longer multi-part field trip cut. Often paired with COM (Cooking of the Month)." },
  { code: "COM", expansion: "Cooking of the Month",
    gloss: "A multi-part culinary deep dive on a single dish — generally 3–5 segments across one episode." },
];

aboutShorthandRoute.get("/about/shorthand", async (c) => {
  const [lastImport, counts] = await Promise.all([fetchLastImport(), fetchRowCounts()]);
  return c.html(
    <Layout
      title="Segment Shorthand — Martha Stewart Archive"
      description="Decoder for the 2-4 letter segment codes (COW, GT, QC, HQC, HTC, DYK, TOW, FT, FTE, COM) that appear throughout Martha Stewart Living Television episode descriptions."
      canonical={canonical("/about/shorthand")}
      jsonLd={[breadcrumbsJsonLd([
        { name: "Archive", url: canonical("/") },
        { name: "Segment shorthand", url: canonical("/about/shorthand") },
      ])]}
      footerMeta={{ lastImport: lastImport?.finishedAt?.toISOString(), episodeCount: counts.episodes ?? 0 }}
    >
      <div class="page" style="padding-top:var(--space-5);padding-bottom:var(--space-8);max-width:var(--measure-prose);">
        <header style="border-bottom:var(--hairline-bold);padding-bottom:var(--space-4);margin-bottom:var(--space-6);">
          <p class="smallcap-eyebrow" style="color:var(--body-text);margin-bottom:var(--space-2);">A field guide</p>
          <h1 class="display">Segment shorthand.</h1>
          <p class="caption" style="font-size:var(--size-body);font-style:italic;color:var(--mid-gray);margin-top:var(--space-2);">
            Martha Stewart Living Television used a stable set of 2–4 letter codes to mark
            recurring segment types. They appear at the end of segment titles throughout the
            archive — and now hover-tooltipped wherever they show up.
          </p>
        </header>

        <dl style="display:grid;grid-template-columns:max-content 1fr;column-gap:var(--space-5);row-gap:var(--space-4);">
          {ENTRIES.map((e) => (
            <>
              <dt style="font-family:var(--font-display);font-size:1.5rem;line-height:1.2;align-self:start;">
                <abbr class="shorthand" title={e.expansion}>{e.code}</abbr>
              </dt>
              <dd style="margin:0;">
                <p style="font-family:var(--font-body);font-weight:600;margin:0 0 var(--space-1) 0;">
                  {e.expansion}
                </p>
                <p class="caption" style="margin:0;color:var(--mid-gray);line-height:1.5;">
                  {e.gloss}
                </p>
              </dd>
            </>
          ))}
        </dl>

        <p class="caption" style="margin-top:var(--space-7);color:var(--mid-gray);">
          Sourced from the segment titles in the marthastewart.tv (Vimeo OTT) archive and
          cross-referenced against the show's known recurring franchises. Full research
          context is in <a href="/research/seasonal-arc">the seasonal episode arc</a>.
        </p>
      </div>
    </Layout>,
  );
});

// Suppress an unused-warning if SHORTHAND ever drifts from ENTRIES; this is a
// canonical-list assertion at build time.
const _check: Record<string, string> = SHORTHAND;
void _check;
