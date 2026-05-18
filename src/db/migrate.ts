import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrationClient } from "./client.js";

const sql = migrationClient();
const db = drizzle(sql);

await migrate(db, { migrationsFolder: "./drizzle" });
await sql.end();
console.log("migrations applied");
