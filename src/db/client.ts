import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "../lib/env.js";
import * as schema from "./schema.js";

const url = env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

// Neon pooler requires prepare:false
export const sql = postgres(url, { prepare: false, max: 5, idle_timeout: 30 });
export const db = drizzle(sql, { schema });
export type DB = typeof db;

export function migrationClient() {
  const u = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
  if (!u) throw new Error("DATABASE_URL_UNPOOLED required for migrations");
  return postgres(u, { max: 1, idle_timeout: 5 });
}
