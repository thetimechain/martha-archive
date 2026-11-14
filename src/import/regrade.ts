import "dotenv/config";
import { regradeAll, type GradeInput } from "../lib/honesty.js";

type Pg = import("postgres").Sql;

/** Recomputes grade, placeholder, synopsis, year-only and disputed-number columns over every row, including rows the seed import never touches. */
export async function regrade(pg: Pg) {
  const rows = await pg<
    {
      id: string;
      show_slug: string;
      title: string;
      description: string | null;
      confidence: string;
      single_source: boolean;
      air_date: string | null;
      air_precision: string | null;
      season: number | null;
      episode_number: number | null;
      tags: string[] | null;
    }[]
  >`
    SELECT e.id, e.show_slug, COALESCE(e.source_title, e.title) AS title, COALESCE(e.source_description, e.description) AS description, e.confidence::text AS confidence, e.single_source,
           to_char(e.air_date, 'YYYY-MM-DD') AS air_date, e.air_precision, e.season, e.episode_number,
           (SELECT array_agg(t.tag) FROM episode_tags t WHERE t.episode_id = e.id) AS tags
    FROM episodes e`;
  const input: GradeInput[] = rows.map((r) => ({
    id: r.id,
    showSlug: r.show_slug,
    title: r.title,
    description: r.description,
    confidence: r.confidence,
    singleSource: r.single_source,
    airDate: r.air_date,
    airPrecision: r.air_precision,
    season: r.season,
    episodeNumber: r.episode_number,
    tags: r.tags ?? [],
  }));
  const { out, disputes, yearOnly } = regradeAll(input);
  const original = new Map(input.map((r) => [r.id, r]));
  const sourceTitle = out.map((o) => (o.title !== original.get(o.id)!.title ? original.get(o.id)!.title : ""));
  const sourceDescription = out.map((o) => (o.description !== original.get(o.id)!.description ? (original.get(o.id)!.description ?? "") : ""));
  await pg`
    UPDATE episodes AS e SET
      grade = v.grade,
      is_placeholder = v.is_placeholder,
      synopsis_generated = v.synopsis_generated,
      number_disputed = v.number_disputed,
      title = v.title,
      description = NULLIF(v.description, ''),
      source_title = NULLIF(v.source_title, ''),
      source_description = NULLIF(v.source_description, ''),
      streaming = CASE WHEN v.is_placeholder THEN '{}'::text[] ELSE e.streaming END,
      air_precision = NULLIF(v.air_precision, '')
    FROM (
      SELECT * FROM unnest(
        ${pg.array(out.map((o) => o.id))}::text[],
        ${pg.array(out.map((o) => o.grade))}::text[],
        ${pg.array(out.map((o) => o.isPlaceholder))}::bool[],
        ${pg.array(out.map((o) => o.synopsisGenerated))}::bool[],
        ${pg.array(out.map((o) => o.numberDisputed))}::bool[],
        ${pg.array(out.map((o) => o.title))}::text[],
        ${pg.array(out.map((o) => o.description ?? ""))}::text[],
        ${pg.array(sourceTitle)}::text[],
        ${pg.array(sourceDescription)}::text[],
        ${pg.array(out.map((o) => o.airPrecision ?? ""))}::text[]
      ) AS t(id, grade, is_placeholder, synopsis_generated, number_disputed, title, description, source_title, source_description, air_precision)
    ) AS v(id, grade, is_placeholder, synopsis_generated, number_disputed, title, description, source_title, source_description, air_precision)
    WHERE e.id = v.id`;
  // Placeholders keep only the tag that marks them; their subjects were generated, not observed.
  await pg`DELETE FROM episode_topics WHERE episode_id IN (SELECT id FROM episodes WHERE is_placeholder)`;
  await pg`DELETE FROM episode_themes WHERE episode_id IN (SELECT id FROM episodes WHERE is_placeholder)`;
  await pg`DELETE FROM episode_tags WHERE tag <> 'unconfirmed' AND episode_id IN (SELECT id FROM episodes WHERE is_placeholder)`;
  const counts: Record<string, number> = {};
  for (const o of out) counts[o.grade] = (counts[o.grade] ?? 0) + 1;
  console.log(`[regrade] ${out.length} rows: ${JSON.stringify(counts)}; year-only ${yearOnly}; generated synopses ${out.filter((o) => o.synopsisGenerated).length}`);
  for (const ids of disputes) console.log(`[regrade] disputed episode number, both kept: ${ids.join(", ")}`);
  return { counts, disputes, yearOnly };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { migrationClient } = await import("../db/client.js");
  const pg = migrationClient();
  await regrade(pg);
  await pg.end();
}
