# Security Policy

This is a server-rendered Hono + Postgres application deployed on fly.io. It
has no user accounts and stores no user data; the only privileged surface is a
single token-gated admin page.

## What we care about

- **SQL injection.** All queries go through Drizzle ORM or the `postgres`
  tagged-template client; report anything that interpolates request input into
  SQL.
- **Cross-site scripting (XSS).** Episode and entity data are rendered through
  Hono's JSX, which escapes by default. The dataset is treated as untrusted
  input (anyone can PR a change to `data/`), so any sink that bypasses
  escaping (`dangerouslySetInnerHTML`-style raw HTML, unvalidated URLs) is a
  bug.
- **Admin auth.** `/admin` requires `ADMIN_TOKEN` (timing-safe comparison,
  httpOnly cookie, 404 on failure). Known accepted trade-off: the token can be
  passed once as a query parameter to set the cookie, which may land in access
  logs — rotate the token if you suspect exposure.
- **Secrets.** No credentials belong in the repo. `.env` is gitignored;
  `.env.example` contains placeholders only. Production secrets live in fly.io
  secrets and Neon.
- **Dependency and supply-chain issues** in `package.json`/`pnpm-lock.yaml`.

## Out of scope

- Denial-of-service and volumetric findings (there is per-IP rate limiting on
  the API, but this is a hobby deployment).
- Issues in marthastewart.tv or other third-party services this project links
  to or fetches public metadata from.

## Reporting

Open a GitHub issue for non-sensitive reports. For anything sensitive, use
GitHub's private vulnerability reporting on this repository. We aim to respond
within a week.
