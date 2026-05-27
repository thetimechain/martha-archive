// MSL TV segment-shorthand glossary.
//
// The vhx descriptions for Martha Stewart Living episodes are riddled with
// 2-4 letter segment-shorthand acronyms (COW, GT, QC, etc.). This module:
//   1. Maps each acronym to its expansion.
//   2. Decorates plain-text passages, wrapping each acronym in an <abbr>
//      tag so browsers + screen readers show the expansion on hover/focus.
//
// Decoded from research at
// E:/github/random/wiki/topics/martha-stewart-living-tv/wiki/topics/seasonal-arc.md.

export const SHORTHAND: Record<string, string> = {
  COW: "Cookie of the Week",
  GT:  "Good Thing",
  QC:  "Quick Cuisine",
  HQC: "Holiday Quick Cuisine",
  HTC: "How To Cook (101)",
  DYK: "Did You Know",
  TOW: "Tool of the Week",
  FT:  "Field Trip",
  FTE: "Field Trip (Extended)",
  COM: "Cooking of the Month",
};

// HTML-escape a string for safe embedding.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ACRONYMS = Object.keys(SHORTHAND);
// Order longer codes first so HQC matches before HC, FTE before FT.
ACRONYMS.sort((a, b) => b.length - a.length);

// Match a shorthand only when:
//   - it's preceded by a word boundary,
//   - it's followed by end-of-string OR by punctuation/whitespace,
// to avoid false positives like "cow", "Microsoft", "got".
const SHORTHAND_RE = new RegExp(
  `\\b(${ACRONYMS.join("|")})\\b(?=$|[\\s,.;:·—–\\-(){}\\[\\]]|\\&)`,
  "g",
);

/**
 * Wrap each known shorthand acronym in an <abbr title="…"> element.
 *
 * Input is treated as plain text (no HTML). It is HTML-escaped first; the
 * <abbr> tags are then injected into the escaped output. Safe to use as
 * the value of a `dangerouslySetInnerHTML` prop.
 *
 * Idempotent: if the input already contains `class="shorthand"`, returns it
 * unchanged.
 */
export function decorateShorthand(text: string): string {
  if (!text) return "";
  if (text.includes('class="shorthand"')) return text;
  const escaped = escapeHtml(text);
  return escaped.replace(SHORTHAND_RE, (m) => {
    const expansion = SHORTHAND[m] ?? "";
    if (!expansion) return m;
    return `<abbr class="shorthand" title="${escapeHtml(expansion)}">${m}</abbr>`;
  });
}

/** Convenience wrapper for Hono JSX: `dangerouslySetInnerHTML={decorateShorthandSafe(s)}`. */
export function decorateShorthandSafe(text: string | null | undefined): { __html: string } {
  return { __html: decorateShorthand(text ?? "") };
}
