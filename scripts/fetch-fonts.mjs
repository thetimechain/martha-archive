// Fetch self-hosted woff2 fonts. Resolves Google Fonts CSS API to get current URLs.
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "public", "fonts");
await mkdir(out, { recursive: true });

// User-agent triggers woff2 (latin only) — must look like a modern Chrome.
const ua =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const families = [
  { family: "Cormorant Garamond", weights: ["400", "400i", "600", "700"], filePrefix: "CormorantGaramond" },
  { family: "Libre Caslon Text", weights: ["400", "400i", "700"], filePrefix: "LibreCaslonText" },
  { family: "EB Garamond", weights: ["400", "500"], filePrefix: "EBGaramond" },
  { family: "Cormorant SC", weights: ["500", "600"], filePrefix: "CormorantSC" },
];

function suffixFor(w) {
  if (w === "400") return "Regular";
  if (w === "400i") return "Italic";
  if (w === "500") return "Medium";
  if (w === "600") return "SemiBold";
  if (w === "700") return "Bold";
  return w;
}

async function fetchCssAndExtract(family, weights) {
  // build a Google Fonts css2 URL for this family + weights, latin subset
  const ital = weights.some((w) => w.endsWith("i"));
  const nums = weights.map((w) => Number(w.replace("i", "")));
  let url;
  if (ital) {
    const pairs = weights.map((w) => [w.endsWith("i") ? 1 : 0, Number(w.replace("i", ""))]);
    pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:ital,wght@${pairs
      .map((p) => `${p[0]},${p[1]}`)
      .join(";")}&display=swap`;
  } else {
    url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@${nums.join(";")}&display=swap`;
  }
  const css = await (await fetch(url, { headers: { "User-Agent": ua } })).text();
  // The CSS has multiple @font-face blocks per script (latin, latin-ext, etc).
  // We want the *last* one (typically the most-supported latin subset). Parse all:
  const blocks = css.split("@font-face").slice(1);
  const out = [];
  for (const b of blocks) {
    const styleMatch = b.match(/font-style:\s*(\w+)/);
    const weightMatch = b.match(/font-weight:\s*(\d+)/);
    const srcMatch = b.match(/src:\s*url\((https:\/\/[^\)]+\.woff2)\)/);
    const unicodeMatch = b.match(/unicode-range:\s*([^;]+)/);
    if (!srcMatch || !weightMatch) continue;
    const style = styleMatch?.[1] ?? "normal";
    const weight = weightMatch[1];
    const unicode = unicodeMatch?.[1] ?? "";
    out.push({ style, weight, url: srcMatch[1], unicode });
  }
  return out;
}

function pickLatin(blocks) {
  // prefer the unicode-range that includes U+0041 (latin) — the broadest latin subset.
  return blocks.find((b) => /U\+00\?\?-/.test(b.unicode) || /U\+0000/.test(b.unicode) || /U\+0041/.test(b.unicode))
    ?? blocks[blocks.length - 1];
}

let ok = 0;
let skipped = 0;
let failed = 0;
for (const fam of families) {
  let blocks;
  try {
    blocks = await fetchCssAndExtract(fam.family, fam.weights);
  } catch (e) {
    console.warn(`! css fetch failed for ${fam.family}: ${e.message}`);
    failed += fam.weights.length;
    continue;
  }
  for (const w of fam.weights) {
    const italic = w.endsWith("i");
    const weightNum = w.replace("i", "");
    const candidates = blocks.filter((b) => b.weight === weightNum && (italic ? b.style === "italic" : b.style === "normal"));
    if (!candidates.length) {
      console.warn(`! no woff2 found for ${fam.family} ${w}`);
      failed++;
      continue;
    }
    const block = pickLatin(candidates);
    const filename = `${fam.filePrefix}-${suffixFor(w)}.woff2`;
    const dest = path.join(out, filename);
    try {
      await access(dest);
      skipped++;
      continue;
    } catch {}
    try {
      const r = await fetch(block.url, { headers: { "User-Agent": ua } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 1000) throw new Error("suspiciously small");
      await writeFile(dest, buf);
      ok++;
    } catch (e) {
      console.warn(`! ${filename}: ${e.message}`);
      failed++;
    }
  }
}
console.log(`fonts: ${ok} downloaded, ${skipped} cached, ${failed} failed`);
