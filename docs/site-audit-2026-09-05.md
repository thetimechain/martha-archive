# Site Audit — martha-archive (2026-09-05)

Consolidated from five independent Claude Sonnet 5 subagent audits (UI, Performance,
Documentation, Secrets, Personal Identifiers) plus a sixth adversarial-verification pass that
re-derived ten of the highest-impact claims from source, running two throwaway scripts to
numerically confirm two of them. This document merges, deduplicates, and re-ranks all findings;
it does not add any new source-code investigation beyond spot-checking the one place two source
notes disagreed (see the corrected item in the Documentation section below). Severity and status
are per finding: **severity** is Critical/High/Medium/Low; **status** is `Verified (independent)`
(one of the ten claims the verification pass re-derived from source itself, including running
code), `Verified by auditor` (the originating audit confirmed it directly against source but it
was not independently re-derived), or `Inferred` (reasoned from code/config/schema without a live
DB, browser render, or load test to confirm the runtime effect).

Bottom line: the codebase is small, coherent, and its secrets/PII hygiene is genuinely good — no
live secrets, no `.env` ever committed, no personal emails, clean git history. The real risk
surface is one stored-XSS bypass reachable from scraped/imported data, a cluster of asset/PWA
files the manifest and page templates reference but that were never generated, a page-cost
profile (uncached per-request stats, no HTTP caching/compression, unindexed free-text search)
that works today only because the dataset is ~2,500 rows, and a handful of documentation drifts
where prose numbers and file references have fallen out of sync with the code and data that
actually run.

## Severity counts

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 9 |
| Medium | 15 |
| Low | 18 |
| **Total findings** | **43** |

(Counts above are actionable findings only — items in "Clean results" and "Not covered" are not
counted as findings.)

---

## Remediation status (2026-09-05)

Status of each "Fix first" item below, as of the four remediation commits on top of this audit
(`1074e78..HEAD`):

| # | Fix-first item | Status | Commit | Key file |
|---|---|---|---|---|
| 1 | Stored-XSS bypass in `decorateShorthand()` | **FIXED** | `371445e` | `src/lib/shorthand.ts` |
| 2 | Site-wide text-contrast failure | **FIXED** | `179bc05` | `public/styles/components.css` (and other stylesheets/routes) |
| 3 | Default OG/social-share image 404s | **FIXED** | `179bc05` | `public/icons/og-wordmark.png` (+ `scripts/gen-icons.mjs`) |
| 4 | PWA manifest icons and screenshot 404 | **FIXED** | `179bc05` | `public/icons/icon-192.png`, `icon-512.png`; `public/m/manifest.json` |
| 5 | Admin token accepted via `?key=` query string | **OPEN** | — | Kept for now by maintainer decision; hardening tracked in [issue #1](https://github.com/thetimechain/martha-archive/issues/1) |
| 6 | Per-request footer-stats fan-out, uncached | **FIXED** | `73d8e11` | `src/lib/cache.ts` |
| 7 | Static assets ship with no HTTP caching | **FIXED** | `73d8e11` | `src/server.tsx` |
| 8 | No response compression anywhere | **FIXED** | `73d8e11` | `src/server.tsx` (`compress()`/`etag()`) |
| 9 | Dockerfile installs with `npm install`, bypassing the lockfile | **FIXED** | `73d8e11` | `Dockerfile` |
| 10 | Free-text search does leading-wildcard `ILIKE` with no index | **FIXED** | `73d8e11` | `drizzle/0004_familiar_captain_universe.sql` |

---

## 1. Fix first (Critical/High)

1. **[Critical] Stored-XSS bypass in `decorateShorthand()`.** `src/lib/shorthand.ts:58-60`
   returns its input **unescaped** whenever the string already contains the literal substring
   `class="shorthand"`, and this feeds `dangerouslySetInnerHTML` for episode/segment
   title+description on `src/routes/episode-detail.tsx:90,212,213` — fields sourced from
   scraped/LLM-processed data with no upstream sanitization. Fix: escape first, then test the
   *escaped* string for the sentinel. — `Verified (independent)`
2. **[High] Site-wide text-contrast failure.** `--bedford-gray:#9CA39C` (`public/styles/
   tokens.css:19`) on `--page-cream:#F5F0E4` computes to ~2.3:1, failing WCAG AA even at the
   3:1 large-text threshold; used as real caption/air-date/year text in dozens of places. Fix:
   darken to ≥4.5:1 (e.g. `#6B665E`) or add a verified-contrast caption token. —
   `Verified (independent)`
3. **[High] Default OG/social-share image 404s.** `src/views/components/Layout.tsx:71,75`
   defaults `og:image`/`twitter:image` to `/static/og-wordmark.png`, which does not exist
   anywhere in `public/` (only `public/icons/og-wordmark.svg` exists); `scripts/gen-icons.mjs`
   only ever writes SVG despite a comment claiming a PNG fallback, and is wired into no build
   step. Every route without its own `og.image` shows a broken preview in Slack/Twitter/
   iMessage. Fix: point the default at the `.svg` (as `mobile.tsx:38` already does) or actually
   generate a PNG. — `Verified (independent)`
4. **[High] PWA manifest icons and screenshot 404.** `public/m/manifest.json:12-25` references
   `/static/icons/icon-192.png`, `icon-512.png`, `screenshot-home.png` — only the `.svg`
   variants of the two icons exist, and no screenshot file exists in any format. Installing the
   `/m` PWA shows a blank/generic icon. Fix: point the manifest at the `.svg` files or generate
   real PNGs. — `Verified (independent)`
5. **[High] Admin token accepted via `?key=` query string.** `src/routes/admin.tsx:22-24` reads
   `ADMIN_TOKEN` from `c.req.query("key")` on the initial `GET /admin?key=...` hand-off before
   setting an httpOnly cookie; the long-lived secret can land in proxy/CDN/hosting access logs,
   browser history, and `Referer` headers to any third-party resource the page loads (this
   app's own request logger excludes the query string, but upstream infra does not). Fix:
   accept the token only via POST body/header for the initial hand-off, and/or rotate
   `ADMIN_TOKEN` regularly. — `Verified (independent)`
6. **[High] Per-request footer-stats fan-out, uncached.** `fetchLastImport()` +
   `fetchRowCounts()` (a 10-way `UNION ALL count(*)`) are called from **every** route handler
   (18 files, 23/21 call sites) purely to render `footerMeta` in `Layout.tsx`, data that only
   changes when an import runs. Adds 2 full-table-scan round-trips to every single HTML
   response, site-wide. Fix: compute once at boot or on import completion, cache in-process
   (an `lru-cache`/the existing `src/lib/cache.ts` `apiCache` is already available). —
   `Verified (independent)`
7. **[High] Static assets ship with no HTTP caching.** `serveStatic` on `/static/*`
   (`src/server.tsx:52-54`) never sets `Cache-Control`, `ETag`, or `Last-Modified` (confirmed
   by reading the shipped `@hono/node-server` middleware directly). `Layout.tsx` already
   computes a `BUILD_ID` content hash for a `?v=` cache-buster — that mechanism is currently
   inert because no header tells the browser caching is safe. Fix: add a `Cache-Control:
   public, max-age=31536000, immutable` header (safe given the `?v=` hash) via `onFound` or a
   caching-aware static middleware. — `Verified (independent)`
8. **[High] No response compression anywhere except one hand-rolled endpoint.** Hono ships
   `compress`/`etag` middleware inside the single `hono` package but neither is imported
   anywhere in `src/`; every HTML page, `public/m/app.js` (59KB), `public/m/style.css` (30KB),
   and all site CSS (68KB) ship uncompressed. Fix: `app.use('*', compress())` globally. —
   `Verified (independent)`
9. **[High] Dockerfile installs with `npm install`, bypassing the committed lockfile.**
   `Dockerfile:8-9` copies only `package.json` (not `pnpm-lock.yaml`) and runs
   `npm install --no-audit --no-fund`; every image build re-resolves the dependency graph
   independently of what CI/dev actually tested against (e.g. `hono` pinned to `4.12.19` in
   the lockfile vs. whatever `^4.6.10` resolves to at build time). Fix: copy
   `pnpm-lock.yaml` and use `pnpm install --frozen-lockfile`, or commit and use a
   `package-lock.json` with `npm ci`. — `Verified (independent)`
10. **[High] Free-text search does leading-wildcard `ILIKE` with no supporting index.**
    `src/db/queries.ts:70-76` builds `title/description ILIKE '%term%'` and a correlated guest
    `ILIKE '%term%'` subquery; the only indexes on those columns are plain B-tree, which
    Postgres cannot use for a leading `%` wildcard, and no `pg_trgm` extension or GIN index
    exists anywhere in the migration history. Every `/episodes?q=...` forces a sequential
    scan. Fix: `CREATE EXTENSION pg_trgm` + GIN trigram indexes on `episodes.title`,
    `episodes.description`, `episode_guests.name`. — `Verified (independent)`

---

## 2. UI findings

| Sev | Finding | Location | Fix | Status |
|---|---|---|---|---|
| High | Site-wide low-contrast text (`--bedford-gray` on cream, ~2.3:1, fails AA) | `public/styles/tokens.css:19`; used in `components.css` (20+ lines) and inline in most `src/routes/*.tsx` | Darken to ≥4.5:1 or add a dedicated contrast-checked caption token | Verified (independent) |
| High | Default OG/Twitter share image 404s on every route without its own `og.image` | `src/views/components/Layout.tsx:71,75`; `scripts/gen-icons.mjs` | Point default at the existing `.svg`, or generate a real PNG | Verified (independent) |
| High | PWA manifest icons + screenshot reference files that don't exist | `public/m/manifest.json:12-25` | Point manifest at `.svg` or generate PNGs | Verified (independent) |
| Critical | XSS bypass in `decorateShorthand()` reaches `dangerouslySetInnerHTML` on scraped data | `src/lib/shorthand.ts:58-60`; sinks at `src/routes/episode-detail.tsx:90,212,213` | Escape first, then test the escaped string for the idempotency sentinel | Verified (independent) |
| Medium | Header search box never reflects the active `?q=` query — results page reloads with an empty search field | `src/views/components/Header.tsx:63-70` (no `value` attr, no prop); `public/episodes-island.js:6-17` only reads, never sets, the field | Thread the current query into `Header` and set `value={q}` | Verified (independent) |
| Medium | Filter sidebar renders before results on mobile with no reordering or collapse, forcing 90+ links of scroll before content | `src/routes/episodes.tsx:68-70`; `public/styles/layout.css:12-18` (`.grid-2col` collapses <900px) | CSS `order`, or collapse behind a "Filters" `<details>` on narrow viewports | Inferred |
| Medium | `/topics`, `/about/shorthand` have zero on-site nav links but are submitted to search engines via sitemap | `src/routes/sitemap.ts:35-36`; absent from `Header.tsx`/`Footer.tsx`/`home.tsx` | Add nav/footer links, or drop from sitemap until linked | Verified by auditor |
| Medium | Apple touch icon is SVG, which iOS does not support for "Add to Home Screen" (falls back to a page screenshot) | `src/routes/mobile.tsx:27-28` | Provide a real PNG apple-touch-icon | Verified by auditor |
| Low | Duplicate/nested `<main>` landmark on the 404 page — invalid HTML, confuses screen-reader landmark nav | `src/views/NotFound.tsx:7` inside `Layout.tsx:93`'s own `<main id="main">` | Use a `<div>`/`<section>` in `NotFound.tsx` | Verified by auditor |
| Low | No skip-to-content link; keyboard/screen-reader users tab through a 9-item nav + search on every page | `src/views/components/Layout.tsx` (no `<a href="#main">`) | Add a visually-hidden-until-focused skip link as first focusable element | Inferred |
| Low | `marked` output dropped into `dangerouslySetInnerHTML` with no HTML sanitizer; latent defense-in-depth gap (content is curator-seeded today, no admin UI writes to it) | `src/routes/gaps.tsx:18,40`; `src/routes/design-system.tsx` | Add a sanitize pass (e.g. DOMPurify/sanitize-html) regardless of current trust level | Verified by auditor |
| Low | Dead-end `#` link when a collection item has neither an episode match nor a canonical URL — silent no-op click | `src/routes/collections.tsx:138` | Render as non-link text, or omit the card, when no target exists | Verified by auditor |
| Low | Heading level skips `<h1>` → `<h3>` in the main results column (no `<h2>` before per-card headings) | `src/routes/episodes.tsx:66`; `src/views/components/EpisodeCard.tsx:57` — likely recurs on `/people`, `/places`, `/guests` (not individually re-verified) | Insert an `<h2>` section heading before the results grid | Verified by auditor |
| Low | Duplicate `apple-touch-icon` `<link>` tags (once unsized, once `sizes="180x180"`), compounding the SVG-format issue above | `src/routes/mobile.tsx:27-28` | Collapse to one correct PNG `<link>` | Verified by auditor |

*Caveat carried from the UI auditor:* no dynamic/browser rendering was performed anywhere in
this audit (sandboxed `docker run` was blocked) — every UI finding is from static source
reading, though most cite exact file:line evidence. `public/m/app.js`'s escaping pattern was
spot-checked and found consistently correct (`esc()` used before every `innerHTML` write
checked), but not exhaustively for every template branch.

---

## 3. Performance findings

| Sev | Finding | Location | Fix | Status |
|---|---|---|---|---|
| High | Per-request footer-stats fan-out (`fetchLastImport`+`fetchRowCounts`, a 10-way `UNION ALL count(*)`) runs uncached on every route | `src/db/queries.ts:327-343`; called from 18 route files | Compute once at boot/on import, cache with the existing `apiCache` or `lru-cache` | Verified (independent) |
| High | Static assets carry no `Cache-Control`/`ETag`/`Last-Modified`, so the `BUILD_ID` `?v=` cache-buster mechanism is inert | `src/server.tsx:52-54` (`serveStatic`, confirmed against shipped `@hono/node-server` code) | Add long-lived immutable `Cache-Control` via `onFound` | Verified (independent) |
| High | No response compression anywhere except one hand-rolled endpoint; Hono's bundled `compress`/`etag` unused | `grep` across `src/` for `compress\|gzip\|brotli`; only `src/routes/api.ts:136-198` hand-rolls gzip | `app.use('*', compress())` globally | Verified (independent) |
| High | Leading-wildcard `ILIKE` search with no trigram/GIN index anywhere in migration history | `src/db/queries.ts:70-76`; `schema.ts`/`drizzle/000*.sql` | `pg_trgm` extension + GIN indexes on title/description/guest name | Verified (independent) |
| High | Dockerfile installs via `npm install`, never copying `pnpm-lock.yaml` into the image | `Dockerfile:8-9` | `COPY pnpm-lock.yaml` + `pnpm install --frozen-lockfile`, or commit+use `npm ci` | Verified (independent) |
| Medium | `/episodes` list fires ~11-13 DB queries per request (page + count + 6-7 facet aggregations + tags/import/counts), none cached; HTML response sets no `Cache-Control` (unlike its JSON API twin) | `src/routes/episodes.tsx:42-48`; `src/db/queries.ts:107-186` | Cache facet results keyed on filter combo + last-import id (same strategy as `api.ts:26-61`); add `Cache-Control` to HTML | Verified by auditor |
| Medium | `/people/:slug` runs two full aggregating queries over the entire roster, then filters to one row in JS | `src/db/queries.ts:611-616,398-455` | Add `fetchPersonBySlug(slug)` filtering in SQL instead of aggregate-then-discard | Verified by auditor |
| Medium | Facet counting uses correlated per-row subqueries for topic/theme/tag filters — scales linearly worse as tables grow | `src/db/queries.ts:78-86` (`whereFor()`) | Pre-aggregated join or `array_agg`+`@>` against a GIN index instead of correlated subqueries | Inferred |
| Medium | Fly config scales to zero (`min_machines_running=0`) with an always-on in-request migration check, compounding cold-start latency before the first request even reaches the 10-13 query fan-out | `fly.toml`; `src/server.tsx:84-100` (`maybeMigrate()`) | Keep `min_machines_running≥1` if cold start matters, or move migration check to a release step | Verified config / inferred effect |
| Medium | No `[http_service.concurrency]` limits configured alongside a single small VM and a 5-connection DB pool that a single request can consume most of | `fly.toml`; `src/db/client.ts:9` (`max: 5`) | Set explicit concurrency soft/hard limits | Inferred, not measured under load |
| Low | `BodoniModa-Bold.woff2` (46KB) referenced nowhere in the repo; `Regular`/`ItalicRegular` variants used only by the separate `/m` PWA shell, not the main site | `public/fonts/BodoniModa-*.woff2`; `public/m/style.css:11,18` — see also Documentation §, same fact | Delete the unused Bold file; confirm Regular/ItalicRegular are still needed for `/m` | Verified by auditor |
| Low | `serveStatic` mounted twice on the same `/static/*` path (`./public` then `./dist/public`, a byte-identical duplicate baked into the same image) | `src/server.tsx:53-54` | Drop one of the two mounts | Verified by auditor |
| Low | No font preload/preconnect hints; custom fonts are only discoverable after `typography.css` downloads and parses | `src/views/components/Layout.tsx` `<head>` (~lines 68-84) | Preload the 1-2 above-the-fold font files | Verified by auditor |
| Low | 5 separate render-blocking stylesheets per page, unbundled and unminified (68KB uncompressed total, modest today) | `Layout.tsx` head; `package.json` build script (no CSS bundling step) | Concatenate/minify into one hashed bundle at build time | Verified by auditor |

*Clean result carried from Performance:* DB connection handling itself is correct — a single
module-level `postgres()` client (`max: 5`, `prepare: false`, correctly disabled for the Neon
pooler) shared across requests, not re-created per request (`src/db/client.ts:9`). Called out
so it isn't mistaken for a defect.

---

## 4. Documentation findings

| Sev | Finding | Location | Fix | Status |
|---|---|---|---|---|
| Medium | `data/gaps.md` is an orphaned file nothing reads; its "recently resolved" headline (S10/S11 counts) contradicts the actual `meta.gaps` data that `/gaps` renders, which still shows the old unresolved numbers | `data/gaps.md:7-8`; real generator is `buildGapsMarkdown()` in `src/import/run.ts:419-435` from `episodes.json`'s `meta.gaps` | Wire `gaps.md`'s content into the generator, or delete it and update `meta.gaps` to the true current state (**maintainer call — see §6**) | Verified by auditor |
| Medium | README's claim that stills are "fetched at deploy time" by `scripts/mst-download-thumbs.mjs` describes a step nothing in Dockerfile/fly.toml/CI actually automates | `README.md:74-76`; zero references to the script outside the README | Reword to "run manually before deploying," or actually wire it into a build/CI step | Verified by auditor |
| Medium | No documentation of how the live Postgres DB is actually seeded — `data:import`/entity-persistence scripts have no path to run inside the deployed container at all (runtime image strips `tsx` and the raw data JSON files) | `README.md:103-107` ("Deploy" section); `Dockerfile:21,27-33` | Document the real production seeding process (run `data:import` locally against `DATABASE_URL_UNPOOLED` before deploying) | Verified by auditor |
| Medium | `docs/data-sources.md` and `data/gaps.md` give three different counts for the same claim (The Martha Stewart Show broadcast days: 1,216 vs. ~1,207 vs. 1,106 actual rows) | `data/gaps.md:14`; `data/episodes.json` → `meta.gaps[2]`; `data/mss_calendar.json` (1,106 entries, counted directly) | Pick one source of truth; compute at render time rather than hand-typing in markdown | Verified by auditor |
| Medium | `SESSION_SECRET` is documented as a config knob (README, `.env.example`) and parsed by `env.ts`, but is never read anywhere else in the codebase — dead config, and the admin cookie is set unsigned | `README.md:56`; `.env.example:10`; `src/lib/env.ts:10`; admin cookie at `src/routes/admin.tsx:25-31` | Wire it into cookie signing or remove it from docs/env schema (**maintainer call — see §6**; duplicated in Secrets §5 below, listed once) | Verified by auditor |
| Low | README's font-stack line omits a fourth self-hosted family actively in use (Cormorant SC); separately, `BodoniModa-*` fonts are committed and were originally reported (wrongly — see correction below) as never declared via `@font-face` anywhere | `README.md:39`; `public/styles/tokens.css:46-48`; `scripts/fetch-fonts.mjs:15-18` — BodoniModa detail duplicates the Performance finding above | Add Cormorant SC to the README stack line; resolved (**see §9**) | Verified by auditor, correction below |
| Low | `BUILD_ID` is an env var read in code (optional CSS cache-buster override) but appears in no doc or `.env.example` | `src/views/components/Layout.tsx:15` | Add a one-line commented entry to `.env.example` | Verified by auditor |
| Low | Standalone `mst-*.mjs` scripts require `DATABASE_URL_UNPOOLED` with no fallback, unlike the app itself (`env.ts` marks it optional; `run.ts` falls back to `DATABASE_URL`) — a likely footgun for anyone following the README's minimal `.env` setup | `scripts/mst-persist-entities.mjs:10`, `mst-augment.mjs:12`, `mst-match.mjs:12`, `mst-match-v2.mjs:15`, `mst-persist.mjs:7`, `tag-enrich.mjs:6` | Document both DB URL vars as mandatory for entity scripts, or add the same `?? DATABASE_URL` fallback | Inferred (code path reasoned, not reproduced against an incomplete `.env`) |
| Low | README's entity counts ("110+ named chefs," "340+ farms...") are stale lower bounds — actual committed data has 133 people / 366 places | `README.md:22-27`; `data/marthastewart-tv/entities.json` (counted directly) | Update counts, or compute at render time (DB already has the true counts) | Verified by auditor |
| Low | No documented required pnpm version (no `packageManager` field, no version in README/CONTRIBUTING); separately, the Dockerfile's deliberate npm-vs-pnpm discrepancy (`Dockerfile:9-10` comment: "corepack pnpm signing fails on this image") is never explained in any doc, even though CI pins pnpm 9 | `package.json`; `.github/workflows/ci.yml:13`; `Dockerfile:9-10` — the underlying npm/lockfile practice is the Performance/Fix-First Dockerfile finding above; this is the *undocumented* angle on it | Add a note near "Deploy" explaining the exception; add `packageManager` to pin the pnpm version CI expects | Verified by auditor |

**Correction to the source docs-audit note:** the documentation audit's "verified as correct"
section stated that all `dangerouslySetInnerHTML` usages "go through either `decorateShorthandSafe`
... or `safeJsonForScriptTag` — consistent with SECURITY.md's escaping policy, not a violation of
it." Both the UI audit and the independent verification pass demonstrate this is **wrong** for
one specific path: `decorateShorthand()`'s idempotency short-circuit
(`src/lib/shorthand.ts:58-60`) returns input completely unescaped whenever it contains the
literal substring `class="shorthand"`, which is exactly the XSS bypass listed as the top Fix
First item above. The verification pass's finding wins; the docs-audit statement should be read
as incorrect on this specific point (the general escaping *policy* it describes is real and
correctly implemented elsewhere — the bug is a gap in one function's contract, not an absence of
policy).

**Second correction, to the BodoniModa font-face finding (row above and its Performance-section
duplicate):** the source docs-audit stated `BodoniModa-*.woff2` are "never declared via
`@font-face` anywhere" in the repo. That is wrong: `public/m/style.css:11,18` declares
`@font-face` for `BodoniModa-Regular`/`BodoniModa-ItalicRegular`, which serve as the `/m` mobile
shell's real display font — the docs-audit's search for `@font-face` usage missed
`public/m/style.css` because it lives outside `public/styles/`, the main site's stylesheet
directory. The finding is accurate only for the *main* site (`public/styles/typography.css`
never references BodoniModa); it should not have been read as "unused" or "dead" repo-wide.
`BodoniModa-Bold.woff2` was correctly flagged as unreferenced anywhere and has since been
removed; Regular/Italic were kept because `/m` actually uses them (see Remediation status above
and §9).

---

## 5. Secrets findings

| Sev | Finding | Location | Fix | Status |
|---|---|---|---|---|
| High | Admin bearer token accepted via `?key=...` on the initial `GET /admin` hand-off — can leak via proxy/CDN/browser-history/Referer even though the app's own logger and the subsequent cookie are handled safely | `src/routes/admin.tsx:21-33`; `SECURITY.md:17-19` (self-acknowledged trade-off) | Accept the initial token only via POST/header; rotate `ADMIN_TOKEN` regularly (**maintainer call on keeping this flow at all — see §6**) | Verified (independent) |
| Medium | `SESSION_SECRET` is declared, documented, and Zod-validated but consumed nowhere in `src/` — dead config, not a live secret, but a false sense of a session-signing mechanism that doesn't exist | `src/lib/env.ts:10`; `.env.example:9`; `README.md:56` — same fact as the Documentation-section finding above, listed once here | Wire into real session signing or remove the unused env var (**maintainer call — see §6**) | Verified by auditor |

Everything else the secrets audit checked came back clean — see §6 Clean results below (prior
JWT leak already remediated via history rewrite; no `.env` ever committed; no hardcoded
credentials, DB connection strings, or API-key-shaped strings in tree or history; safe
`.gitignore`/`.dockerignore`/CI workflow/`.npmrc`).

---

## 6. Personal-identifier (PII) findings

| Sev | Finding | Location | Fix | Status |
|---|---|---|---|---|
| Medium | LLM-generated `role`/bio text is persisted verbatim from `entities.json` straight to the public site (HTML-escaped, but not editorially reviewed) — structural point: everything below is public-facing, not internal research data | `scripts/mst-persist-entities.mjs:49,56` → DB `role` column → `src/routes/people.tsx:70,183,212`, `guests.tsx:60,115,117`, `episode-detail.tsx:141` | Add an editorial/confidence gate before `llm-review` output ships into `entities.json`'s public `role` text, specifically for health/legal/family assertions about lower-profile people | Verified by auditor |
| Low | Full exact DOB + birthplace of a semi-public contributor (Marc Morrone) — more identity-sensitive than a typical TV bio needs, even though he's a media personality | `data/marthastewart-tv/entities.json:13`; `scripts/mst-extract-entities.mjs:47` | Trim to birth year only unless the fuller date is load-bearing (**maintainer call — see §7**) | Verified by auditor |
| Low | Named private (non-celebrity) individuals from Martha's childhood, with hometown — mitigated by the fact this exact detail was already published by Martha herself on marthastewart.com | `identified.json:823-824` | No action strictly required; note provenance in-file so future editors know it traces to a Martha-published source (**maintainer call — see §7**) | Verified by auditor |
| Low | Personal-life detail (a 2004 wedding, a "close friend during Martha's prison term" framing) about a non-celebrity "inner circle" friend, partly sourced to a fan blog rather than a primary outlet | `identified.json:843` | Prefer the higher-quality source already cited alongside it; consider trimming the personal-relationship framing (**maintainer call — see §7**) | Verified by auditor |

Everything else the PII audit checked came back clean or judged acceptable as public-figure/
business content — see §6 Clean results below (business addresses of featured shops, a
documented public artist's cause of death, two long-established public authors' biographical
facts, and a full clean sweep for emails/phones/IPs/usernames/handles/hardcoded credentials).

---

## 7. Clean results

Checked and found fine — listed here so a future pass doesn't re-litigate them:

- **Secrets, full git history:** `git log --all -p` + `git fsck --full --unreachable --dangling`
  across all 37 commits shows the prior JWT/image leak (commit `2143cd1`, `git filter-repo`) is
  fully absent from this clone — no `_coll.html`, no JWT pattern, no orphaned blobs. (Caveat:
  GitHub-side retention of pre-rewrite objects cannot be checked from a local clone — see §8.)
- **No `.env` ever committed** in the working tree or any historical revision (only
  `.env.example`, which contains only empty/non-secret placeholder values).
- **No hardcoded DB connection strings, API keys, or `env.X || '<literal>'` fallback patterns**
  anywhere in `src/` or history (targeted regex scans for `sk-`, `AKIA...`, `ghp_`, `xox[baprs]-`,
  `AIza...`, embedded Postgres/MySQL/Mongo credentials — all zero matches).
- **`.gitignore`/`.dockerignore` correctly exclude `.env*`** (with `.env.example` carved back
  in); Dockerfile copies only named build artifacts, not the raw build context.
- **`.github/workflows/ci.yml` is safe** — standard `checkout`+`pnpm install/typecheck/test/
  build`, no `pull_request_target`, no secrets interpolated into shell steps.
- **`.npmrc` contains no registry auth token.**
- **Crawl/import scripts source credentials strictly from `process.env`**, throwing if unset,
  with no hardcoded fallback (`mst-crawl.mjs`, `mst-fetch-full.mjs`, `mst-fetch-playlists.mjs`).
- **No personal email addresses anywhere in scope** (data/public/scripts/tests/docs/src/
  drizzle/.github/fly.toml/package.json/LICENSE*/NOTICE) — regex verified against a positive
  control first.
- **Git commit history uses no real personal email** — a single pseudonymous GitHub noreply
  author handle; AI-authored commits use `noreply@anthropic.com` trailers.
- **No phone numbers, IP addresses, or local-filesystem usernames** found anywhere in scope
  (one false-positive Pinterest pin ID inspected and ruled out).
- **No social-media handles or private contact info for ordinary people** anywhere in scope.
- **Business street addresses of featured shops/restaurants** (several, tied to named owners) —
  standard "featured business" journalism content, not residential PII; no action needed.
- **A public artist's cause of death**, sourced to a real published obituary — acceptable public
  content.
- **Two long-established public authors' biographical facts** (birth year, hometown, spouse's
  death) — normal public biographical content for people with an independent public-figure
  footprint (near-100 published books, syndicated column).
- **SECURITY.md's admin-auth and rate-limiting descriptions match the code exactly**
  (timing-safe compare, httpOnly cookie, 404-on-failure, the query-param trade-off is
  self-disclosed; per-IP API rate limiting matches `src/middleware/rate-limit.ts`).
- **All `pnpm` script names, routes, and `.env.example` defaults cited in README/CONTRIBUTING
  match `package.json`/`src/routes/**`/`env.ts` exactly**; `pnpm typecheck` runs clean; CI does
  exactly what the README claims.
- **LICENSE/LICENSE-DATA/NOTICE split (MIT code / CC-BY-4.0 data+prose) is internally
  consistent** and matches the actual repo layout.
- **README's headline numbers are internally consistent** (12 shows, 1986–2024 range, 2,497
  fresh-import episodes + ~345 = the claimed 2,842 live-site total — checks out
  arithmetically against committed data).
- **DB connection handling is correct** — a single shared module-level client with a
  Neon-pooler-appropriate config (`prepare: false`), not re-created per request.

---

## 8. Not covered (merged from all six notes)

- **No dynamic/browser rendering anywhere in this audit set.** Sandboxed `docker run` was
  blocked after the daemon started, so nothing was confirmed by loading real HTML in a browser
  or curling a running server (UI, Performance). `public/scripts/places-map.js` (412 lines) and
  `src/routes/topics.tsx` (656 lines) were only spot-checked, not read line-by-line (UI).
- **No live database access.** No `DATABASE_URL` was available, so no `EXPLAIN ANALYZE` was run
  against real query plans or row-count statistics; all query-cost claims are inferred from
  comparing WHERE/ORDER/JOIN columns against declared indexes, not measured (Performance). No
  load testing or production Fly metrics were available either (Performance).
- **`src/import/**` (offline batch scripts) was skimmed but not scored for runtime cost** — it
  runs outside the live request path (Performance).
- **`docs/data-sources.md`'s raw crawl-derived counts** (e.g. "~1,100 MSL episodes," "6,299
  URLs") could not be checked — `data/marthastewart-tv/raw/` is git-ignored and not present in
  this checkout by design; flagged for a maintainer with crawl access, not asserted wrong
  (Documentation).
- **The live production site and Neon database were not queried** — all "2,842 episodes"-style
  production numbers were checked only for internal arithmetic consistency against committed
  data, not against the live deployment (Documentation).
- **GitHub-side residual git objects.** Whether GitHub itself retains dereferenced commit
  objects from before the `git filter-repo` history rewrite (reachable by direct SHA or old PR
  refs) cannot be checked from a local, read-only clone — would need GitHub support or a repo
  re-creation to fully close out (Secrets).
- **No dedicated entropy-based secret scanner** (gitleaks/trufflehog) was run — findings rely on
  targeted regex + manual review only; no network/tool install was available in the sandboxed
  pass (Secrets).
- **fly.io secrets store and Neon environment configuration** were not reachable from this
  read-only local clone (Secrets, PII).
- **`identified.json` (62 entries), `ambiguous.json`, and `dropped.json` were sampled by
  keyword grep, not read entity-by-entity.** A full manual read of `identified.json`
  specifically (the file that ships to the public site) is recommended as a follow-up, focused
  on any non-business/non-expert/non-author entry without an independent public-figure
  footprint (PII).
- **Full text of every episode transcript/description field** in `episodes.json`,
  `msl_s1s4.json`, `msl_s5_s9.json`, `mss_calendar.json` was grepped for PII patterns, not read
  end-to-end (PII).
- **GitHub Issues/PR history and comments** live on GitHub, not in the repo, and were not
  covered by any of the six audits.
- **A fresh `pnpm data:import` yields 2,497 of the live site's 2,842 episodes**, and `/people`/
  `/places` cross-links are sparse without the non-redistributed marthastewart.tv crawl — so
  local dynamic testing (had it been possible) would not fully match production content density
  (UI/Documentation data-completeness caveat, not a defect).
- **The `pg_trgm` migration (`drizzle/0004_familiar_captain_universe.sql`, added in `73d8e11`)
  has not been run against a live database.** Applying it requires `CREATE EXTENSION pg_trgm`,
  which needs elevated (superuser/`CREATE`) privilege on the target Postgres role; this was not
  verified against the project's actual Neon database, only checked to build correctly offline.
  Confirm the Neon role has the needed privilege (or that the extension is pre-enabled) before
  deploying this migration.
- **Footer-stats cache invalidation (added in `73d8e11`, `src/lib/cache.ts`) only covers
  admin-triggered reimports** — the admin route clears the cache on the import child process's
  exit. An import run directly from a shell (e.g. `pnpm data:import` outside the admin UI) has
  no invalidation hook and is bounded only by the cache's 3-minute TTL, so footer stats can lag
  up to ~3 minutes after a shell-run import before reflecting the new counts.

---

## 9. Open decisions for the maintainer

These were product/editorial calls the audits deliberately did not make on the maintainer's
behalf. As of 2026-09-05, all four have been decided:

1. **LLM-bio personal facts.** *Decided: leave as-is.* Marc Morrone's exact DOB + birthplace, the
   named childhood-neighbor detail, and the "close friend during Martha's 2004-05 prison term"
   framing all stay unchanged — all three are low-to-moderate sensitivity and traceable to
   public sources; no edit was made.
2. **The `?key=` admin login flow.** *Decided: keep for now.* The query-string hand-off stays in
   place rather than moving to POST/header-only; the credential-hygiene hardening this implies
   is tracked separately in
   [GitHub issue #1](https://github.com/thetimechain/martha-archive/issues/1) rather than
   done as part of this remediation pass.
3. **`data/gaps.md`.** *Decided: not wired in.* The file was not connected to
   `buildGapsMarkdown()`/`meta.gaps`. Instead it was relocated to `docs/gaps-notes.md` as
   maintainer-facing notes, with a new header on the file explicitly stating it is not read by
   the app and does not back any on-site content (commit `0c85bde`).
4. **Unused `BodoniModa` fonts.** *Decided: drop only the unused file.*
   `BodoniModa-Bold.woff2` was confirmed unreferenced anywhere and removed (commit `0c85bde`).
   `BodoniModa-Regular`/`ItalicRegular` were **not** dropped — they were found to be in real use
   as the `/m` display font, declared via `@font-face` in `public/m/style.css`. See the
   correction to the Documentation-section finding above: the original claim that no
   `@font-face` declaration existed for BodoniModa anywhere was wrong for `/m` — the docs-audit's
   search simply missed `public/m/style.css`.

Related but smaller documentation-only calls bundled into the same maintainer-facing bucket:
whether to add a `packageManager` field / document the Dockerfile's deliberate npm-vs-pnpm
split, and whether `SESSION_SECRET` should be wired into real cookie signing or removed from
`.env.example`/README/`env.ts` as dead config.
