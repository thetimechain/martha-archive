CREATE TABLE IF NOT EXISTS "mst_entities" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"entity_type" text NOT NULL,
	"role" text,
	"mentions" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mst_episode_entities" (
	"id" serial PRIMARY KEY NOT NULL,
	"episode_id" text NOT NULL,
	"entity_slug" text NOT NULL,
	"source" text NOT NULL,
	"context" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mst_episode_entities" ADD CONSTRAINT "mst_episode_entities_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mst_episode_entities" ADD CONSTRAINT "mst_episode_entities_entity_slug_mst_entities_slug_fk" FOREIGN KEY ("entity_slug") REFERENCES "public"."mst_entities"("slug") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mst_entities_type_idx" ON "mst_entities" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mst_entities_kind_idx" ON "mst_entities" USING btree ("kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mst_episode_entities_ep_idx" ON "mst_episode_entities" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mst_episode_entities_ent_idx" ON "mst_episode_entities" USING btree ("entity_slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mst_episode_entities_ep_ent_uniq" ON "mst_episode_entities" USING btree ("episode_id","entity_slug");