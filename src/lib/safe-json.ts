/**
 * JSON-serialize a value for safe embedding inside a script tag.
 * `JSON.stringify` alone does NOT escape `</script>` or `<!--` sequences,
 * which would let an attacker inject markup if any string field were
 * attacker-controlled. Replacing `<` with `\u003c` is valid JSON and
 * renders identically to JSON parsers, but cannot be interpreted by the
 * HTML parser as a tag boundary.
 */
export function safeJsonForScriptTag(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}
