import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tokens = Object.fromEntries(
  [...readFileSync("public/styles/tokens.css", "utf8").matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]),
);

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const TEXT_PAIRS: [string, string][] = [
  ["body-text", "page-cream"],
  ["text-secondary", "page-cream"],
  ["text-secondary", "page-warm-white"],
  ["link", "page-cream"],
  ["hosta-text", "page-cream"],
  ["russet-text", "page-cream"],
  ["terracotta-text", "page-cream"],
  ["terracotta-text", "buttermilk"],
  ["mid-gray", "page-cream"],
  ["body-text", "bedford-gray"],
  ["body-text", "araucana-eggshell-blue"],
];

describe("text colors meet WCAG AA (4.5:1)", () => {
  for (const [fg, bg] of TEXT_PAIRS) {
    it(`${fg} on ${bg}`, () => {
      expect(tokens[fg], fg).toBeDefined();
      expect(tokens[bg], bg).toBeDefined();
      expect(contrast(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(4.5);
    });
  }
  it("bedford gray is never used as a text color", () => {
    const css = ["components.css", "layout.css", "typography.css", "base.css"].map((f) => readFileSync(`public/styles/${f}`, "utf8")).join("\n");
    expect(css).not.toMatch(/(?<![-\w])color:\s*var\(--bedford-gray\)/);
  });
});
