import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"

const ROOT = join(import.meta.dirname, "..")
const PUB = join(ROOT, "public")
const budgets = JSON.parse(readFileSync(join(ROOT, "budgets.json"), "utf8")) as Record<string, number>
const gz = (...files: string[]) => files.reduce((n, f) => n + gzipSync(readFileSync(join(PUB, f)), { level: 9 }).length, 0)

const measured: Record<string, number> = {
  "css.site": gz("styles/tokens.css", "styles/base.css", "styles/typography.css", "styles/components.css", "styles/layout.css"),
  "css.atlas": gz("styles/places-map.css"),
  "css.mobile": gz("m/style.css"),
  "js.episodes-island": gz("episodes-island.js"),
  "js.mobile": gz("m/app.js"),
  "js.atlas": gz("scripts/places-map.js"),
  "vendor.leaflet": gz("vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css"),
  "fonts.all": readdirSync(join(PUB, "fonts")).filter((f) => f.endsWith(".woff2")).reduce((n, f) => n + statSync(join(PUB, "fonts", f)).size, 0),
}

let failed = 0
for (const [name, limit] of Object.entries(budgets)) {
  if (name.startsWith("$")) continue
  const value = measured[name]
  const ok = value !== undefined && value <= limit
  if (!ok) failed++
  console.log(`${ok ? "✓" : "✗"}  ${name.padEnd(20)} ${((value ?? NaN) / 1000).toFixed(1).padStart(7)} kB  of ${(limit / 1000).toFixed(1).padStart(7)} kB`)
}
if (failed) {
  console.error(`\n✗ ${failed} budget${failed === 1 ? "" : "s"} exceeded`)
  process.exit(1)
}
console.log("\n✓ every budget holds")
