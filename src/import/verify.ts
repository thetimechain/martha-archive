import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema.js";
import { env } from "../lib/env.js";
import { writeReconciliationReport } from "./report.js";
import { desc } from "drizzle-orm";

const CONN = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;

async function main() {
  const pg = postgres(CONN, { max: 2, prepare: false });
  const db = drizzle(pg, { schema });
  const meta = JSON.parse(await readFile(join(env.DATA_DIR, "episodes.json"), "utf8")).meta;
  const last = (await db.select().from(schema.importRuns).orderBy(desc(schema.importRuns.id)).limit(1))[0];
  if (!last) {
    console.log("(no import_runs row)");
    process.exit(1);
  }
  await writeReconciliationReport({
    db,
    pg,
    meta,
    rowsPerTable: last.rowsPerTable,
    errors: last.errors,
    startedAt: last.startedAt,
    finishedAt: last.finishedAt ?? new Date(),
  });
  await pg.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
