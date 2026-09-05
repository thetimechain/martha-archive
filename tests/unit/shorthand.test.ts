import { describe, it, expect } from "vitest";
import { decorateShorthand } from "../../src/lib/shorthand.js";

describe("decorateShorthand", () => {
  it("escapes an XSS payload that carries the former idempotency sentinel", () => {
    // The old idempotency guard keyed off the literal substring
    // `class="shorthand"` in the RAW input, so this payload (scraped/
    // imported data, no upstream sanitization) came back completely
    // unescaped and executed via dangerouslySetInnerHTML. There is no such
    // guard anymore — every raw input is unconditionally escaped first.
    const payload = '<img src=x onerror=alert(1) class="shorthand">';
    const out = decorateShorthand(payload);
    expect(out).not.toContain("<img");
    // "onerror=alert(1)" survives only as inert escaped text content, not as
    // a live attribute of a real element.
    expect(out).toBe(
      "&lt;img src=x onerror=alert(1) class=&quot;shorthand&quot;&gt;",
    );
  });

  it("still decorates normal shorthand text", () => {
    const out = decorateShorthand("Today: COW, then a GT before the HTC.");
    expect(out).toBe(
      'Today: <abbr class="shorthand" title="Cookie of the Week">COW</abbr>, ' +
        'then a <abbr class="shorthand" title="Good Thing">GT</abbr> before the ' +
        '<abbr class="shorthand" title="How To Cook (101)">HTC</abbr>.',
    );
  });

  it("HTML-escapes plain text with no shorthand and no HTML in it", () => {
    expect(decorateShorthand("Snoop & Martha say hi.")).toBe(
      "Snoop &amp; Martha say hi.",
    );
  });

  it("returns empty string for empty/falsy input", () => {
    expect(decorateShorthand("")).toBe("");
  });

  it("escapes a raw class=\"shorthand\" substring AND still decorates other tokens in the same string", () => {
    // Raw input carrying the literal (now-irrelevant) sentinel substring
    // alongside a real shorthand acronym: the attribute-like text must
    // come back inert/escaped, while COW still gets wrapped normally —
    // proving escaping and decoration both apply unconditionally, with no
    // special-cased shortcut for this substring anywhere in the string.
    const out = decorateShorthand('COW class="shorthand"');
    expect(out).toBe(
      '<abbr class="shorthand" title="Cookie of the Week">COW</abbr> class=&quot;shorthand&quot;',
    );
  });
});
