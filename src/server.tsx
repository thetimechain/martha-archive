import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { compress } from "hono/compress";
import { etag } from "hono/etag";
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
import { mobileSwRoute } from "./routes/mobile-sw.js";
import { factsRoute } from "./routes/facts.js";
import { guestsRoute } from "./routes/guests.js";
import { peopleRoute } from "./routes/people.js";
import { placesRoute } from "./routes/places.js";
import { aboutShorthandRoute } from "./routes/about-shorthand.js";
import { todayRoute } from "./routes/today.js";
import { topicsRoute } from "./routes/topics.js";
import { chipsRoute } from "./routes/api-chips.js";
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

// Response compression, registered before any route so it covers HTML pages
// as well as the static CSS/JS/font files served below. Hono's compress()
// skips any response that already sets Content-Encoding (see
// node_modules/hono/dist/middleware/compress), so it never double-compresses
// /api/episodes/compact's hand-rolled, pre-gzipped-and-cached response
// (src/routes/api.ts ~136-202) — that route keeps its own precomputed gzip
// buffer instead of paying to compress on every request, and streaming
// static-file responses still stream (compress() pipes through a
// CompressionStream rather than buffering).
app.use("*", compress());

// ETag for HTML page responses. Skip /static/* (already gets long-lived
// Cache-Control just below, so a re-hashed-per-request ETag on top adds cost
// for little benefit) and /api/* (src/routes/api.ts already implements its
// own ETag/If-None-Match logic) so this middleware doesn't shadow or
// conflict with either. /static/m/sw.js is also under /static/* and keeps
// its own ETag (src/routes/mobile-sw.tsx).
const htmlEtag = etag();
app.use("*", async (c, next) => {
  if (c.req.path.startsWith("/static/") || c.req.path.startsWith("/api/")) {
    return next();
  }
  return htmlEtag(c, next);
});

// Dynamic mobile service worker — must be mounted BEFORE the /static/*
// middleware so it wins for /static/m/sw.js. Rewrites CACHE_VERSION to a
// content-hash of the shell files so each shell change invalidates clients.
app.route("/", mobileSwRoute);

// static assets at /static/*, served from ./public.
//
// `./dist/public` is not mounted as a second fallback here: `scripts/copy-assets.mjs`
// copies public/ -> dist/public/ at build time, and the Dockerfile *also* copies
// ./public directly into the runtime image (alongside ./dist), so the two are a
// byte-for-byte duplicate in every environment (dev and the built image both have
// ./public) — a second serveStatic mount only ever paid for an extra fs.stat on every
// /static/* 404, never actually served a file the first mount didn't already have.
//
// Cache-Control: Layout.tsx appends `?v=<BUILD_ID>` (a content hash of public/styles/*.css)
// to every stylesheet URL, so any request carrying that query param is safe to cache
// forever — a build that changes the file gets a new URL. Requests without it (fonts,
// icons, images, and the /m/* PWA shell files) get a short, revalidate-soon max-age instead.
const staticRoot = "./public";
app.use(
  "/static/*",
  serveStatic({
    root: staticRoot,
    rewriteRequestPath: (p) => p.replace(/^\/static/, ""),
    onFound: (_path, c) => {
      if (c.req.query("v")) {
        c.header("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        c.header("Cache-Control", "public, max-age=3600");
      }
    },
  }),
);

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
app.route("/", peopleRoute);
app.route("/", placesRoute);
app.route("/", aboutShorthandRoute);
app.route("/", todayRoute);
app.route("/", topicsRoute);
app.route("/", chipsRoute);

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
