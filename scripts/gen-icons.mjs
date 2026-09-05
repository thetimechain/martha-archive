// Generates app icons (192px, 512px), an apple-touch-icon (180px), and the
// og:image wordmark (1200x630) as both SVG (source of truth / vector use)
// and real PNG rasters (social platforms and iOS "Add to Home Screen" do
// not render SVG for og:image / apple-touch-icon / manifest icons, so a
// PNG is required, not optional).
//
// Rasterization uses playwright-core driving the Chromium binary already
// present on this machine at /opt/pw-browsers/chromium (no network browser
// download — PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 is respected). If Chromium
// or playwright-core is unavailable, this script logs a clear warning and
// leaves only the SVGs in place rather than failing silently.
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

const outDir = "public/icons";
await mkdir(outDir, { recursive: true });

// SVG icon: cream background, "M" wordmark in Bodoni-style display serif
const makeSvg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#F5F0E4"/>
  <text x="${size/2}" y="${size*0.68}" text-anchor="middle"
    font-family="Georgia, 'Times New Roman', serif"
    font-size="${size*0.55}" font-weight="400"
    fill="#2E2A24" letter-spacing="-0.02em">M</text>
  <text x="${size/2}" y="${size*0.88}" text-anchor="middle"
    font-family="'Helvetica Neue', Arial, sans-serif"
    font-size="${size*0.085}" font-weight="300" fill="#7C8B6F"
    letter-spacing="0.15em">MARTHA</text>
</svg>`;

const svgFiles = [];

for (const size of [192, 512]) {
  const svgPath = join(outDir, `icon-${size}.svg`);
  await writeFile(svgPath, makeSvg(size));
  console.log(`wrote ${svgPath}`);
  svgFiles.push({ svgPath, pngPath: join(outDir, `icon-${size}.png`), width: size, height: size });
}

// Apple touch icon: iOS wants a dedicated 180x180 PNG (no alpha ambiguity,
// no SVG support) — reuse the same mark at the 180px size.
{
  const svgPath = join(outDir, "icon-180.svg");
  await writeFile(svgPath, makeSvg(180));
  console.log(`wrote ${svgPath}`);
  svgFiles.push({ svgPath, pngPath: join(outDir, "icon-180.png"), width: 180, height: 180 });
}

// OG wordmark — used as the default og:image / twitter:image (1200x630 is
// the standard social preview aspect ratio).
const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#F5F0E4"/>
  <text x="600" y="280" text-anchor="middle"
    font-family="Georgia, serif" font-size="180" font-weight="400"
    fill="#2E2A24" letter-spacing="0.1em">MARTHA</text>
  <text x="600" y="370" text-anchor="middle"
    font-family="Georgia, serif" font-size="60" font-weight="400"
    fill="#9CA39C" letter-spacing="0.25em">STEWART LIVING</text>
  <text x="600" y="460" text-anchor="middle"
    font-family="Georgia, serif" font-size="36" font-weight="400"
    font-style="italic" fill="#7C8B6F">An Archive</text>
</svg>`;
const ogSvgPath = join(outDir, "og-wordmark.svg");
await writeFile(ogSvgPath, ogSvg);
console.log(`wrote ${ogSvgPath}`);
svgFiles.push({ svgPath: ogSvgPath, pngPath: join(outDir, "og-wordmark.png"), width: 1200, height: 630 });

// --- Rasterize each SVG to a real PNG via headless Chromium ---
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";

async function rasterize(files) {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    console.warn(
      "[gen-icons] playwright-core is not installed — skipping PNG rasterization. " +
        "Only .svg icon files were written. Run `pnpm add -D playwright-core` " +
        "(browser download can stay skipped via PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 " +
        "since Chromium is expected to already be present) and re-run this script " +
        "to produce real PNGs.",
    );
    return false;
  }
  if (!existsSync(CHROMIUM_PATH)) {
    console.warn(
      `[gen-icons] No Chromium executable found at ${CHROMIUM_PATH} — skipping PNG ` +
        "rasterization. Only .svg icon files were written. Set CHROMIUM_PATH to a " +
        "usable Chromium binary and re-run this script to produce real PNGs.",
    );
    return false;
  }

  const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
  try {
    for (const { svgPath, pngPath, width, height } of files) {
      const page = await browser.newPage({
        viewport: { width, height },
        deviceScaleFactor: 1,
      });
      const svgMarkup = await (await import("node:fs/promises")).readFile(svgPath, "utf8");
      await page.setContent(
        `<!doctype html><html><head><style>*{margin:0;padding:0}html,body{width:${width}px;height:${height}px}</style></head><body>${svgMarkup}</body></html>`,
      );
      const buf = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width, height } });
      await writeFile(pngPath, buf);
      console.log(`wrote ${pngPath} (${buf.length} bytes)`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return true;
}

const rasterized = await rasterize(svgFiles);
console.log(
  rasterized
    ? "done — PNG + SVG icons written to public/icons/ (served at /static/icons/*)"
    : "done — SVG icons written to public/icons/; PNGs were NOT generated (see warning above)",
);
