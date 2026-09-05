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
    // marthastewart.tv / vhx.tv linkage
    photoUrl: text("photo_url"),
    photoUrlSource: text("photo_url_source"),
    mstVhxId: integer("mst_vhx_id"),
    mstCanonicalSlug: text("mst_canonical_slug"),
    mstCanonicalUrl: text("mst_canonical_url"),
    mstMatchScore: text("mst_match_score"),
    mstDurationSeconds: integer("mst_duration_seconds"),
    // provenance: 'seed' (from episodes.json) | 'marthastewart-tv' (new from vhx)
    provenance: text("provenance").default("seed").notNull(),
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
    // Leading-wildcard ILIKE search (queries.ts whereFor()) can't use a btree
    // index — pg_trgm + GIN lets `title/description ILIKE '%term%'` use an
    // index scan instead of a sequential scan.
    titleTrgmIdx: index("episodes_title_trgm_idx").using("gin", sql`${t.title} gin_trgm_ops`),
    descriptionTrgmIdx: index("episodes_description_trgm_idx").using(
      "gin",
      sql`${t.description} gin_trgm_ops`,
    ),
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
    // Supports the leading-wildcard `g.name ILIKE '%term%'` guest search in
    // queries.ts whereFor() — a plain btree index can't be used for that.
    nameTrgmIdx: index("episode_guests_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
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

export const mstCollections = pgTable(
  "mst_collections",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    vhxCollectionId: integer("vhx_collection_id"),
    itemsCount: integer("items_count").default(0).notNull(),
    thumbnailUrl: text("thumbnail_url"),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (t) => ({
    slugIdx: uniqueIndex("mst_collections_slug_uniq").on(t.slug),
  }),
);
export type MstCollection = typeof mstCollections.$inferSelect;
export type MstCollectionInsert = typeof mstCollections.$inferInsert;

export const mstCollectionItems = pgTable(
  "mst_collection_items",
  {
    id: serial("id").primaryKey(),
    collectionSlug: text("collection_slug").notNull(),
    vhxId: integer("vhx_id").notNull(),
    episodeId: text("episode_id").references(() => episodes.id, { onDelete: "set null" }),
    position: integer("position").default(0).notNull(),
    title: text("title"),
    description: text("description"),
    photoUrl: text("photo_url"),
    photoSourceUrl: text("photo_source_url"),
    canonicalUrl: text("canonical_url"),
    canonicalSlug: text("canonical_slug"),
    seasonNumber: integer("season_number"),
    episodeNumberVhx: integer("episode_number_vhx"),
    durationSeconds: integer("duration_seconds"),
  },
  (t) => ({
    collIdx: index("mst_collection_items_coll_idx").on(t.collectionSlug, t.position),
    vhxIdx: index("mst_collection_items_vhx_idx").on(t.vhxId),
    epIdx: index("mst_collection_items_ep_idx").on(t.episodeId),
    uniqIdx: uniqueIndex("mst_collection_items_coll_vhx_uniq").on(t.collectionSlug, t.vhxId),
  }),
);
export type MstCollectionItem = typeof mstCollectionItems.$inferSelect;
export type MstCollectionItemInsert = typeof mstCollectionItems.$inferInsert;

// Entities discovered in marthastewart.tv (vhx) data — recurring people (contributors, chefs,
// family) and places (businesses she visited on field trips, museums, farms, locations).
// Sourced from `data/marthastewart-tv/entities.json` (see `scripts/mst-extract-entities.mjs`).
export const mstEntities = pgTable(
  "mst_entities",
  {
    slug: text("slug").primaryKey(),
    name: text("name").notNull(),
    // person: contributor | chef | family | guest
    // place:  business | museum | farm | garden | location | residence | event | zoo | park | historic-house | organization | field-trip
    kind: text("kind").notNull(),
    // 'person' | 'place'
    entityType: text("entity_type").notNull(),
    role: text("role"),
    mentions: integer("mentions").default(0).notNull(),
  },
  (t) => ({
    typeIdx: index("mst_entities_type_idx").on(t.entityType),
    kindIdx: index("mst_entities_kind_idx").on(t.kind),
  }),
);
export type MstEntity = typeof mstEntities.$inferSelect;
export type MstEntityInsert = typeof mstEntities.$inferInsert;

export const mstEpisodeEntities = pgTable(
  "mst_episode_entities",
  {
    id: serial("id").primaryKey(),
    episodeId: text("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    entitySlug: text("entity_slug")
      .notNull()
      .references(() => mstEntities.slug, { onDelete: "cascade" }),
    source: text("source").notNull(),
    context: text("context"),
  },
  (t) => ({
    epIdx: index("mst_episode_entities_ep_idx").on(t.episodeId),
    entIdx: index("mst_episode_entities_ent_idx").on(t.entitySlug),
    uniqIdx: uniqueIndex("mst_episode_entities_ep_ent_uniq").on(t.episodeId, t.entitySlug),
  }),
);
export type MstEpisodeEntity = typeof mstEpisodeEntities.$inferSelect;
export type MstEpisodeEntityInsert = typeof mstEpisodeEntities.$inferInsert;

export const importGaps = pgTable("import_gaps", {
  id: serial("id").primaryKey(),
  showSlug: text("show_slug"),
  season: integer("season"),
  gapReason: text("gap_reason").notNull(),
  sourceNote: text("source_note"),
});
export type ImportGap = typeof importGaps.$inferSelect;
export type ImportGapInsert = typeof importGaps.$inferInsert;
