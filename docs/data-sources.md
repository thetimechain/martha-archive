# Data sources & provenance

Every fact in this archive traces to one of the sources below. Nothing here is
scraped video, transcript, or magazine content — only broadcast metadata:
titles, dates, season/episode numbers, segment names, and the names of people
and places that appeared on air.

## Episode dataset (`data/episodes.json`, `data/msl_*.json`, `data/mss_calendar.json`)

- **Broadcast schedules and network programming records** — air dates and
  weekday patterns for the syndicated (1993–2002) and Hallmark (2002–2004)
  runs of *Martha Stewart Living*, and the daily *Martha Stewart Show*
  (2005–2012) strip.
- **marthastewart.tv** (the official Vimeo OTT streaming archive) — episode
  production codes, season groupings, and segment rundowns for the ~1,100
  MSL episodes the service carries. Only public page/API metadata was read;
  no video was downloaded.
- **TheTVDB** — cross-reference for titles and air dates where coverage
  exists (it is thin for MSL seasons 10–11, which is why `/gaps` exists).
- **Original prose** — the descriptive episode summaries were written for
  this project and are CC-BY-4.0 (see `LICENSE-DATA`).

## People & places dataset (`data/marthastewart-tv/segments-llm.json`, DB tables `mst_entities` / `mst_episode_entities`)

Built by `scripts/mst-extract-entities.mjs` from four source classes, each
tagged in the `source` column of every appearance row:

1. **Curated allowlists** (`PEOPLE`, `CURATED_PLACES` in the script) — hand-
   researched recurring contributors and businesses, with sourced bios.
2. **Manual credits** (`MANUAL_CREDITS`) — chefs identified by signature dish
   when their name never appears in the segment text.
3. **LLM segment extraction** (`segments-llm.json`) — entities mined from the
   verbatim segment rundowns, each carrying its evidence line; every new
   entity passed a two-vote adversarial verification. Audit trail:
   `data/marthastewart-tv/llm-review/`.
4. **Deep-research identifications** (also in `segments-llm.json`; audit in
   `llm-review/identified.json`) — previously unresolvable names identified by
   cross-referencing TheTVDB/Plex episode listings and first-party sources
   (publisher bios, obituaries, the businesses' own sites), with citations
   recorded per entity.

## What is deliberately absent

- **No transcripts** — the shows' videos carry no captions, and we do not
  republish spoken content.
- **No video or images from the shows** in this repository. Episode thumbnails
  on the live site are fetched at deploy time from the streaming service's
  public CDN and are not redistributed here.
- **No magazine content.**

Facts (titles, dates, names) are not copyrightable; the CC-BY-4.0 license in
`LICENSE-DATA` covers the original prose and the compilation's selection and
arrangement. Corrections and takedown requests: open a GitHub issue.
