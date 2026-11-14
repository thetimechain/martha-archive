DROP INDEX IF EXISTS "episodes_show_season_ep";--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "grade" text;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "is_placeholder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "synopsis_generated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "number_disputed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "source_title" text;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "source_description" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episodes_show_season_ep" ON "episodes" USING btree ("show_slug","season","episode_number") WHERE season IS NOT NULL AND episode_number IS NOT NULL;