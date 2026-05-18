import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  date,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// confidence enum — current data has confirmed/partial; allow inferred for future
export const confidenceEnum = pgEnum("confidence", ["confirmed", "partial", "inferred"]);

export const shows = pgTable(
  "shows",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    network: text("network"),
    yearsLabel: text("years_label"),
    startYear: integer("start_year"),
    endYear: integer("end_year"),
    totalEpisodes: integer("total_episodes"),
    documented: integer("documented"),
    description: text("description"),
    gapNote: text("gap_note"),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (t) => ({
    slugIdx: uniqueIndex("shows_slug_uniq").on(t.slug),
  }),
);
export type Show = typeof shows.$inferSelect;
export type ShowInsert = typeof shows.$inferInsert;

export const episodes = pgTable(
  "episodes",
  {
    // surrogate string PK matching the JSON `id` (stable across runs)
    id: text("id").primaryKey(),
    showSlug: text("show_slug").notNull(),
    showId: integer("show_id"),
    showName: text("show_name"),
    season: integer("season"),
    episodeNumber: integer("episode_number"),
    title: text("title").notNull(),
    airDateRaw: text("air_date_raw"),
    airDate: date("air_date"),
    airYear: integer("air_year"),
    airMonth: integer("air_month"),
    airPrecision: text("air_precision"), // day | month | year | unknown
    runtimeMinutes: integer("runtime_minutes"),
    network: text("network"),
    streaming: text("streaming").array().default(sql`'{}'::text[]`),
    description: text("description"),
    confidence: confidenceEnum("confidence").default("inferred").notNull(),
    singleSource: boolean("single_source").default(false).notNull(),
    sources: text("sources").array().default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    showSeasonEpIdx: uniqueIndex("episodes_show_season_ep")
      .on(t.showSlug, t.season, t.episodeNumber)
      .where(sql`season IS NOT NULL AND episode_number IS NOT NULL`),
    showSlugIdx: index("episodes_show_slug_idx").on(t.showSlug),
    seasonIdx: index("episodes_show_season_idx").on(t.showSlug, t.season),
    airDateIdx: index("episodes_air_date_idx").on(t.airDate),
    yearIdx: index("episodes_year_idx").on(t.airYear),
    titleIdx: index("episodes_title_idx").on(t.title),
  }),
);
export type Episode = typeof episodes.$inferSelect;
export type EpisodeInsert = typeof episodes.$inferInsert;

export const episodeGuests = pgTable(
  "episode_guests",
  {
    id: serial("id").primaryKey(),
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role"),
    position: integer("position").default(0).notNull(),
  },
  (t) => ({
    epIdx: index("episode_guests_ep_idx").on(t.episodeId),
    nameIdx: index("episode_guests_name_idx").on(t.name),
  }),
);
export type EpisodeGuest = typeof episodeGuests.$inferSelect;
export type EpisodeGuestInsert = typeof episodeGuests.$inferInsert;

export const episodeRecipes = pgTable(
  "episode_recipes",
  {
    id: serial("id").primaryKey(),
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    note: text("note"),
    position: integer("position").default(0).notNull(),
  },
  (t) => ({
    epIdx: index("episode_recipes_ep_idx").on(t.episodeId),
    nameIdx: index("episode_recipes_name_idx").on(t.name),
  }),
);
export type EpisodeRecipe = typeof episodeRecipes.$inferSelect;
export type EpisodeRecipeInsert = typeof episodeRecipes.$inferInsert;

export const episodeTopics = pgTable(
  "episode_topics",
  {
    id: serial("id").primaryKey(),
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
  },
  (t) => ({
    epTopicIdx: uniqueIndex("episode_topics_ep_topic_uniq").on(t.episodeId, t.topic),
    topicIdx: index("episode_topics_topic_idx").on(t.topic),
  }),
);
export type EpisodeTopic = typeof episodeTopics.$inferSelect;
export type EpisodeTopicInsert = typeof episodeTopics.$inferInsert;

export const episodeThemes = pgTable(
  "episode_themes",
  {
    id: serial("id").primaryKey(),
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    theme: text("theme").notNull(),
  },
  (t) => ({
    epThemeIdx: uniqueIndex("episode_themes_ep_theme_uniq").on(t.episodeId, t.theme),
    themeIdx: index("episode_themes_theme_idx").on(t.theme),
  }),
);
export type EpisodeTheme = typeof episodeThemes.$inferSelect;
export type EpisodeThemeInsert = typeof episodeThemes.$inferInsert;

export const episodeTags = pgTable(
  "episode_tags",
  {
    id: serial("id").primaryKey(),
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (t) => ({
    epTagIdx: uniqueIndex("episode_tags_ep_tag_uniq").on(t.episodeId, t.tag),
    tagIdx: index("episode_tags_tag_idx").on(t.tag),
  }),
);
export type EpisodeTag = typeof episodeTags.$inferSelect;
export type EpisodeTagInsert = typeof episodeTags.$inferInsert;

export const mslSegments = pgTable(
  "msl_segments",
  {
    id: serial("id").primaryKey(),
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    position: integer("position").default(0).notNull(),
    title: text("title"),
    kind: text("kind"),
    description: text("description"),
  },
  (t) => ({
    epPosIdx: index("msl_segments_ep_pos_idx").on(t.episodeId, t.position),
  }),
);
export type MslSegment = typeof mslSegments.$inferSelect;
export type MslSegmentInsert = typeof mslSegments.$inferInsert;

export const mssCalendarEntries = pgTable(
  "mss_calendar_entries",
  {
    id: serial("id").primaryKey(),
    episodeId: text("episode_id").references(() => episodes.id, { onDelete: "set null" }),
    airDate: date("air_date").notNull(),
    weekday: text("weekday"),
    title: text("title"),
    notes: text("notes"),
  },
  (t) => ({
    airDateIdx: uniqueIndex("mss_calendar_date_uniq").on(t.airDate),
    yearIdx: index("mss_calendar_year_idx").on(t.airDate),
  }),
);
export type MssCalendarEntry = typeof mssCalendarEntries.$inferSelect;
export type MssCalendarEntryInsert = typeof mssCalendarEntries.$inferInsert;

export const paletteColors = pgTable(
  "palette_colors",
  {
    id: serial("id").primaryKey(),
    paletteGroup: text("palette_group").notNull(),
    paletteName: text("palette_name"),
    name: text("name").notNull(),
    hex: text("hex").notNull(),
    role: text("role"),
    notes: text("notes"),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (t) => ({
    groupIdx: index("palette_colors_group_idx").on(t.paletteGroup),
    uniqIdx: uniqueIndex("palette_colors_group_name_uniq").on(t.paletteGroup, t.name),
  }),
);
export type PaletteColor = typeof paletteColors.$inferSelect;
export type PaletteColorInsert = typeof paletteColors.$inferInsert;

export const staticContent = pgTable("static_content", {
  slug: text("slug").primaryKey(),
  title: text("title"),
  bodyMd: text("body_md").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export type StaticContent = typeof staticContent.$inferSelect;
export type StaticContentInsert = typeof staticContent.$inferInsert;

export const importRuns = pgTable("import_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  sourceFiles: jsonb("source_files").$type<string[]>().default([]).notNull(),
  rowsPerTable: jsonb("rows_per_table").$type<Record<string, number>>().default({}).notNull(),
  errors: jsonb("errors").$type<Array<{ table: string; id?: string; message: string }>>().default([]).notNull(),
  errorLog: text("error_log"),
});
export type ImportRun = typeof importRuns.$inferSelect;
export type ImportRunInsert = typeof importRuns.$inferInsert;

export const importGaps = pgTable("import_gaps", {
  id: serial("id").primaryKey(),
  showSlug: text("show_slug"),
  season: integer("season"),
  gapReason: text("gap_reason").notNull(),
  sourceNote: text("source_note"),
});
export type ImportGap = typeof importGaps.$inferSelect;
export type ImportGapInsert = typeof importGaps.$inferInsert;
