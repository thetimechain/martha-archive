# Martha Stewart TV Archive

An unofficial, fan-made archive of Martha Stewart's television work — **2,842
episodes across 12 shows (1986–2024)**, rendered in a 1990s *Martha Stewart
Living* visual identity, with cross-referenced hubs for the **people** who
appeared on the shows and the **places** Martha visited.

**Live: <https://martha.fly.dev>**

> **Not affiliated.** This project has no connection to Martha Stewart, Martha
> Stewart Living Omnimedia, Marquee Brands, or any broadcaster. It is a
> non-commercial fan archive of broadcast *facts* — episode metadata, segment
> titles, guest and location names. It hosts no video, no transcripts, and no
> magazine content. If you are a rights-holder with a concern, open an issue
> and we will respond promptly.

## What's inside

- **Episode archive** — faceted browse/search over 2,842 episodes
  (`/episodes`), per-show pages, a broadcast calendar, and `/gaps` (an honest
  accounting of what's still missing).
- **People** (`/people`) — 110+ named chefs, contributors, family members, and
  guests from *Martha Stewart Living* TV plus guests from the later shows,
  each with researched bios and episode appearances.
- **Places** (`/places`, `/places/map`) — 340+ farms, bakeries, museums,
  gardens, restaurants, and field-trip destinations, browsable and plotted on
  a vintage-atlas map.
- **Entity pipeline** — `scripts/mst-extract-entities.mjs` builds the
  people/places dataset from curated allowlists, researched manual credits,
  and an LLM-verified extraction over episode segment rundowns
  (`data/marthastewart-tv/segments-llm.json`, with verbatim evidence lines and
  an audit trail in `data/marthastewart-tv/llm-review/`).

## Stack

- [Hono](https://hono.dev) + TypeScript JSX, fully server-rendered
- Drizzle ORM + Postgres (Neon in production)
- fly.io (`fly.toml`, app `martha`)
- Self-hosted Cormorant Garamond / Libre Caslon Text / EB Garamond

## Run locally

```bash
pnpm install

# any Postgres works; for a throwaway one:
docker run -d --name martha-pg -e POSTGRES_PASSWORD=martha \
  -e POSTGRES_DB=neondb -p 5433:5432 postgres:16
# .env: DATABASE_URL / DATABASE_URL_UNPOOLED -> your Postgres

pnpm db:migrate
pnpm data:import       # seeds episodes from data/ JSON
pnpm dev               # http://localhost:8080
```

`.env` keys: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `SESSION_SECRET`,
`ADMIN_TOKEN`, `RUN_MIGRATIONS=1`, `DATA_DIR=./data` (see `.env.example`).

### A note on data completeness

This public repo ships the **code** and the **curated entity dataset**. Two
things are deliberately *not* redistributed:

- **Episode thumbnails** (`public/episode-images/`) — stills are fetched at
  build time from the streaming service's public CDN by
  `scripts/mst-download-thumbs.mjs`; we don't republish them in git.
- **The raw marthastewart.tv catalog crawl** (`data/marthastewart-tv/raw/`,
  `videos.json`, etc.) — regenerate it with `scripts/mst-crawl.mjs` (requires
  your own marthastewart.tv subscription; see script header).

Everything needed to run the site with full episode data is in `data/`'s
committed JSON; the hubs simply show fewer images without the crawl.

## Extending the people/places dataset

- **New recurring contributor** → add to `PEOPLE` in
  `scripts/mst-extract-entities.mjs` (aliases + researched `role`).
- **New researched business** → add to `CURATED_PLACES` with a `role`.
- **Chef known only by signature dish** → add a `MANUAL_CREDITS` entry.
- Re-run: `node scripts/mst-extract-entities.mjs && node scripts/mst-persist-entities.mjs`.
- False positives → `NAME_STOP` / `PLACE_STOP` sets.

## Licensing

- **Code:** [MIT](LICENSE)
- **Data** (`data/*.json`, descriptive prose): [CC BY 4.0](LICENSE-DATA).
  Bare facts (titles, dates, names) are not copyrightable and are free to
  reuse regardless.

## Deploy

```bash
fly deploy --remote-only --app martha
```

CI (`.github/workflows/ci.yml`): typecheck + unit tests + build on push/PR.
