import { createHash } from "node:crypto";
import type {
  EpisodeInsert,
  EpisodeGuestInsert,
  EpisodeRecipeInsert,
  EpisodeTopicInsert,
  EpisodeThemeInsert,
  EpisodeTagInsert,
  MssCalendarEntryInsert,
  ShowInsert,
} from "../db/schema.js";

export type RawEpisode = {
  id?: string;
  show?: string;
  show_slug?: string;
  season?: number | null;
  episode?: number | null;
  title?: string | null;
  air_date?: string | null;
  runtime_minutes?: number | null;
  network?: string | null;
  streaming?: string[];
  description?: string | null;
  guests?: Array<string | { name?: string; context?: string; role?: string } | null>;
  recipes?: Array<string | { name?: string; note?: string; context?: string } | null>;
  topics?: string[];
  tags?: string[];
  themes?: string[];
  sources?: string[];
  confidence?: "confirmed" | "partial" | "inferred" | null;
  single_source?: boolean;
};

export type ParsedAirDate = {
  raw: string | null;
  iso: string | null;
  year: number | null;
  month: number | null;
  precision: "day" | "month" | "year" | "unknown";
};

export function parseAirDate(raw: string | null | undefined): ParsedAirDate {
  if (!raw) return { raw: null, iso: null, year: null, month: null, precision: "unknown" };
  const s = String(raw).trim();
  if (!s) return { raw: null, iso: null, year: null, month: null, precision: "unknown" };
  const m = s.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
  if (!m) return { raw: s, iso: null, year: null, month: null, precision: "unknown" };
  const year = Number(m[1]);
  const month = m[2] ? Number(m[2]) : null;
  const day = m[3] ? Number(m[3]) : null;
  if (day !== null && month !== null) {
    return { raw: s, iso: `${m[1]}-${m[2]}-${m[3]}`, year, month, precision: "day" };
  }
  if (month !== null) return { raw: s, iso: null, year, month, precision: "month" };
  return { raw: s, iso: null, year, month: null, precision: "year" };
}

export function normalizeGuest(g: unknown): { name: string; role: string | null } | null {
  if (g === null || g === undefined) return null;
  if (typeof g === "string") {
    const name = g.trim();
    return name ? { name, role: null } : null;
  }
  if (typeof g === "object") {
    const obj = g as { name?: string; context?: string; role?: string };
    const name = (obj.name ?? "").trim();
    if (!name) return null;
    const role = (obj.role ?? obj.context ?? "").trim() || null;
    return { name, role };
  }
  return null;
}

export function normalizeRecipe(r: unknown): { name: string; note: string | null } | null {
  if (r === null || r === undefined) return null;
  if (typeof r === "string") {
    const name = r.trim();
    return name ? { name, note: null } : null;
  }
  if (typeof r === "object") {
    const obj = r as { name?: string; note?: string; context?: string };
    const name = (obj.name ?? "").trim();
    if (!name) return null;
    const note = (obj.note ?? obj.context ?? "").trim() || null;
    return { name, note };
  }
  return null;
}

const COERCED_CONFIDENCES = new Set(["confirmed", "partial", "inferred"]);

export function stableEpisodeId(raw: RawEpisode): string {
  if (raw.id && typeof raw.id === "string" && raw.id.trim()) return raw.id.trim();
  const h = createHash("sha1")
    .update(`${raw.show_slug ?? ""}|${raw.title ?? ""}|${raw.air_date ?? ""}|${raw.season ?? ""}|${raw.episode ?? ""}`)
    .digest("hex")
    .slice(0, 16);
  return `${raw.show_slug ?? "unknown"}-${h}`;
}

export function normalizeShow(meta: any): ShowInsert {
  const yearsLabel = meta.years ?? null;
  let startYear: number | null = null;
  let endYear: number | null = null;
  if (typeof yearsLabel === "string") {
    const m = yearsLabel.match(/^(\d{4})\s*[–\-]?\s*(\d{4})?/);
    if (m) {
      startYear = Number(m[1]);
      endYear = m[2] ? Number(m[2]) : null;
    }
  }
  return {
    slug: String(meta.slug ?? "").trim(),
    name: String(meta.name ?? "").trim(),
    network: meta.network ?? null,
    yearsLabel,
    startYear,
    endYear,
    totalEpisodes: meta.total_episodes ?? null,
    documented: meta.documented ?? null,
    description: null,
    gapNote: meta.gap_note ?? null,
    sortOrder: 0,
  };
}

export type NormalizedEpisode = {
  episode: EpisodeInsert;
  guests: Omit<EpisodeGuestInsert, "id">[];
  recipes: Omit<EpisodeRecipeInsert, "id">[];
  topics: Omit<EpisodeTopicInsert, "id">[];
  themes: Omit<EpisodeThemeInsert, "id">[];
  tags: Omit<EpisodeTagInsert, "id">[];
  warnings: string[];
};

export function normalizeEpisode(raw: RawEpisode): NormalizedEpisode {
  const id = stableEpisodeId(raw);
  const date = parseAirDate(raw.air_date);
  const warnings: string[] = [];

  let confidence: "confirmed" | "partial" | "inferred" = "inferred";
  if (raw.confidence && COERCED_CONFIDENCES.has(raw.confidence)) {
    confidence = raw.confidence as any;
  } else if (raw.confidence) {
    warnings.push(`unknown confidence "${raw.confidence}" → inferred`);
  }

  // dedup sources
  const sources = Array.from(
    new Set(
      (raw.sources ?? [])
        .map((s) => (s ?? "").trim())
        .filter(Boolean),
    ),
  );

  const episode: EpisodeInsert = {
    id,
    showSlug: (raw.show_slug ?? "unknown").trim(),
    showName: (raw.show ?? "").trim() || null,
    season: raw.season ?? null,
    episodeNumber: raw.episode ?? null,
    title: (raw.title ?? "").trim() || "(untitled)",
    airDateRaw: date.raw,
    airDate: date.iso as any,
    airYear: date.year,
    airMonth: date.month,
    airPrecision: date.precision,
    runtimeMinutes: raw.runtime_minutes ?? null,
    network: raw.network ?? null,
    streaming: Array.isArray(raw.streaming) ? raw.streaming : [],
    description: raw.description ?? null,
    confidence,
    singleSource: typeof raw.single_source === "boolean" ? raw.single_source : sources.length === 1,
    sources,
  };

  const guests: NormalizedEpisode["guests"] = [];
  let gPos = 0;
  for (const g of raw.guests ?? []) {
    const n = normalizeGuest(g);
    if (n) guests.push({ episodeId: id, name: n.name, role: n.role, position: gPos++ });
  }

  const recipes: NormalizedEpisode["recipes"] = [];
  let rPos = 0;
  for (const r of raw.recipes ?? []) {
    const n = normalizeRecipe(r);
    if (n) recipes.push({ episodeId: id, name: n.name, note: n.note, position: rPos++ });
  }

  const dedup = (arr: unknown[] | undefined): string[] =>
    Array.from(new Set((arr ?? []).map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean)));

  const topics = dedup(raw.topics).map((topic) => ({ episodeId: id, topic }));
  const themes = dedup(raw.themes).map((theme) => ({ episodeId: id, theme }));
  const tags = dedup(raw.tags).map((tag) => ({ episodeId: id, tag }));

  return { episode, guests, recipes, topics, themes, tags, warnings };
}

export function normalizeCalendarEntry(raw: any): MssCalendarEntryInsert | null {
  const dateStr = raw?.air_date;
  if (!dateStr) return null;
  const parsed = parseAirDate(dateStr);
  if (parsed.precision !== "day" || !parsed.iso) return null;
  const dt = new Date(`${parsed.iso}T00:00:00Z`);
  const weekday = dt.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return {
    episodeId: typeof raw.id === "string" ? raw.id : null,
    airDate: parsed.iso as any,
    weekday,
    title: raw.title ?? null,
    notes: null,
  };
}
