// Copies public/ → dist/public/ so the build artifact is self-contained.
import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const src = new URL("../public/", import.meta.url);
const dst = new URL("../dist/public/", import.meta.url);

if (!existsSync(src)) {
  console.log("no public/ — skipping asset copy");
  process.exit(0);
}

await mkdir(dst, { recursive: true });
await cp(src, dst, { recursive: true });
console.log("copied public/ → dist/public/");
