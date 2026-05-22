ALTER TABLE "episodes" ADD COLUMN "mst_duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "provenance" text DEFAULT 'seed' NOT NULL;