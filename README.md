# Martha: An Archive

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
- **Honest records** — every episode carries one grade, set by
  `src/lib/honesty.ts` and applied over the whole table by
  `pnpm data:regrade` (also run at the end of `pnpm data:import`):

  | Grade | Meaning |
  |---|---|
  | *Confirmed* | Two or more independent sources |
  | *One listing* | One source |
  | *Partial* | Limited sources |
  | *Date inferred* | Weekday broadcasts of The Martha Stewart Show placed by the season calendar; their title and content are unknown |

  Placeholders show as "Untitled broadcast, <date>". Year-only dates show as the year. Template synopses are withheld and the segment list is shown instead. Originals are kept in `source_title` / `source_description`.
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

This public repo ships the **code**, the **CC-BY episode dataset**, and the
**derived entity dataset**. A fresh clone is close to — but not identical to —
the live site. Concretely, after `pnpm data:import` you get:

- **2,497 episodes** (the live site shows 2,842 — the extra ~345 are
  Hallmark-era rows reconstructed from the marthastewart.tv catalog crawl,
  which is not redistributed; `scripts/mst-augment.mjs` re-adds them if you
  have your own crawl).
- **/people and /places populate** once you additionally run
  `node scripts/mst-persist-entities.mjs` (reads the committed
  `data/marthastewart-tv/entities.json`). Entity → episode appearance links
  need the crawl-derived `episodes.mst_vhx_id` mapping, so on a fresh clone
  the hubs show entities and bios but few episode cross-links.
- **No episode thumbnails** (`public/episode-images/`) — stills are fetched at
  deploy time from the streaming service's public CDN by
  `scripts/mst-download-thumbs.mjs`; we don't republish them in git.

The raw marthastewart.tv catalog crawl (`data/marthastewart-tv/raw/`,
`videos.json`, `items.json`, …) requires your own marthastewart.tv
subscription — see `scripts/mst-crawl.mjs` and `docs/data-sources.md`.

## Extending the people/places dataset

- **New recurring contributor** → add to `PEOPLE` in
  `scripts/mst-extract-entities.mjs` (aliases + researched `role`).
- **New researched business** → add to `CURATED_PLACES` with a `role`.
- **Chef known only by signature dish** → add a `MANUAL_CREDITS` entry.
- False positives → `NAME_STOP` / `PLACE_STOP` sets.

Note: **re-running the extractor requires the non-redistributed crawl**
(`data/marthastewart-tv/items.json` + `raw/`), so outside contributors should
submit allowlist edits by PR without re-running — a maintainer regenerates
`entities.json` and re-persists. `node scripts/mst-persist-entities.mjs`
(which loads the committed `entities.json` into Postgres) works on any clone.

## Licensing

- **Code:** [MIT](LICENSE)
- **Data** (`data/*.json`, descriptive prose): [CC BY 4.0](LICENSE-DATA).
  Bare facts (titles, dates, names) are not copyrightable and are free to
  reuse regardless.

## Deploy

```bash
fly deploy --remote-only --app martha
```

CI (`.github/workflows/ci.yml`) runs two jobs on push and PR:
- **Required:** typecheck, unit tests, size budgets and build.
- **Non-blocking:** a browser job with Postgres that runs the op scripts and axe.

### After deploying this branch's data changes

Against Neon, once:
1. `pnpm db:migrate` applies 0004: grade and honesty columns. The unique index on (show, season, episode) becomes a plain index.
2. `pnpm data:regrade` grades every row, including the crawl rows.

3. Verify the live site with the same checks used locally. Expect 8 of 8 op scripts and 0 axe violations:

   ```bash
   BASE_URL=https://martha.fly.dev pnpm test:ops
   BASE_URL=https://martha.fly.dev pnpm test:a11y
   ```

   Before this branch was deployed (November 14, 2026), the live site failed 7 of the 8 op scripts. Each failure was a defect this branch fixes: "101%", missing OSM attribution, the trademark wordmark, unpaged mobile lists, the missing calendar note, the sort control under the new CSP, and titled counts. Only `not-found` passed.

No map key is needed: tiles default to OpenStreetMap. Set `MAP_TILE_URL` (plus attribution and max zoom) to use another provider; the CSP follows it.

## Tests

```bash
pnpm test            # unit (vitest)
pnpm test:budgets    # gzip budgets for static assets (budgets.json)
pnpm dev &           # then, against http://127.0.0.1:8080 (or BASE_URL):
pnpm test:ops        # tests/ops/*.ops: scripts of driver operations
pnpm test:a11y       # axe, WCAG 2.1 AA, 16 views
pnpm driver "goto /episodes" "type css:#q pie" state tree   # look around like the tests do
```

`tools/driver.ts` exposes a small fixed set of operations (after expo/exact), listed by `pnpm driver help`. A new behavior gets a new `tests/ops/<name>.ops`, one operation per line. Put `# @nojs` or `# @mobile` on its own line to change the browser.

## Security

Every response carries:
- a Content-Security-Policy with no inline scripts (`src/middleware/security.ts`)
- `nosniff`
- `Referrer-Policy`
- `Permissions-Policy`
- HSTS in production

Event handlers go in script files; the mobile app uses `data-action` attributes with one delegated listener. Leaflet is vendored in `public/vendor/leaflet`.
