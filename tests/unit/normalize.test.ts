import { describe, it, expect } from "vitest";
import { parseAirDate, normalizeGuest, normalizeRecipe, normalizeEpisode, stableEpisodeId } from "../../src/import/normalize.js";

describe("parseAirDate", () => {
  it("parses YYYY-MM-DD precision=day", () => {
    const p = parseAirDate("1995-04-15");
    expect(p.precision).toBe("day");
    expect(p.iso).toBe("1995-04-15");
    expect(p.year).toBe(1995);
    expect(p.month).toBe(4);
  });
  it("parses YYYY-MM precision=month", () => {
    const p = parseAirDate("1995-04");
    expect(p.precision).toBe("month");
    expect(p.iso).toBeNull();
    expect(p.year).toBe(1995);
    expect(p.month).toBe(4);
  });
  it("parses YYYY precision=year", () => {
    const p = parseAirDate("1995");
    expect(p.precision).toBe("year");
    expect(p.iso).toBeNull();
    expect(p.year).toBe(1995);
  });
  it("returns unknown for null / empty / junk", () => {
    expect(parseAirDate(null).precision).toBe("unknown");
    expect(parseAirDate("").precision).toBe("unknown");
    expect(parseAirDate("not a date").precision).toBe("unknown");
  });
});

describe("normalizeGuest", () => {
  it("string → name only", () => {
    expect(normalizeGuest("Snoop")).toEqual({ name: "Snoop", role: null });
  });
  it("{name, context} → role from context", () => {
    expect(normalizeGuest({ name: "Snoop", context: "Rapper" })).toEqual({ name: "Snoop", role: "Rapper" });
  });
  it("{name, role} respected", () => {
    expect(normalizeGuest({ name: "Snoop", role: "Co-host" })).toEqual({ name: "Snoop", role: "Co-host" });
  });
  it("drops empty / nameless", () => {
    expect(normalizeGuest("")).toBeNull();
    expect(normalizeGuest({})).toBeNull();
    expect(normalizeGuest(null)).toBeNull();
  });
});

describe("normalizeRecipe", () => {
  it("string → name only", () => {
    expect(normalizeRecipe("Pound Cake")).toEqual({ name: "Pound Cake", note: null });
  });
  it("object with name+note", () => {
    expect(normalizeRecipe({ name: "Pound Cake", note: "with bourbon" })).toEqual({ name: "Pound Cake", note: "with bourbon" });
  });
  it("drops empty", () => {
    expect(normalizeRecipe("")).toBeNull();
    expect(normalizeRecipe(null)).toBeNull();
  });
});

describe("stableEpisodeId", () => {
  it("uses .id when present", () => {
    expect(stableEpisodeId({ id: "abc", show_slug: "msl" })).toBe("abc");
  });
  it("hashes when missing", () => {
    const a = stableEpisodeId({ show_slug: "msl", title: "Cherry Preserves", air_date: "1993-09-18" });
    const b = stableEpisodeId({ show_slug: "msl", title: "Cherry Preserves", air_date: "1993-09-18" });
    expect(a).toBe(b);
    expect(a).toMatch(/^msl-/);
  });
});

describe("normalizeEpisode", () => {
  it("normalizes a realistic record end-to-end", () => {
    const out = normalizeEpisode({
      id: "ms-s01e01",
      show: "Martha & Snoop's Potluck Dinner Party",
      show_slug: "martha-and-snoops",
      season: 1,
      episode: 1,
      title: "Welcome",
      air_date: "2016-11-07",
      runtime_minutes: 60,
      network: "VH1",
      streaming: ["Paramount+"],
      description: "Pilot.",
      guests: [{ name: "Snoop Dogg", context: "Rapper" }, "Wiz Khalifa", ""],
      recipes: ["Fried Chicken", { name: "Mashed Potatoes" }, ""],
      topics: ["cooking", "celebrity"],
      tags: ["pilot", "2016"],
      themes: ["celebrity dinners"],
      sources: ["https://vh1.com/", "https://imdb.com/", "https://vh1.com/"],
      confidence: "confirmed",
      single_source: false,
    });
    expect(out.episode.id).toBe("ms-s01e01");
    expect(out.episode.showSlug).toBe("martha-and-snoops");
    expect(out.episode.airDate).toBe("2016-11-07");
    expect(out.episode.confidence).toBe("confirmed");
    expect(out.episode.sources).toEqual(["https://vh1.com/", "https://imdb.com/"]);
    expect(out.guests).toHaveLength(2);
    expect(out.recipes).toHaveLength(2);
    expect(out.topics.map((t) => t.topic)).toEqual(["cooking", "celebrity"]);
    expect(out.tags.map((t) => t.tag)).toEqual(["pilot", "2016"]);
  });

  it("coerces unknown confidence to inferred and warns", () => {
    const out = normalizeEpisode({ id: "x", show_slug: "msl", title: "t", confidence: "wonky" as any });
    expect(out.episode.confidence).toBe("inferred");
    expect(out.warnings.length).toBeGreaterThan(0);
  });
});
