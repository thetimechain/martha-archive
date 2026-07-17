# Contributing

Thanks for helping improve the Martha Stewart TV Archive. This is a
community-maintained fan project; corrections, additions, and new features are
all welcome.

## Ways to help

- **Fix or add entity data** — identify an unnamed guest, correct a
  misattributed place, enrich a bio. The people/places dataset is built by
  `scripts/mst-extract-entities.mjs`; see the "Extending the people/places
  dataset" section of the README for exactly where each kind of fact goes.
  Unresolved leads live in `data/marthastewart-tv/llm-review/` — every
  rejected or ambiguous extraction is listed there with its evidence, waiting
  for someone to identify it.
- **Fix or add episode data** — wrong date, missing title, unrecorded guest.
  Episode JSON lives in `data/` and is imported by `pnpm data:import`.
- **Research the gaps** — `/gaps` on the live site documents what's missing
  (notably descriptive titles for the 2002–2004 Hallmark-era episodes).
- **Improve the site** — accessibility, performance, search, design. The
  design system is documented live at `/design-system`.

## Ground rules for data

1. **Facts only.** Names, dates, places, segment titles. No transcripts, no
   video, no magazine text.
2. **Evidence required.** New entity attributions should cite the segment line
   or a verifiable source, same as the existing `role` fields do.
3. **Real people get care.** Private individuals (one-time guests,
   craftspeople) get factual, respectful descriptions only. If you are
   yourself in this archive and want something corrected or removed, open an
   issue — we honor takedown requests.

## Workflow

```bash
pnpm install
pnpm db:migrate && pnpm data:import   # see README for local Postgres setup
pnpm dev
pnpm typecheck && pnpm test:unit      # must pass before PR
```

Open a PR with a short description of what changed and why. For data changes,
include your source.
