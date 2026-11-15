import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { buildCsp, securityHeaders } from "../../src/middleware/security.js";

function app(production: boolean) {
  const a = new Hono();
  a.use("*", securityHeaders({ production, csp: buildCsp({ img: ["https://tile.example.org"] }) }));
  a.get("/ok", (c) => c.text("ok"));
  a.get("/boom", () => {
    throw new Error("boom");
  });
  a.notFound((c) => c.text("not here", 404));
  a.onError((_e, c) => c.text("error", 500));
  return a;
}

describe("security headers", () => {
  it("are sent on 200, 404 and 500 responses", async () => {
    for (const [path, status] of [["/ok", 200], ["/nope", 404], ["/boom", 500]] as const) {
      const res = await app(true).request(path);
      expect(res.status).toBe(status);
      expect(res.headers.get("content-security-policy")).toContain("script-src 'self'");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("strict-transport-security")).toContain("max-age");
    }
  });
  it("forbid inline scripts and add configured origins", () => {
    const csp = buildCsp({ img: ["https://tile.example.org"] });
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toContain("img-src 'self' data: https://vhx.imgix.net https://tile.example.org");
  });
  it("send HSTS only in production", async () => {
    const res = await app(false).request("/ok");
    expect(res.headers.get("strict-transport-security")).toBeNull();
  });
});

import { tileOrigin } from "../../src/middleware/security.js";

describe("tileOrigin", () => {
  it("derives the CSP origin from a tile URL template", () => {
    expect(tileOrigin("https://tile.openstreetmap.org/{z}/{x}/{y}.png")).toBe("https://tile.openstreetmap.org");
    expect(tileOrigin("https://{s}.basemaps.cartocdn.com/x/{z}/{x}/{y}{r}.png")).toBe("https://*.basemaps.cartocdn.com");
  });
});
