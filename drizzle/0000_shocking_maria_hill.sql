CREATE TYPE "public"."confidence" AS ENUM('confirmed', 'partial', 'inferred');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "episode_guests" (
	"id" serial PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "episode_recipes" (
	"id" serial PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "episode_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"tag" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "episode_themes" (
	"id" serial PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"theme" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "episode_topics" (
	"id" serial PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"topic" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "episodes" (
	"id" text PRIMARY KEY NOT NULL,
	"show_slug" text NOT NULL,
	"show_id" integer,
	"show_name" text,
	"season" integer,
	"episode_number" integer,
	"title" text NOT NULL,
	"air_date_raw" text,
	"air_date" date,
	"air_year" integer,
	"air_month" integer,
	"air_precision" text,
	"runtime_minutes" integer,
	"network" text,
	"streaming" text[] DEFAULT '{}'::text[],
	"description" text,
	"confidence" "confidence" DEFAULT 'inferred' NOT NULL,
	"single_source" boolean DEFAULT false NOT NULL,
	"sources" text[] DEFAULT '{}'::text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_gaps" (
	"id" serial PRIMARY KEY NOT NULL,
	"show_slug" text,
	"season" integer,
	"gap_reason" text NOT NULL,
	"source_note" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "import_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"source_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rows_per_table" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_log" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "msl_segments" (
	"id" serial PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"title" text,
	"kind" text,
	"description" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mss_calendar_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"episode_id" text,
	"air_date" date NOT NULL,
	"weekday" text,
	"title" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "palette_colors" (
	"id" serial PRIMARY KEY NOT NULL,
	"palette_group" text NOT NULL,
	"palette_name" text,
	"name" text NOT NULL,
	"hex" text NOT NULL,
	"role" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shows" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"network" text,
	"years_label" text,
	"start_year" integer,
	"end_year" integer,
	"total_episodes" integer,
	"documented" integer,
	"description" text,
	"gap_note" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "static_content" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text,
	"body_md" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "episode_guests" ADD CONSTRAINT "episode_guests_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "episode_recipes" ADD CONSTRAINT "episode_recipes_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "episode_tags" ADD CONSTRAINT "episode_tags_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "episode_themes" ADD CONSTRAINT "episode_themes_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "episode_topics" ADD CONSTRAINT "episode_topics_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "msl_segments" ADD CONSTRAINT "msl_segments_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mss_calendar_entries" ADD CONSTRAINT "mss_calendar_entries_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episode_guests_ep_idx" ON "episode_guests" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episode_guests_name_idx" ON "episode_guests" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episode_recipes_ep_idx" ON "episode_recipes" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episode_recipes_name_idx" ON "episode_recipes" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "episode_tags_ep_tag_uniq" ON "episode_tags" USING btree ("episode_id","tag");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episode_tags_tag_idx" ON "episode_tags" USING btree ("tag");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "episode_themes_ep_theme_uniq" ON "episode_themes" USING btree ("episode_id","theme");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episode_themes_theme_idx" ON "episode_themes" USING btree ("theme");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "episode_topics_ep_topic_uniq" ON "episode_topics" USING btree ("episode_id","topic");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episode_topics_topic_idx" ON "episode_topics" USING btree ("topic");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "episodes_show_season_ep" ON "episodes" USING btree ("show_slug","season","episode_number") WHERE season IS NOT NULL AND episode_number IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episodes_show_slug_idx" ON "episodes" USING btree ("show_slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episodes_show_season_idx" ON "episodes" USING btree ("show_slug","season");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episodes_air_date_idx" ON "episodes" USING btree ("air_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episodes_year_idx" ON "episodes" USING btree ("air_year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episodes_title_idx" ON "episodes" USING btree ("title");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "msl_segments_ep_pos_idx" ON "msl_segments" USING btree ("episode_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mss_calendar_date_uniq" ON "mss_calendar_entries" USING btree ("air_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mss_calendar_year_idx" ON "mss_calendar_entries" USING btree ("air_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "palette_colors_group_idx" ON "palette_colors" USING btree ("palette_group");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "palette_colors_group_name_uniq" ON "palette_colors" USING btree ("palette_group","name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shows_slug_uniq" ON "shows" USING btree ("slug");