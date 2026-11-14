// How well each record is supported, and what may be shown as fact.
// Pure: used by the import's regrade pass and as a read-time fallback.

export type Grade = "confirmed" | "single" | "partial" | "inferred";

const PLACEHOLDER_TITLE = /^((the )?martha stewart show s\d+e\d+|season \d+ episode \d+)$/i;

const GENERATED_SYNOPSIS = [
  /^A multi-segment episode covering /,
  /showcasing the breadth that made /,
  /with her characteristic precision, offering detailed instruction/,
  /offering an immersive look at what makes this destination significant/,
  /whose specific content has not yet been catalogued/,
];

const FILLER_SENTENCES = [/\s*Celebrity guests judge as both hosts bring their distinct sensibilities[^.]*\./g];

export const SUBJECT_ALIASES: Record<string, string> = {
  "celebrity guest": "celebrity",
  "chocolate desserts": "chocolate",
  "french technique": "french",
  "italian technique": "italian",
  "bread baking": "bread",
  "pastry arts": "pastry",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function isPlaceholder(e: { title: string; tags?: string[] | null }): boolean {
  return PLACEHOLDER_TITLE.test(e.title.trim()) || (e.tags ?? []).includes("unconfirmed");
}

export function isGeneratedSynopsis(description: string | null | undefined): boolean {
  return !!description && GENERATED_SYNOPSIS.some((re) => re.test(description));
}

export function cleanSynopsis(description: string | null | undefined): string | null {
  if (!description || isGeneratedSynopsis(description)) return null;
  const text = FILLER_SENTENCES.reduce((t, re) => t.replace(re, ""), description).trim();
  return text || null;
}

export function segments(title: string): string[] {
  const parts = title.split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [];
}

export function gradeOf(e: { confidence: string; singleSource: boolean; isPlaceholder: boolean }): Grade {
  if (e.isPlaceholder) return "inferred";
  if (e.confidence === "confirmed") return e.singleSource ? "single" : "confirmed";
  return "partial";
}

export function longDate(iso: string): string {
  const [y = 0, m = 1, d = 1] = iso.slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1] ?? ""} ${d}, ${y}`;
}

export function untitledTitle(airDate: string | null, entry?: { index: number; of: number }): string {
  const base = airDate ? `Untitled broadcast, ${longDate(airDate)}` : "Untitled broadcast";
  return entry && entry.of > 1 ? `${base}, entry ${entry.index} of ${entry.of}` : base;
}

export function subjectKey(value: string): string {
  const key = value.trim().toLowerCase();
  return SUBJECT_ALIASES[key] ?? value.trim();
}

/** A recipe entry that is really a person (an object carrying a `context`). */
export function isPersonFiledAsRecipe(r: unknown): r is { name: string; context: string } {
  return typeof r === "object" && r !== null && typeof (r as any).name === "string" && typeof (r as any).context === "string";
}

export const GRADE_LABEL: Record<Grade, string> = {
  confirmed: "Confirmed",
  single: "One listing",
  partial: "Partial",
  inferred: "Date inferred",
};

export const GRADE_TEXT: Record<Grade, string> = {
  confirmed: "Recorded in two or more independent sources.",
  single: "Recorded in one episode listing. It has not yet been checked against a second.",
  partial: "Documented from limited sources. Details may be incomplete.",
  inferred:
    "This entry stands for one weekday broadcast of the season. Its date is inferred from the season's broadcast calendar; its title, guests and content have not been found in public records.",
};

export const YEAR_ONLY_TEXT = "The listing gives the year of this episode but not the day.";
export const GENERATED_TEXT = "No synopsis is on record for this episode. The listing names these segments:";

export type GradeInput = {
  id: string;
  showSlug: string;
  title: string;
  description: string | null;
  confidence: string;
  singleSource: boolean;
  airDate: string | null;
  airPrecision: string | null;
  season: number | null;
  episodeNumber: number | null;
  tags: string[];
};

export type GradeOutput = {
  id: string;
  grade: Grade;
  isPlaceholder: boolean;
  synopsisGenerated: boolean;
  numberDisputed: boolean;
  /** What pages show. The originals go to source_title / source_description when they differ. */
  title: string;
  description: string | null;
  airPrecision: string | null;
};

/** Grades a whole table at once: year-only dates, disputed numbers and untitled numbering are cross-row facts. */
export function regradeAll(rows: GradeInput[]): { out: GradeOutput[]; disputes: string[][]; yearOnly: number } {
  const placeholder = new Map(rows.map((r) => [r.id, isPlaceholder(r)]));
  const count = <T>(key: (r: GradeInput) => T | null) => {
    const m = new Map<string, GradeInput[]>();
    for (const r of rows) {
      const k = key(r);
      if (k === null) continue;
      const s = String(k);
      m.set(s, [...(m.get(s) ?? []), r]);
    }
    return m;
  };
  const janFirst = count((r) => (r.airDate && r.airDate.slice(5, 10) === "01-01" ? `${r.showSlug} ${r.airDate.slice(0, 10)}` : null));
  const codes = count((r) => (r.season !== null && r.episodeNumber !== null && !placeholder.get(r.id) ? `${r.showSlug} ${r.season} ${r.episodeNumber}` : null));
  const untitledDays = count((r) => (placeholder.get(r.id) && r.airDate ? `${r.showSlug} ${r.airDate.slice(0, 10)}` : null));

  const yearOnlyIds = new Set([...janFirst.values()].filter((g) => g.length > 1).flat().map((r) => r.id));
  const disputes = [...codes.values()].filter((g) => g.length > 1).map((g) => g.map((r) => r.id).sort());
  const disputed = new Set(disputes.flat());
  const entry = new Map<string, { index: number; of: number }>();
  for (const group of untitledDays.values()) {
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
    sorted.forEach((r, i) => entry.set(r.id, { index: i + 1, of: sorted.length }));
  }

  const out = rows.map((r) => {
    const ph = placeholder.get(r.id)!;
    const yearOnly = yearOnlyIds.has(r.id);
    return {
      id: r.id,
      grade: gradeOf({ confidence: r.confidence, singleSource: r.singleSource, isPlaceholder: ph }),
      isPlaceholder: ph,
      synopsisGenerated: !ph && isGeneratedSynopsis(r.description),
      numberDisputed: disputed.has(r.id),
      title: ph ? untitledTitle(r.airDate, entry.get(r.id)) : r.title,
      description: ph ? null : cleanSynopsis(r.description),
      airPrecision: yearOnly ? "year" : r.airPrecision,
    };
  });
  return { out, disputes, yearOnly: yearOnlyIds.size };
}
