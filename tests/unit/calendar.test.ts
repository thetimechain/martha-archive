import { describe, it, expect } from "vitest";
import { monthCells } from "../../src/lib/calendar.js";

describe("monthCells", () => {
  it("returns 42 cells", () => {
    expect(monthCells(2007, 1)).toHaveLength(42);
    expect(monthCells(2024, 2)).toHaveLength(42); // leap
  });
  it("February 2024 has 29 day cells", () => {
    const cells = monthCells(2024, 2);
    expect(cells.filter((c) => c.kind === "day")).toHaveLength(29);
  });
  it("February 2023 has 28 day cells", () => {
    const cells = monthCells(2023, 2);
    expect(cells.filter((c) => c.kind === "day")).toHaveLength(28);
  });
  it("first day has correct iso", () => {
    const cells = monthCells(2007, 1);
    const firstDay = cells.find((c) => c.kind === "day" && c.day === 1);
    expect(firstDay).toBeTruthy();
    expect(firstDay!.kind === "day" && firstDay.iso).toBe("2007-01-01");
  });
});
