DROP INDEX IF EXISTS "episodes_show_season_ep";--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "grade" text;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "is_placeholder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "synopsis_generated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "number_disputed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "source_title" text;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "source_description" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episodes_show_season_ep" ON "episodes" USING btree ("show_slug","season","episode_number") WHERE season IS NOT NULL AND episode_number IS NOT NULL;--> statement-breakpoint
-- Backfill so pages are honest between this migration and `pnpm data:regrade`
-- (which refines this: numbering same-day placeholders, synopses, year-only dates).
UPDATE "episodes" SET "is_placeholder" = true
WHERE "title" ~* '^((the )?martha stewart show s[0-9]+e[0-9]+|season [0-9]+ episode [0-9]+)$'
   OR EXISTS (SELECT 1 FROM "episode_tags" t WHERE t."episode_id" = "episodes"."id" AND t."tag" = 'unconfirmed');--> statement-breakpoint
UPDATE "episodes" SET
  "source_title" = "title",
  "source_description" = "description",
  "title" = 'Untitled broadcast' || COALESCE(', ' || to_char("air_date", 'FMMonth FMDD, YYYY'), ''),
  "description" = NULL,
  "streaming" = '{}'::text[]
WHERE "is_placeholder" AND "source_title" IS NULL;--> statement-breakpoint
UPDATE "episodes" SET "grade" = CASE
  WHEN "is_placeholder" THEN 'inferred'
  WHEN "confidence" = 'confirmed' AND NOT "single_source" THEN 'confirmed'
  WHEN "confidence" = 'confirmed' THEN 'single'
  ELSE 'partial' END
WHERE "grade" IS NULL;
