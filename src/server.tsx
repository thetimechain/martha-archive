import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { logger as pinoLogger } from "./lib/logger.js";
import { env } from "./lib/env.js";
import { randomUUID } from "node:crypto";

import { homeRoute } from "./routes/home.js";
import { episodesRoute } from "./routes/episodes.js";
import { episodeDetailRoute } from "./routes/episode-detail.js";
import { showRoute } from "./routes/show.js";
import { calendarRoute } from "./routes/calendar.js";
import { collectionsRoute } from "./routes/collections.js";
import { designSystemRoute } from "./routes/design-system.js";
import { gapsRoute } from "./routes/gaps.js";
import { apiRoute } from "./routes/api.js";
import { sitemapRoute } from "./routes/sitemap.js";
import { adminRoute } from "./routes/admin.js";
import { mobileRoute } from "./routes/mobile.js";
import { factsRoute } from "./routes/facts.js";
import { guestsRoute } from "./routes/guests.js";
import { NotFoundPage } from "./views/NotFound.js";

const app = new Hono();

// request logging
app.use("*", async (c, next) => {
  const id = randomUUID().slice(0, 8);
  const t0 = Date.now();
  try {
    await next();
  } finally {
    const ms = Date.now() - t0;
    pinoLogger.info({ req_id: id, method: c.req.method, path: c.req.path, status: c.res.status, duration_ms: ms }, "req");
  }
});

// static assets at /static/*  — served from ./public (dev) or ./dist/public (prod build)
const staticRoot = "./public";
app.use("/static/*", serveStatic({ root: staticRoot, rewriteRequestPath: (p) => p.replace(/^\/static/, "") }));
app.use("/static/*", serveStatic({ root: "./dist/public", rewriteRequestPath: (p) => p.replace(/^\/static/, "") }));

// mount routes
app.route("/", homeRoute);
app.route("/", episodesRoute);
app.route("/", episodeDetailRoute);
app.route("/", showRoute);
app.route("/", calendarRoute);
app.route("/", collectionsRoute);
app.route("/", designSystemRoute);
app.route("/", gapsRoute);
app.route("/", apiRoute);
app.route("/", sitemapRoute);
app.route("/", adminRoute);
app.route("/", mobileRoute);
app.route("/", factsRoute);
app.route("/", guestsRoute);

app.notFound((c) => c.html(<NotFoundPage />, 404));
app.onError((err, c) => {
  pinoLogger.error({ err: err.message, stack: err.stack }, "unhandled");
  return c.html(<NotFoundPage />, 500);
});

async function maybeMigrate() {
  if (!env.RUN_MIGRATIONS) return;
  try {
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrationClient } = await import("./db/client.js");
    const sql = migrationClient();
    const mdb = drizzle(sql);
    await migrate(mdb, { migrationsFolder: "./drizzle" });
    await sql.end();
    pinoLogger.info("migrations applied");
  } catch (e) {
    pinoLogger.error({ err: (e as Error).message }, "migration failed");
  }
}

await maybeMigrate();

const port = env.PORT;
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, ({ port }) =>
  pinoLogger.info({ port, node_env: env.NODE_ENV }, "server up"),
);
