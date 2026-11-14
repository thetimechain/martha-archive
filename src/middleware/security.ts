import type { MiddlewareHandler } from "hono";

export type CspSources = { img?: string[]; script?: string[]; style?: string[]; connect?: string[] };

/** The origin of a tile URL template such as https://{s}.tile.example.org/{z}/{x}/{y}.png. */
export function tileOrigin(template: string): string {
  const host = new URL(template.replace(/\{[a-z]\}/g, "0")).host;
  return template.includes("{s}") ? `https://*.${host.split(".").slice(1).join(".")}` : `https://${host}`;
}

const join = (base: string[], extra: string[] = []) => [...base, ...extra].join(" ");

export function buildCsp(extra: CspSources = {}): string {
  return [
    "default-src 'self'",
    `script-src ${join(["'self'"], extra.script)}`,
    // Hundreds of inline style="" attributes remain; scripts are the risk that matters.
    `style-src ${join(["'self'", "'unsafe-inline'"], extra.style)}`,
    `img-src ${join(["'self'", "data:", "https://vhx.imgix.net"], extra.img)}`,
    "font-src 'self'",
    `connect-src ${join(["'self'", "https://vhx.imgix.net"], extra.connect)}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Security headers on every response, including 404s, errors and static files. */
export function securityHeaders(opts: { production: boolean; csp: string }): MiddlewareHandler {
  return async (c, next) => {
    await next();
    const h = c.res.headers;
    h.set("Content-Security-Policy", opts.csp);
    h.set("X-Content-Type-Options", "nosniff");
    h.set("Referrer-Policy", "strict-origin-when-cross-origin");
    h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
    if (opts.production) h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  };
}
