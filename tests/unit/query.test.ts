import { describe, it, expect } from "vitest";
import { parseEpisodeQuery, calcLastPage, buildHref } from "../../src/lib/query.js";

describe("parseEpisodeQuery", () => {
  it("defaults page to 1, sort to date-desc", () => {
    const p = parseEpisodeQuery({});
    expect(p.page).toBe(1);
    expect(p.sort).toBe("date-desc");
    expect(p.pageSize).toBe(24);
    expect(p.show).toEqual([]);
  });

  it("parses single-value show as array of one", () => {
    const p = parseEpisodeQuery({ show: "msl" });
    expect(p.show).toEqual(["msl"]);
  });

  it("parses repeated show params as array", () => {
    const p = parseEpisodeQuery({ show: ["msl", "mss"] });
    expect(p.show).toEqual(["msl", "mss"]);
  });

  it("only honors season when exactly one show is set", () => {
    expect(parseEpisodeQuery({ show: "msl", season: "5" }).season).toBe(5);
    expect(parseEpisodeQuery({ show: ["msl", "mss"], season: "5" }).season).toBeUndefined();
    expect(parseEpisodeQuery({ season: "5" }).season).toBeUndefined();
  });

  it("silently coerces bad sort to date-desc", () => {
    expect(parseEpisodeQuery({ sort: "garbage" }).sort).toBe("date-desc");
  });

  it("ignores invalid confidence", () => {
    expect(parseEpisodeQuery({ confidence: "garbage" }).confidence).toBeUndefined();
    expect(parseEpisodeQuery({ confidence: "confirmed" }).confidence).toBe("confirmed");
  });

  it("clamps page to >= 1", () => {
    expect(parseEpisodeQuery({ page: "0" }).page).toBe(1);
    expect(parseEpisodeQuery({ page: "-5" }).page).toBe(1);
    expect(parseEpisodeQuery({ page: "abc" }).page).toBe(1);
  });
});

describe("calcLastPage", () => {
  it("returns 1 for empty results", () => {
    expect(calcLastPage(0, 24)).toBe(1);
  });
  it("rounds up", () => {
    expect(calcLastPage(25, 24)).toBe(2);
    expect(calcLastPage(48, 24)).toBe(2);
    expect(calcLastPage(49, 24)).toBe(3);
  });
});

describe("buildHref", () => {
  it("preserves multi-value params", () => {
    const p = parseEpisodeQuery({ show: ["msl", "mss"], topic: "cooking" });
    const href = buildHref(p);
    expect(href).toContain("show=msl");
    expect(href).toContain("show=mss");
    expect(href).toContain("topic=cooking");
  });
  it("omits default sort and page=1", () => {
    const p = parseEpisodeQuery({});
    expect(buildHref(p)).toBe("/episodes");
  });
});
