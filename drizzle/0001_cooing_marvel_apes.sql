CREATE TABLE IF NOT EXISTS "mst_collection_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"collection_slug" text NOT NULL,
	"vhx_id" integer NOT NULL,
	"episode_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"title" text,
	"description" text,
	"photo_url" text,
	"photo_source_url" text,
	"canonical_url" text,
	"canonical_slug" text,
	"season_number" integer,
	"episode_number_vhx" integer,
	"duration_seconds" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mst_collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"vhx_collection_id" integer,
	"items_count" integer DEFAULT 0 NOT NULL,
	"thumbnail_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "photo_url" text;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "photo_url_source" text;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "mst_vhx_id" integer;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "mst_canonical_slug" text;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "mst_canonical_url" text;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "mst_match_score" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mst_collection_items" ADD CONSTRAINT "mst_collection_items_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mst_collection_items_coll_idx" ON "mst_collection_items" USING btree ("collection_slug","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mst_collection_items_vhx_idx" ON "mst_collection_items" USING btree ("vhx_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mst_collection_items_ep_idx" ON "mst_collection_items" USING btree ("episode_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mst_collection_items_coll_vhx_uniq" ON "mst_collection_items" USING btree ("collection_slug","vhx_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mst_collections_slug_uniq" ON "mst_collections" USING btree ("slug");