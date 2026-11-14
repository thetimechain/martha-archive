import { readFileSync, readdirSync } from "node:fs"
import { basename, join } from "node:path"
import { BASE, open, run } from "./driver.ts"

const DIR = join(import.meta.dirname, "..", "tests/ops")
const only = process.argv.slice(2)
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".ops") && (!only.length || only.some((o) => f.includes(o))))
  .sort()

type Result = { file: string; ok: boolean; ms: number; error?: string; line?: number; text?: string }

async function runFile(file: string): Promise<Result> {
  const lines = readFileSync(join(DIR, file), "utf8").split("\n")
  const directives = lines.filter((l) => l.startsWith("# @")).map((l) => l.slice(3).trim())
  const started = Date.now()
  const mobile = directives.includes("mobile")
  const s = await open(BASE, { javaScript: !directives.includes("nojs"), width: mobile ? 390 : 1280, height: mobile ? 844 : 900 })
  try {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line || line.startsWith("#")) continue
      try {
        await run(s, line, () => {})
      } catch (error) {
        return { file, ok: false, ms: Date.now() - started, error: (error as Error).message.split("\n")[0], line: i + 1, text: line }
      }
    }
    return { file, ok: true, ms: Date.now() - started }
  } finally {
    await s.browser.close()
  }
}

const results: Result[] = []
const queue = [...files]
await Promise.all(
  Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const r = await runFile(queue.shift()!)
      results.push(r)
      console.log(r.ok ? `✓ ${basename(r.file, ".ops").padEnd(18)} ${r.ms} ms` : `✗ ${basename(r.file, ".ops").padEnd(18)} line ${r.line}: ${r.text}\n    ${r.error}`)
    }
  }),
)
const failed = results.filter((r) => !r.ok).length
console.log(failed ? `\n✗ ${failed} of ${results.length} op scripts failed against ${BASE}` : `\n✓ ${results.length} op scripts passed against ${BASE}`)
process.exit(failed ? 1 : 0)
