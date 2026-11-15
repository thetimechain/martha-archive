import { AxeBuilder } from "@axe-core/playwright"
import { BASE, open, run } from "./driver.ts"

const VIEWS: [string, string[]][] = [
  ["home", ["goto /"]],
  ["archive", ["goto /episodes"]],
  ["archive, filtered", ["goto /episodes?show=martha-bakes&q=cake"]],
  ["episode", ["goto /episodes/msl-s06e060"]],
  ["episode, placeholder", ["goto /episodes/mss-s01e003"]],
  ["show", ["goto /shows/martha-stewart-show"]],
  ["people", ["goto /people"]],
  ["places", ["goto /places"]],
  ["atlas", ["goto /places/map"]],
  ["guests", ["goto /guests"]],
  ["collections", ["goto /collections"]],
  ["facts", ["goto /facts"]],
  ["today", ["goto /today"]],
  ["gaps", ["goto /gaps"]],
  ["404", ["goto /no-such-page"]],
  ["mobile", ["goto /m/", "expect count .more-btn 1"]],
]

const s = await open(BASE)
let failures = 0
for (const [name, ops] of VIEWS) {
  for (const op of ops) await run(s, op, () => {})
  const result = await new AxeBuilder({ page: s.page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()
  const nodes = result.violations.reduce((n, v) => n + v.nodes.length, 0)
  failures += nodes
  if (nodes) {
    console.log(`✗ ${name}`)
    for (const v of result.violations) console.log(`    ${v.id} (${v.nodes.length}): ${v.help}, e.g. ${v.nodes[0]?.target.join(" ")}`)
  } else console.log(`✓ ${name}`)
}
await s.browser.close()
if (failures) {
  console.error(`\n✗ ${failures} accessibility violations`)
  process.exit(1)
}
console.log(`\n✓ no axe violations on ${VIEWS.length} views against ${BASE}`)
