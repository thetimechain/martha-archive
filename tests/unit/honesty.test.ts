import { describe, expect, it } from "vitest";
import {
  cleanSynopsis,
  gradeOf,
  isGeneratedSynopsis,
  isPersonFiledAsRecipe,
  isPlaceholder,
  regradeAll,
  segments,
  subjectKey,
  untitledTitle,
  type GradeInput,
} from "../../src/lib/honesty.js";

const row = (o: Partial<GradeInput>): GradeInput => ({
  id: "x",
  showSlug: "s",
  title: "A Title",
  description: "A real synopsis.",
  confidence: "confirmed",
  singleSource: false,
  airDate: "2000-05-05",
  airPrecision: "day",
  season: 1,
  episodeNumber: 1,
  tags: [],
  ...o,
});

describe("grades", () => {
  it("gives one grade per record from confidence, single source and placeholder", () => {
    expect(gradeOf({ confidence: "confirmed", singleSource: false, isPlaceholder: false })).toBe("confirmed");
    expect(gradeOf({ confidence: "confirmed", singleSource: true, isPlaceholder: false })).toBe("single");
    expect(gradeOf({ confidence: "partial", singleSource: true, isPlaceholder: false })).toBe("partial");
    expect(gradeOf({ confidence: "confirmed", singleSource: false, isPlaceholder: true })).toBe("inferred");
  });
  it("recognizes placeholders by title or tag", () => {
    expect(isPlaceholder({ title: "Martha Stewart Show S1E3" })).toBe(true);
    expect(isPlaceholder({ title: "Season 7 Episode 100" })).toBe(true);
    expect(isPlaceholder({ title: "Pie Crust", tags: ["unconfirmed"] })).toBe(true);
    expect(isPlaceholder({ title: "Pie Crust", tags: [] })).toBe(false);
  });
});

describe("synopses", () => {
  it("withholds template synopses and strips filler sentences", () => {
    expect(isGeneratedSynopsis("A multi-segment episode covering pies; tarts.")).toBe(true);
    expect(cleanSynopsis("Martha takes the show on location to X, offering an immersive look at what makes this destination significant to food.")).toBeNull();
    expect(cleanSynopsis("Snoop cooks. Celebrity guests judge as both hosts bring their distinct sensibilities to the challenge, producing fun.")).toBe("Snoop cooks.");
    expect(cleanSynopsis("Martha applies her characteristic precision to household organization.")).toContain("characteristic precision");
  });
  it("lists segments only when the title has several", () => {
    expect(segments("Chocolate Chip Cookies; Hydrangeas; Oven-Dried Tomatoes")).toHaveLength(3);
    expect(segments("Balthazar")).toEqual([]);
  });
});

describe("data fixes", () => {
  it("merges near-duplicate subjects and spots people filed as recipes", () => {
    expect(subjectKey("Celebrity Guest")).toBe("celebrity");
    expect(subjectKey("Baking")).toBe("Baking");
    expect(isPersonFiledAsRecipe({ name: "Wiz Khalifa", context: "Rapper" })).toBe(true);
    expect(isPersonFiledAsRecipe("Pound Cake")).toBe(false);
  });
});

describe("regradeAll", () => {
  it("finds year-only dates, disputed numbers and numbers untitled entries sharing a date", () => {
    const { out, disputes, yearOnly } = regradeAll([
      row({ id: "a", showSlug: "mb", airDate: "2019-01-01", episodeNumber: 1 }),
      row({ id: "b", showSlug: "mb", airDate: "2019-01-01", episodeNumber: 2 }),
      row({ id: "c", showSlug: "msl", airDate: "1994-01-01", episodeNumber: 3 }),
      row({ id: "d", showSlug: "msl", season: 9, episodeNumber: 1 }),
      row({ id: "e", showSlug: "msl", season: 9, episodeNumber: 1 }),
      row({ id: "p1", showSlug: "mss", title: "Martha Stewart Show S7E1", airDate: "2012-04-27", episodeNumber: 7 }),
      row({ id: "p2", showSlug: "mss", title: "Season 7 Episode 100", airDate: "2012-04-27", episodeNumber: 7 }),
    ]);
    const by = Object.fromEntries(out.map((o) => [o.id, o]));
    expect(yearOnly).toBe(2);
    expect(by.a.airPrecision).toBe("year");
    expect(by.c.airPrecision).toBe("day");
    expect(disputes).toEqual([["d", "e"]]);
    expect(by.p1.numberDisputed).toBe(false);
    expect(by.p1.title).toBe("Untitled broadcast, April 27, 2012, entry 1 of 2");
    expect(by.p1.description).toBeNull();
    expect(by.p2.grade).toBe("inferred");
    expect(by.a.title).toBe("A Title");
    expect(by.a.description).toBe("A real synopsis.");
    expect(untitledTitle("2005-09-14")).toBe("Untitled broadcast, September 14, 2005");
  });
});
