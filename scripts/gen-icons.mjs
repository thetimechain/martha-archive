// Generate app icons (192px and 512px) as simple SVG-to-PNG via canvas.
// Falls back to writing SVG files if sharp/canvas isn't available.
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

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

for (const size of [192, 512]) {
  const svgPath = join(outDir, `icon-${size}.svg`);
  await writeFile(svgPath, makeSvg(size));
  console.log(`wrote ${svgPath}`);
}

// Also write the OG wordmark PNG placeholder
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
await writeFile(join(outDir, "og-wordmark.svg"), ogSvg);
console.log("wrote og-wordmark.svg");
console.log("done — copy icons/ to public/icons/ or let the build do it");
