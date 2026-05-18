import { marked } from "marked";
import type { PaletteColorInsert } from "../db/schema.js";

type Tokens = ReturnType<typeof marked.lexer>;

export function extractPalettesFromMarkdown(md: string): PaletteColorInsert[] {
  const tokens = marked.lexer(md);
  let currentH2 = "";
  let currentH3 = "";
  const out: PaletteColorInsert[] = [];
  for (const t of tokens) {
    if (t.type === "heading") {
      if (t.depth === 2) {
        currentH2 = t.text;
        currentH3 = "";
      } else if (t.depth === 3) {
        currentH3 = t.text;
      }
    } else if (t.type === "table") {
      const headerJoined = (t.header as any[]).map((h: any) => (typeof h === "string" ? h : h?.text ?? "")).join("|").toLowerCase();
      if (!/color|palette|hex|swatch/.test(headerJoined)) continue;
      const headers = (t.header as any[]).map((h: any) => (typeof h === "string" ? h : h?.text ?? "").trim().toLowerCase());
      const rows = (t.rows as any[][]).map((r) => r.map((c: any) => (typeof c === "string" ? c : c?.text ?? "").trim()));
      const idxName = headers.findIndex((h) => /name|swatch|colou?r/.test(h) && !/hex/.test(h));
      const idxHex = headers.findIndex((h) => /hex/.test(h));
      const idxRole = headers.findIndex((h) => /role|use|where|description|note/.test(h));
      const paletteName = currentH3 || currentH2;
      const paletteGroup = slugify(paletteName);
      let pos = 0;
      for (const row of rows) {
        const name = (idxName >= 0 ? row[idxName] : row[0]) ?? "";
        const hexRaw = (idxHex >= 0 ? row[idxHex] : "") ?? "";
        const role = idxRole >= 0 ? (row[idxRole] ?? "") : "";
        const hex = normalizeHex(hexRaw);
        if (!hex || !name) continue;
        out.push({
          paletteGroup,
          paletteName,
          name: stripEmphasis(name),
          hex,
          role: role || null,
          notes: null,
          sortOrder: pos++,
        });
      }
    }
  }
  // de-dupe by (group,name)
  const dedup = new Map<string, PaletteColorInsert>();
  for (const p of out) dedup.set(`${p.paletteGroup}|${p.name.toLowerCase()}`, p);
  return Array.from(dedup.values());
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripEmphasis(s: string): string {
  return s.replace(/[*_`]/g, "").trim();
}

function normalizeHex(raw: string): string | null {
  const m = raw.match(/#?([0-9a-fA-F]{3,8})/);
  if (!m) return null;
  let h = m[1]!.toLowerCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 && h.length !== 8) return null;
  return `#${h.slice(0, 6)}`;
}
