import { z } from "zod";

export const SORTS = ["date-desc", "date-asc", "show", "title"] as const;
export type Sort = (typeof SORTS)[number];

export const CONFIDENCES = ["confirmed", "partial", "inferred"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export type EpisodeQuery = {
  q: string | undefined;
  show: string[];
  season: number | undefined;
  year: number | undefined;
  topic: string[];
  theme: string[];
  guest: string | undefined;
  tag: string[];
  confidence: Confidence | undefined;
  sort: Sort;
  page: number;
  pageSize: number;
};

function multi(v: string | string[] | undefined): string[] {
  if (v === undefined || v === null) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr
    .flatMap((s) => String(s).split(","))
    .map((s) => s.trim())
    .filter(Boolean);
}

function singleStr(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  const s = Array.isArray(v) ? v[0] : v;
  return s ? String(s).trim() || undefined : undefined;
}

function intOrUndef(v: string | string[] | undefined): number | undefined {
  const s = singleStr(v);
  if (!s) return undefined;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
}

export function parseEpisodeQuery(raw: Record<string, string | string[] | undefined>): EpisodeQuery {
  const shows = multi(raw.show);
  const season = shows.length === 1 ? intOrUndef(raw.season) : undefined;
  const year = intOrUndef(raw.year);
  const pageRaw = intOrUndef(raw.page);
  const page = pageRaw && pageRaw > 0 ? pageRaw : 1;
  const sortRaw = singleStr(raw.sort);
  const sort: Sort = SORTS.includes(sortRaw as Sort) ? (sortRaw as Sort) : "date-desc";
  const confidenceRaw = singleStr(raw.confidence);
  const confidence = CONFIDENCES.includes(confidenceRaw as Confidence) ? (confidenceRaw as Confidence) : undefined;

  return {
    q: singleStr(raw.q),
    show: shows,
    season,
    year,
    topic: multi(raw.topic),
    theme: multi(raw.theme),
    guest: singleStr(raw.guest),
    tag: multi(raw.tag),
    confidence,
    sort,
    page,
    pageSize: 24,
  };
}

export function buildHref(params: EpisodeQuery, overrides: Partial<EpisodeQuery> = {}, base = "/episodes"): string {
  const p = { ...params, ...overrides };
  const sp = new URLSearchParams();
  if (p.q) sp.set("q", p.q);
  for (const s of p.show) sp.append("show", s);
  if (p.season !== undefined) sp.set("season", String(p.season));
  if (p.year !== undefined) sp.set("year", String(p.year));
  for (const t of p.topic) sp.append("topic", t);
  for (const t of p.theme) sp.append("theme", t);
  if (p.guest) sp.set("guest", p.guest);
  for (const t of p.tag) sp.append("tag", t);
  if (p.confidence) sp.set("confidence", p.confidence);
  if (p.sort !== "date-desc") sp.set("sort", p.sort);
  if (p.page > 1) sp.set("page", String(p.page));
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

export function calcLastPage(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export const EpisodeQuerySchema = z.object({
  q: z.string().optional(),
  show: z.union([z.string(), z.array(z.string())]).optional(),
  season: z.coerce.number().int().optional(),
  year: z.coerce.number().int().optional(),
  topic: z.union([z.string(), z.array(z.string())]).optional(),
  theme: z.union([z.string(), z.array(z.string())]).optional(),
  guest: z.string().optional(),
  tag: z.union([z.string(), z.array(z.string())]).optional(),
  confidence: z.enum(CONFIDENCES).optional(),
  sort: z.enum(SORTS).optional(),
  page: z.coerce.number().int().positive().optional(),
  partial: z.string().optional(),
});
