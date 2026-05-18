import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { getCookie, setCookie } from "hono/cookie";
import { desc } from "drizzle-orm";
import { Layout } from "../views/components/Layout.js";
import { db } from "../db/client.js";
import { importRuns } from "../db/schema.js";
import { fetchLastImport, fetchRowCounts } from "../db/queries.js";
import { env } from "../lib/env.js";

export const adminRoute = new Hono();

function checkToken(provided: string | undefined): boolean {
  if (!env.ADMIN_TOKEN || !provided) return false;
  const a = Buffer.from(env.ADMIN_TOKEN);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

adminRoute.get("/admin", async (c) => {
  const key = c.req.query("key");
  if (key) {
    if (!checkToken(key)) return c.notFound();
    setCookie(c, "admin", key, {
      httpOnly: true,
      sameSite: "Lax",
      secure: env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return c.redirect("/admin", 302);
  }
  const cookie = getCookie(c, "admin");
  if (!checkToken(cookie)) return c.notFound();

  const [counts, last, recent] = await Promise.all([
    fetchRowCounts(),
    fetchLastImport(),
    db.select().from(importRuns).orderBy(desc(importRuns.id)).limit(5),
  ]);

  return c.html(
    <Layout title="Admin — Martha Archive" description="Administration">
      <div class="page admin">
        <h1 class="display">Admin</h1>
        <section>
          <h2 class="display-smaller">Last import</h2>
          <p>
            {last ? (
              <>
                Run <strong>#{last.id}</strong> · started {last.startedAt.toISOString()} · finished{" "}
                {last.finishedAt?.toISOString() ?? "(running)"}
              </>
            ) : (
              <>No import has run yet.</>
            )}
          </p>
        </section>
        <section>
          <h2 class="display-smaller">Row counts</h2>
          <table>
            <thead>
              <tr>
                <th>Table</th>
                <th>Rows</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(counts).map(([k, v]) => (
                <tr>
                  <td>{k}</td>
                  <td>{v.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h2 class="display-smaller">Recent runs</h2>
          <table>
            <thead>
              <tr>
                <th>Run</th>
                <th>Started</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr>
                  <td>#{r.id}</td>
                  <td>{r.startedAt.toISOString()}</td>
                  <td>{r.errors.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h2 class="display-smaller">Trigger re-import</h2>
          <form method="post" action="/admin/reimport">
            <button type="submit">Trigger re-import</button>
          </form>
        </section>
      </div>
    </Layout>,
  );
});

adminRoute.post("/admin/reimport", async (c) => {
  const cookie = getCookie(c, "admin");
  if (!checkToken(cookie)) return c.notFound();
  // We do not exec the import in-process to avoid blocking. Schedule a child process.
  setImmediate(() => {
    void import("node:child_process").then(({ spawn }) => {
      const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/import/run.ts"], {
        stdio: "ignore",
        detached: true,
        env: process.env,
      });
      child.unref();
    });
  });
  return c.redirect("/admin", 302);
});
