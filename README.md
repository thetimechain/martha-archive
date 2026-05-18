# Martha Stewart Episode Archive

A complete record of Martha Stewart television episodes (2,496 across 12 shows, 1986–2024) with 1990s Martha Stewart Living visual identity.

Live: <https://martha.fly.dev>

## Stack

- Hono + TypeScript JSX (server-rendered)
- Drizzle ORM + Neon Postgres
- fly.io (ord, 2 machines, shared-cpu-1x)
- Self-hosted Cormorant Garamond / Libre Caslon Text / EB Garamond / Cormorant SC

## Data

Source JSON in `data/` is imported into Neon by `pnpm data:import`. Idempotent — upserts by stable episode id.

| Table | Rows |
|---|---|
| shows | 12 |
| episodes | 2,496 |
| episode_guests | 197 |
| episode_recipes | 1,000 |
| episode_topics | 5,094 |
| episode_themes | 2,986 |
| episode_tags | 10,521 |
| mss_calendar_entries | 1,106 |
| palette_colors | 36 |

## Routes

- `/` — landing
- `/episodes?show=&season=&year=&topic=&theme=&tag=&guest=&q=&confidence=&sort=&page=` — faceted archive
- `/episodes/:id` — single episode
- `/shows/:slug` — show landing + seasons table
- `/calendar` → `/calendar/:year` — Martha Stewart Show broadcast grid
- `/design-system` — live tokens, palettes, type ramp, motif grid
- `/gaps` — research honesty
- `/admin?key=<ADMIN_TOKEN>` — row counts, recent runs, re-import trigger
- `/api/episodes?...` — JSON, ETag + 60s cache, rate-limited (60 req/s/IP)
- `/api/health`, `/sitemap.xml`, `/robots.txt`

## Run locally

```bash
pnpm install
pnpm db:migrate
pnpm data:import       # only first time, or to reseed
pnpm dev               # http://localhost:8080
```

`.env` must define `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `SESSION_SECRET`, `ADMIN_TOKEN`, `RUN_MIGRATIONS=1`, `DATA_DIR=./data`.

## Deploy

```bash
fly deploy --remote-only --app martha
```

CI: `.github/workflows/ci.yml` — typecheck + unit tests + build on push/PR.
