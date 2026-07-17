import "dotenv/config";
import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import * as schema from "../db/schema.js";
import { env } from "../lib/env.js";
import {
  normalizeShow,
  normalizeEpisode,
  normalizeCalendarEntry,
  type RawEpisode,
} from "./normalize.js";
import { extractPalettesFromMarkdown } from "./palette.js";
import { writeReconciliationReport } from "./report.js";

const DATA_DIR = env.DATA_DIR;
const BATCH = env.IMPORT_BATCH_SIZE;
const FAIL_THRESHOLD_PCT = env.IMPORT_FAIL_THRESHOLD_PCT;
const CONN = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;

function chunks<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function main() {
  console.log(`[import] DATA_DIR=${DATA_DIR} BATCH=${BATCH} FAIL_THRESHOLD_PCT=${FAIL_THRESHOLD_PCT}`);
  const startedAt = new Date();
  const pg = postgres(CONN, { max: 4, idle_timeout: 30, prepare: false });
  const db = drizzle(pg, { schema });

  const errors: Array<{ table: string; id?: string; message: string }> = [];
  const rowsPerTable: Record<string, number> = {};

  const episodesRaw = JSON.parse(await readFile(join(DATA_DIR, "episodes.json"), "utf8"));
  const msl14 = JSON.parse(await readFile(join(DATA_DIR, "msl_s1s4.json"), "utf8"));
  const msl59 = JSON.parse(await readFile(join(DATA_DIR, "msl_s5_s9.json"), "utf8"));
  const mssCal = JSON.parse(await readFile(join(DATA_DIR, "mss_calendar.json"), "utf8"));
  const designMd = await readFile(join(DATA_DIR, "1990s-martha-stewart-design-system.md"), "utf8");

  // ── shows ────────────────────────────────────────────────
  const showsRaw: any[] = Array.isArray(episodesRaw.meta?.shows) ? episodesRaw.meta.shows : [];
  const showRows = showsRaw
    .map((s, i) => ({ ...normalizeShow(s), sortOrder: i }))
    .filter((s) => s.slug);
  for (const row of showRows) {
    try {
      await db.insert(schema.shows).values(row).onConflictDoUpdate({
        target: schema.shows.slug,
        set: {
          name: row.name,
          network: row.network,
          yearsLabel: row.yearsLabel,
          startYear: row.startYear,
          endYear: row.endYear,
          totalEpisodes: row.totalEpisodes,
          documented: row.documented,
          gapNote: row.gapNote,
          sortOrder: row.sortOrder,
        },
      });
    } catch (e: any) {
      errors.push({ table: "shows", id: row.slug, message: e?.message ?? String(e) });
    }
  }
  rowsPerTable.shows = showRows.length;
  console.log(`[import] shows upserted: ${showRows.length}`);

  // build show_id lookup
  const showsLookup = new Map<string, number>();
  const allShows = await db.select().from(schema.shows);
  for (const s of allShows) showsLookup.set(s.slug, s.id);

  // ── episodes (merge sources, dedup by id) ───────────────
  const merged: RawEpisode[] = [
    ...(Array.isArray(episodesRaw.episodes) ? episodesRaw.episodes : []),
    ...(Array.isArray(msl14) ? msl14 : []),
    ...(Array.isArray(msl59) ? msl59 : []),
  ];

  const seen = new Set<string>();
  const norms: ReturnType<typeof normalizeEpisode>[] = [];
  for (const raw of merged) {
    try {
      const n = normalizeEpisode(raw);
      n.episode.showId = showsLookup.get(n.episode.showSlug) ?? null;
      if (seen.has(n.episode.id)) continue;
      seen.add(n.episode.id);
      norms.push(n);
      for (const w of n.warnings) errors.push({ table: "episodes", id: n.episode.id, message: w });
    } catch (e: any) {
      errors.push({ table: "episodes", id: (raw as any).id ?? "?", message: e?.message ?? String(e) });
    }
  }
  norms.sort((a, b) => (a.episode.id < b.episode.id ? -1 : a.episode.id > b.episode.id ? 1 : 0));

  // upsert episodes in batches
  let epOk = 0;
  for (const batch of chunks(norms, BATCH)) {
    try {
      await db
        .insert(schema.episodes)
        .values(batch.map((n) => n.episode))
        .onConflictDoUpdate({
          target: schema.episodes.id,
          set: {
            showSlug: sql`EXCLUDED.show_slug`,
            showId: sql`EXCLUDED.show_id`,
            showName: sql`EXCLUDED.show_name`,
            season: sql`EXCLUDED.season`,
            episodeNumber: sql`EXCLUDED.episode_number`,
            title: sql`EXCLUDED.title`,
            airDateRaw: sql`EXCLUDED.air_date_raw`,
            airDate: sql`EXCLUDED.air_date`,
            airYear: sql`EXCLUDED.air_year`,
            airMonth: sql`EXCLUDED.air_month`,
            airPrecision: sql`EXCLUDED.air_precision`,
            runtimeMinutes: sql`EXCLUDED.runtime_minutes`,
            network: sql`EXCLUDED.network`,
            streaming: sql`EXCLUDED.streaming`,
            description: sql`EXCLUDED.description`,
            confidence: sql`EXCLUDED.confidence`,
            singleSource: sql`EXCLUDED.single_source`,
            sources: sql`EXCLUDED.sources`,
            updatedAt: sql`now()`,
          },
        });
      epOk += batch.length;
    } catch (e: any) {
      // batch failed — fall back to row-by-row
      for (const n of batch) {
        try {
          await db
            .insert(schema.episodes)
            .values(n.episode)
            .onConflictDoUpdate({
              target: schema.episodes.id,
              set: {
                title: n.episode.title,
                airDateRaw: n.episode.airDateRaw,
                airDate: n.episode.airDate,
                airYear: n.episode.airYear,
                airMonth: n.episode.airMonth,
                airPrecision: n.episode.airPrecision,
                description: n.episode.description,
                showName: n.episode.showName,
                streaming: n.episode.streaming,
                sources: n.episode.sources,
                confidence: n.episode.confidence,
                singleSource: n.episode.singleSource,
                updatedAt: sql`now()`,
              },
            });
          epOk++;
        } catch (ee: any) {
          errors.push({ table: "episodes", id: n.episode.id, message: ee?.message ?? String(ee) });
        }
      }
    }
  }
  rowsPerTable.episodes = epOk;
  console.log(`[import] episodes upserted: ${epOk} / ${norms.length}`);

  // ── relational rows: delete-then-insert per episode batch ──
  const epIds = norms.map((n) => n.episode.id);
  let guestCount = 0,
    recipeCount = 0,
    topicCount = 0,
    themeCount = 0,
    tagCount = 0;
  for (const idBatch of chunks(epIds, BATCH)) {
    try {
      await pg`DELETE FROM episode_guests WHERE episode_id = ANY(${idBatch})`;
      await pg`DELETE FROM episode_recipes WHERE episode_id = ANY(${idBatch})`;
      await pg`DELETE FROM episode_topics WHERE episode_id = ANY(${idBatch})`;
      await pg`DELETE FROM episode_themes WHERE episode_id = ANY(${idBatch})`;
      await pg`DELETE FROM episode_tags WHERE episode_id = ANY(${idBatch})`;
    } catch (e: any) {
      errors.push({ table: "relational-delete", message: e?.message ?? String(e) });
    }
  }
  const allGuests = norms.flatMap((n) => n.guests);
  const allRecipes = norms.flatMap((n) => n.recipes);
  const allTopics = norms.flatMap((n) => n.topics);
  const allThemes = norms.flatMap((n) => n.themes);
  const allTags = norms.flatMap((n) => n.tags);

  for (const c of chunks(allGuests, BATCH)) {
    if (!c.length) continue;
    try {
      await db.insert(schema.episodeGuests).values(c);
      guestCount += c.length;
    } catch (e: any) {
      errors.push({ table: "episode_guests", message: e?.message ?? String(e) });
    }
  }
  for (const c of chunks(allRecipes, BATCH)) {
    if (!c.length) continue;
    try {
      await db.insert(schema.episodeRecipes).values(c);
      recipeCount += c.length;
    } catch (e: any) {
      errors.push({ table: "episode_recipes", message: e?.message ?? String(e) });
    }
  }
  // topics/themes/tags need conflict-do-nothing because of unique (episode_id, topic) etc.
  for (const c of chunks(allTopics, BATCH)) {
    if (!c.length) continue;
    try {
      await db.insert(schema.episodeTopics).values(c).onConflictDoNothing();
      topicCount += c.length;
    } catch (e: any) {
      errors.push({ table: "episode_topics", message: e?.message ?? String(e) });
    }
  }
  for (const c of chunks(allThemes, BATCH)) {
    if (!c.length) continue;
    try {
      await db.insert(schema.episodeThemes).values(c).onConflictDoNothing();
      themeCount += c.length;
    } catch (e: any) {
      errors.push({ table: "episode_themes", message: e?.message ?? String(e) });
    }
  }
  for (const c of chunks(allTags, BATCH)) {
    if (!c.length) continue;
    try {
      await db.insert(schema.episodeTags).values(c).onConflictDoNothing();
      tagCount += c.length;
    } catch (e: any) {
      errors.push({ table: "episode_tags", message: e?.message ?? String(e) });
    }
  }
  rowsPerTable.episode_guests = guestCount;
  rowsPerTable.episode_recipes = recipeCount;
  rowsPerTable.episode_topics = topicCount;
  rowsPerTable.episode_themes = themeCount;
  rowsPerTable.episode_tags = tagCount;
  console.log(
    `[import] relational: guests=${guestCount} recipes=${recipeCount} topics=${topicCount} themes=${themeCount} tags=${tagCount}`,
  );

  // ── mss_calendar_entries ────────────────────────────────
  const mssArr: any[] = Array.isArray(mssCal) ? mssCal : Array.isArray(mssCal?.episodes) ? mssCal.episodes : [];
  const calRows = mssArr.map(normalizeCalendarEntry).filter((x): x is NonNullable<typeof x> => !!x);

  // ensure episode_id refs exist
  const existingIds = new Set((await db.select({ id: schema.episodes.id }).from(schema.episodes)).map((r) => r.id));
  for (const r of calRows) if (r.episodeId && !existingIds.has(r.episodeId)) r.episodeId = null;

  // wipe & insert
  try {
    await pg`TRUNCATE mss_calendar_entries RESTART IDENTITY`;
  } catch (e: any) {
    errors.push({ table: "mss_calendar_entries", message: e?.message ?? String(e) });
  }
  let calCount = 0;
  // dedup by air_date
  const calMap = new Map<string, (typeof calRows)[number]>();
  for (const r of calRows) calMap.set(String(r.airDate), r);
  const calUnique = Array.from(calMap.values());
  for (const c of chunks(calUnique, BATCH)) {
    if (!c.length) continue;
    try {
      await db.insert(schema.mssCalendarEntries).values(c).onConflictDoNothing();
      calCount += c.length;
    } catch (e: any) {
      errors.push({ table: "mss_calendar_entries", message: e?.message ?? String(e) });
    }
  }
  rowsPerTable.mss_calendar_entries = calCount;
  console.log(`[import] calendar entries: ${calCount}`);

  // ── palette + design-system static content ─────────────
  const palettes = extractPalettesFromMarkdown(designMd);
  // also seed with the canonical Araucana/Garden/Skylands palettes from tokens.css
  const FALLBACK_PALETTES: Array<{ paletteGroup: string; paletteName: string; name: string; hex: string; role?: string }> = [
    { paletteGroup: "araucana", paletteName: "Araucana Colors (1995)", name: "Araucana Eggshell Blue", hex: "#BFD3CE", role: "Signature 90s blue-green" },
    { paletteGroup: "araucana", paletteName: "Araucana Colors (1995)", name: "Robin's Egg", hex: "#A7C7C2" },
    { paletteGroup: "araucana", paletteName: "Araucana Colors (1995)", name: "Bedford Gray", hex: "#9CA39C" },
    { paletteGroup: "araucana", paletteName: "Araucana Colors (1995)", name: "Dove", hex: "#D8D5CC" },
    { paletteGroup: "araucana", paletteName: "Araucana Colors (1995)", name: "Buttermilk", hex: "#F1E8D2" },
    { paletteGroup: "araucana", paletteName: "Araucana Colors (1995)", name: "Pale Sage", hex: "#B4BBA1" },
    { paletteGroup: "araucana", paletteName: "Araucana Colors (1995)", name: "Wisteria", hex: "#C8BFD4" },
    { paletteGroup: "araucana", paletteName: "Araucana Colors (1995)", name: "Pale Buttercup", hex: "#EFE0A8" },
    { paletteGroup: "garden", paletteName: "Colors of the Garden (1992)", name: "Hosta", hex: "#7C8B6F" },
    { paletteGroup: "garden", paletteName: "Colors of the Garden (1992)", name: "Hydrangea", hex: "#9FB4C9" },
    { paletteGroup: "garden", paletteName: "Colors of the Garden (1992)", name: "Wedgwood", hex: "#9FB1C0" },
    { paletteGroup: "garden", paletteName: "Colors of the Garden (1992)", name: "Tomato", hex: "#B84A3E" },
    { paletteGroup: "garden", paletteName: "Colors of the Garden (1992)", name: "Crocus", hex: "#D9C7B0" },
    { paletteGroup: "garden", paletteName: "Colors of the Garden (1992)", name: "Russet", hex: "#8B5A3C" },
    { paletteGroup: "skylands", paletteName: "Colors of Skylands (1999)", name: "Skylands Blue", hex: "#6A7E89" },
    { paletteGroup: "skylands", paletteName: "Colors of Skylands (1999)", name: "Stone", hex: "#A8A39A" },
    { paletteGroup: "skylands", paletteName: "Colors of Skylands (1999)", name: "Lichen", hex: "#8C9075" },
    { paletteGroup: "skylands", paletteName: "Colors of Skylands (1999)", name: "Putty", hex: "#C8B89C" },
  ];

  const combined = new Map<string, any>();
  let pos = 0;
  for (const p of FALLBACK_PALETTES) combined.set(`${p.paletteGroup}|${p.name.toLowerCase()}`, { ...p, sortOrder: pos++, notes: null, role: p.role ?? null });
  for (const p of palettes) {
    const k = `${p.paletteGroup}|${p.name.toLowerCase()}`;
    if (!combined.has(k)) combined.set(k, { ...p, sortOrder: pos++ });
  }

  try {
    await pg`TRUNCATE palette_colors RESTART IDENTITY`;
    const rows = Array.from(combined.values());
    for (const c of chunks(rows, BATCH)) {
      await db.insert(schema.paletteColors).values(c).onConflictDoNothing();
    }
    rowsPerTable.palette_colors = combined.size;
    console.log(`[import] palette_colors: ${combined.size}`);
  } catch (e: any) {
    errors.push({ table: "palette_colors", message: e?.message ?? String(e) });
  }

  // static_content (design-system-1990s, gaps, home)
  try {
    await db
      .insert(schema.staticContent)
      .values({ slug: "design-system-1990s", title: "1990s Martha Stewart Design System", bodyMd: designMd })
      .onConflictDoUpdate({
        target: schema.staticContent.slug,
        set: { title: "1990s Martha Stewart Design System", bodyMd: designMd, updatedAt: sql`now()` },
      });

    const gapsMd = buildGapsMarkdown(episodesRaw.meta);
    await db
      .insert(schema.staticContent)
      .values({ slug: "gaps", title: "What we don't know yet", bodyMd: gapsMd })
      .onConflictDoUpdate({
        target: schema.staticContent.slug,
        set: { title: "What we don't know yet", bodyMd: gapsMd, updatedAt: sql`now()` },
      });

    const homeMd = "A complete record of Martha Stewart television, with the recipes and small good things they contained.";
    await db
      .insert(schema.staticContent)
      .values({ slug: "home", title: "Home", bodyMd: homeMd })
      .onConflictDoUpdate({ target: schema.staticContent.slug, set: { bodyMd: homeMd, updatedAt: sql`now()` } });
    rowsPerTable.static_content = 3;
  } catch (e: any) {
    errors.push({ table: "static_content", message: e?.message ?? String(e) });
  }

  // import_gaps
  try {
    await pg`TRUNCATE import_gaps RESTART IDENTITY`;
    const gapList: any[] = Array.isArray(episodesRaw.meta?.gaps) ? episodesRaw.meta.gaps : [];
    const gapRows = gapList.map((g) => {
      if (typeof g === "string") {
        const slugMatch = g.match(/^([A-Z][^(:]+)/);
        return { showSlug: null, season: null, gapReason: g, sourceNote: null };
      }
      return {
        showSlug: g.show_slug ?? null,
        season: g.season ?? null,
        gapReason: g.reason ?? g.note ?? String(g),
        sourceNote: g.source ?? null,
      };
    });
    if (gapRows.length) {
      for (const c of chunks(gapRows, 200)) {
        await db.insert(schema.importGaps).values(c);
      }
    }
    rowsPerTable.import_gaps = gapRows.length;
  } catch (e: any) {
    errors.push({ table: "import_gaps", message: e?.message ?? String(e) });
  }

  // record the run
  const finishedAt = new Date();
  const errorLog = errors
    .slice(0, 200)
    .map((e) => `[${e.table}] ${e.id ?? ""} ${e.message}`)
    .join("\n");
  await db.insert(schema.importRuns).values({
    startedAt,
    finishedAt,
    sourceFiles: [
      "episodes.json",
      "msl_s1s4.json",
      "msl_s5_s9.json",
      "mss_calendar.json",
      "1990s-martha-stewart-design-system.md",
    ],
    rowsPerTable,
    errors,
    errorLog,
  });

  // reconciliation report
  try {
    await mkdir("reports", { recursive: true });
    await writeReconciliationReport({ db, pg, meta: episodesRaw.meta, rowsPerTable, errors, startedAt, finishedAt });
  } catch (e: any) {
    console.warn(`[import] report failed: ${e.message}`);
  }

  console.table(rowsPerTable);
  const totalAttempted = merged.length + calUnique.length;
  const failPct = (errors.length / Math.max(1, totalAttempted)) * 100;
  console.log(`[import] errors=${errors.length} (${failPct.toFixed(2)}%) threshold=${FAIL_THRESHOLD_PCT}%`);
  for (const e of errors.slice(0, 25)) {
    console.log(`[import]   error: [${e.table}] ${e.id ?? ""} ${e.message}`);
  }
  if (errors.length > 25) console.log(`[import]   … ${errors.length - 25} more (see reconciliation report)`);

  await pg.end();
  const exitOk = failPct <= FAIL_THRESHOLD_PCT;
  process.exit(exitOk ? 0 : 1);
}

function buildGapsMarkdown(meta: any): string {
  const lines = [
    "# What we don't know yet",
    "",
    "This archive prefers to say what it does not know.",
    "",
  ];
  if (Array.isArray(meta?.gaps)) {
    lines.push("## Documented gaps");
    lines.push("");
    for (const g of meta.gaps) lines.push(`- ${typeof g === "string" ? g : JSON.stringify(g)}`);
    lines.push("");
  }
  if (meta?.confidence_breakdown) {
    lines.push("## Confidence");
    for (const [k, v] of Object.entries(meta.confidence_breakdown)) lines.push(`- ${k}: ${v}`);
  }
  return lines.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
