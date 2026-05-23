import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";

// Serves /static/m/sw.js with CACHE_VERSION rewritten to `martha-<hash>`,
// where <hash> is a short SHA-1 over the shell file contents
// (sw.js + style.css + app.js). This guarantees that any edit to the mobile
// app shell produces a new cache namespace, so the activate handler in sw.js
// evicts the old caches and returning users pick up fresh assets.
//
// Mount this BEFORE the generic /static/* static middleware in server.tsx
// so this route wins for /static/m/sw.js.

export const mobileSwRoute = new Hono();

const SHELL_FILES = ["m/sw.js", "m/style.css", "m/app.js"] as const;

// Same root-resolution logic as server.tsx: dev serves from ./public,
// prod build serves from ./dist/public.
function resolveRoot(): string {
  return existsSync("./public/m/sw.js") ? "./public" : "./dist/public";
}

let cached: { body: string; etag: string } | null = null;

async function buildSw(): Promise<{ body: string; etag: string }> {
  if (cached) return cached;
  const root = resolveRoot();
  const contents = await Promise.all(
    SHELL_FILES.map((f) => readFile(`${root}/${f}`, "utf8"))
  );
  const hash = createHash("sha1")
    .update(contents.join("\0"))
    .digest("hex")
    .slice(0, 10);
  const cacheVersion = `martha-${hash}`;
  const swSource = contents[0] ?? ""; // sw.js
  const body = swSource.replace(/__CACHE_VERSION__/g, cacheVersion);
  cached = { body, etag: `"${hash}"` };
  return cached;
}

mobileSwRoute.get("/static/m/sw.js", async (c) => {
  try {
    const { body, etag } = await buildSw();
    c.header("Content-Type", "application/javascript; charset=utf-8");
    c.header("ETag", etag);
    // SW spec already caps SW script caching at 24h and most browsers ignore
    // long max-age on SW scripts, but being explicit doesn't hurt.
    c.header("Cache-Control", "no-cache, must-revalidate");
    c.header("Service-Worker-Allowed", "/m/");
    return c.body(body);
  } catch {
    // Fall through to static middleware on read failure.
    return c.notFound();
  }
});
