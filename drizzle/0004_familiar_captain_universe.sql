CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episode_guests_name_trgm_idx" ON "episode_guests" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episodes_title_trgm_idx" ON "episodes" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "episodes_description_trgm_idx" ON "episodes" USING gin ("description" gin_trgm_ops);