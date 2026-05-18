import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

type Args = {
  db: any;
  pg: any;
  meta: any;
  rowsPerTable: Record<string, number>;
  errors: Array<{ table: string; id?: string; message: string }>;
  startedAt: Date;
  finishedAt: Date;
};

export async function writeReconciliationReport({ pg, meta, rowsPerTable, errors, startedAt, finishedAt }: Args) {
  const today = new Date().toISOString().slice(0, 10);
  const reportPath = join("reports", `import-${today}.md`);
  const noDatePath = join("reports", "no-date.csv");
  const lines: string[] = [];
  lines.push(`# Import reconciliation — ${today}`);
  lines.push("");
  lines.push(`- Started: ${startedAt.toISOString()}`);
  lines.push(`- Finished: ${finishedAt.toISOString()}`);
  lines.push(`- Duration: ${((finishedAt.valueOf() - startedAt.valueOf()) / 1000).toFixed(2)}s`);
  lines.push("");

  lines.push("## Expected vs inserted (by show)");
  lines.push("");
  lines.push("| Slug | Documented (meta) | Rows in DB | Δ | Status |");
  lines.push("|------|------|------|------|--------|");
  const shows: any[] = Array.isArray(meta?.shows) ? meta.shows : [];
  const counts = await pg`SELECT show_slug, count(*)::int as c FROM episodes GROUP BY show_slug`;
  const cMap = new Map<string, number>(counts.map((r: any) => [r.show_slug, Number(r.c)]));
  for (const s of shows) {
    const docCount = s.documented ?? 0;
    const dbCount = cMap.get(s.slug) ?? 0;
    const delta = dbCount - docCount;
    const status = delta === 0 ? "✓ match" : delta < 0 ? "⚠ short" : "⚠ over";
    lines.push(`| ${s.slug} | ${docCount} | ${dbCount} | ${delta} | ${status} |`);
  }
  lines.push("");

  lines.push("## Confidence");
  const conf = await pg`SELECT confidence::text as c, count(*)::int as n FROM episodes GROUP BY confidence`;
  for (const r of conf) lines.push(`- ${r.c}: ${r.n}`);
  lines.push("");

  lines.push("## Single source");
  const ss = await pg`SELECT single_source, count(*)::int as n FROM episodes GROUP BY single_source`;
  for (const r of ss) lines.push(`- single_source=${r.single_source}: ${r.n}`);
  lines.push(`- meta.single_source_count: ${meta?.single_source_count ?? "(unknown)"}`);
  lines.push("");

  lines.push("## Gaps (verbatim)");
  for (const g of (meta?.gaps ?? []) as any[]) lines.push(`- ${typeof g === "string" ? g : JSON.stringify(g)}`);
  lines.push("");

  const noDate = await pg`SELECT id, show_slug, title FROM episodes WHERE air_date IS NULL ORDER BY show_slug, id`;
  lines.push(`## Episodes with no exact air_date: ${noDate.length}`);
  lines.push("");
  lines.push("| id | show_slug | title |");
  lines.push("|----|-----------|-------|");
  for (const r of noDate.slice(0, 100)) lines.push(`| ${r.id} | ${r.show_slug} | ${escape(r.title)} |`);
  lines.push("");

  const csv = ["id,show_slug,title"];
  for (const r of noDate) csv.push(`${r.id},${r.show_slug},"${(r.title ?? "").replace(/"/g, '""')}"`);
  await writeFile(noDatePath, csv.join("\n"));

  const orphanShows = await pg`SELECT DISTINCT e.show_slug FROM episodes e LEFT JOIN shows s ON s.slug = e.show_slug WHERE s.slug IS NULL`;
  lines.push("## Orphan show slugs (episodes referencing unknown shows)");
  for (const r of orphanShows) lines.push(`- ${r.show_slug}`);
  if (orphanShows.length === 0) lines.push("- (none)");
  lines.push("");

  lines.push("## Row counts");
  for (const [k, v] of Object.entries(rowsPerTable)) lines.push(`- ${k}: ${v}`);
  lines.push("");

  lines.push(`## Errors (${errors.length})`);
  for (const e of errors.slice(0, 200)) lines.push(`- [${e.table}] ${e.id ?? ""} ${e.message}`);

  await mkdir("reports", { recursive: true });
  await writeFile(reportPath, lines.join("\n"));
  console.log(`[import] wrote ${reportPath}`);
}

function escape(s: string | null | undefined): string {
  return (s ?? "").replace(/\|/g, "\\|");
}
