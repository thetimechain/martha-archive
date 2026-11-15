import { mkdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright"

type Session = {
  browser: Browser
  context: BrowserContext
  page: Page
  base: string
  logs: string[]
  status: number
}

const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "")

const HELP = `Operations (one per argument, or one per line in an .ops file):
  goto <path>                 load a page and record its HTTP status
  tap <target>                click a target
  type <target> <text>        fill a field (replaces its value)
  select <target> <value>     choose an option of a native select by value or label
  press <key>                 press a key, e.g. Enter, Escape, Control+k, /
  clock <iso date>            fix the page's clock (call before goto), e.g. clock 2026-11-13T12:00
  delay <glob> <ms>           hold matching requests, e.g. delay **/data/search-*.json 3000
  block <glob>                fail matching requests
  tree [target]               print the accessibility tree
  state                       print url, title, h1, focus, result count, status
  layout                      print viewport, document width, horizontal overflow
  logs                        print console errors and page errors
  screenshot <file>           save a screenshot (full page)
  viewport <w>x<h>            resize the viewport
  back                        go back in history
  reload                      reload the page
  expect url <substring>
  expect title <substring>
  expect text <substring>     rendered text, ignoring case (CSS capitals)
  expect no-text <substring>
  expect status <code>
  expect focus <target>
  expect visible <target>
  expect hidden <target>
  expect count <css> <n>      exact count; use >=n for a minimum
  expect value <target> <text>
  expect unique-ids           no two elements share an id
  expect scrolled <px>        the page is scrolled at least this far
  expect no-errors
  expect no-overflow
Targets: role:name (link:Shows, button:Search, textbox:Search, heading:The Shows),
         css:<selector>, text:<text>, or a bare accessible name of a link or button.`

function words(line: string) {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3])
  return out
}

function locate(page: Page, target: string): Locator {
  const colon = target.indexOf(":")
  if (colon > 0) {
    const kind = target.slice(0, colon)
    const value = target.slice(colon + 1)
    if (kind === "css") return page.locator(value).first()
    if (kind === "text") return page.getByText(value, { exact: false }).first()
    return page.getByRole(kind as Parameters<Page["getByRole"]>[0], { name: value, exact: false }).first()
  }
  return page.getByRole("link", { name: target }).or(page.getByRole("button", { name: target })).first()
}

async function state(s: Session) {
  return s.page.evaluate((status) => {
    const active = document.activeElement as HTMLElement | null
    const describe = (el: HTMLElement | null) =>
      !el || el === document.body ? "body" : `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.getAttribute("aria-label") ? ` "${el.getAttribute("aria-label")}"` : el.textContent?.trim() ? ` "${el.textContent.trim().slice(0, 60)}"` : ""}`
    return {
      url: location.pathname + location.search + location.hash,
      status,
      title: document.title,
      h1: document.querySelector("h1")?.textContent?.trim() ?? null,
      focus: describe(active),
      results: document.querySelector("[data-results-title]")?.textContent?.trim() ?? null,
      rows: document.querySelectorAll(".ledger > li").length,
      dialog: document.querySelector("ui-dialog-content:not([hidden])") ? "open" : "closed",
    }
  }, s.status)
}

async function poll(check: () => Promise<boolean>, message: () => Promise<string>, timeout = 5000) {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    if (await check().catch(() => false)) return
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(await message())
}

async function run(s: Session, line: string, out: (text: string) => void, outDir = ".") {
  const [op, ...args] = words(line)
  const { page } = s
  switch (op) {
    case "goto": {
      const res = await page.goto(s.base + args[0], { waitUntil: "load" })
      s.status = res?.status() ?? 0
      return
    }
    case "tap":
      await locate(page, args.join(" ")).click()
      return
    case "type":
      await locate(page, args[0]).fill(args.slice(1).join(" "))
      return
    case "select": {
      const field = locate(page, args[0])
      const value = args.slice(1).join(" ")
      await field.selectOption(value).catch(() => field.selectOption({ label: value }))
      return
    }
    case "delay": {
      const ms = Number(args[1])
      await page.route(args[0], async (route) => {
        await new Promise((r) => setTimeout(r, ms))
        await route.continue()
      })
      return
    }
    case "block":
      await page.route(args[0], (route) => route.abort())
      return
    case "clock":
      await page.clock.setFixedTime(new Date(args.join(" ")))
      return
    case "press":
      await page.keyboard.press(args[0])
      return
    case "back":
      await page.goBack()
      return
    case "reload": {
      const res = await page.reload()
      s.status = res?.status() ?? s.status
      return
    }
    case "viewport": {
      const [w, h] = args[0].split("x").map(Number)
      await page.setViewportSize({ width: w, height: h })
      return
    }
    case "tree":
      out(await (args.length ? locate(page, args.join(" ")) : page.locator("body")).ariaSnapshot())
      return
    case "state":
      out(JSON.stringify(await state(s), null, 2))
      return
    case "layout":
      out(JSON.stringify(await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, overflow: document.documentElement.scrollWidth > innerWidth })), null, 2))
      return
    case "logs":
      out(s.logs.length ? s.logs.join("\n") : "no errors")
      return
    case "screenshot": {
      const file = resolve(outDir, args[0])
      mkdirSync(dirname(file), { recursive: true })
      await page.screenshot({ path: file, fullPage: args[1] !== "viewport" })
      out(`saved ${file}`)
      return
    }
    case "expect":
      return expect(s, args)
    default:
      throw new Error(`unknown operation "${op}"\n\n${HELP}`)
  }
}

async function expect(s: Session, [kind, ...rest]: string[]) {
  const { page } = s
  const value = rest.join(" ")
  const st = () => state(s).then((x) => JSON.stringify(x))
  switch (kind) {
    case "url":
      return poll(async () => (await state(s)).url.includes(value), async () => `expected url to contain ${value}; state ${await st()}`)
    case "title":
      return poll(async () => (await page.title()).includes(value), async () => `expected title to contain ${value}; got ${await page.title()}`)
    case "text":
      return poll(async () => (await page.locator("body").innerText()).toLowerCase().includes(value.toLowerCase()), async () => `expected page text to contain "${value}"; state ${await st()}`)
    case "no-text":
      return poll(async () => !(await page.locator("body").innerText()).toLowerCase().includes(value.toLowerCase()), async () => `expected page text not to contain "${value}"`)
    case "status":
      if (s.status !== Number(value)) throw new Error(`expected status ${value}; got ${s.status}`)
      return
    case "focus":
      return poll(
        () => locate(page, value).evaluate((el) => el === document.activeElement || el.contains(document.activeElement)).catch(() => false),
        async () => `expected focus on ${value}; focus is ${(await state(s)).focus}`,
      )
    case "visible":
      return poll(() => locate(page, value).isVisible(), async () => `expected ${value} to be visible`)
    case "hidden":
      return poll(async () => !(await locate(page, value).isVisible()), async () => `expected ${value} to be hidden`)
    case "count": {
      const [css, n] = [rest.slice(0, -1).join(" "), rest[rest.length - 1]]
      const min = n.startsWith(">=")
      const want = Number(min ? n.slice(2) : n)
      return poll(
        async () => {
          const c = await page.locator(css).count()
          return min ? c >= want : c === want
        },
        async () => `expected ${n} of ${css}; found ${await page.locator(css).count()}`,
      )
    }
    case "value": {
      const [target, ...text] = rest
      const want = text.join(" ")
      return poll(async () => (await locate(page, target).inputValue()) === want, async () => `expected ${target} value "${want}"; got "${await locate(page, target).inputValue()}"`)
    }
    case "scrolled":
      return poll(async () => (await page.evaluate(() => scrollY)) >= Number(value), async () => `expected scrollY ≥ ${value}; got ${await page.evaluate(() => scrollY)}`)
    case "unique-ids": {
      const dupes = await page.evaluate(() => {
        const seen = new Map<string, number>()
        for (const el of document.querySelectorAll("[id]")) seen.set(el.id, (seen.get(el.id) ?? 0) + 1)
        return [...seen].filter(([, n]) => n > 1).map(([id]) => id)
      })
      if (dupes.length) throw new Error(`duplicate ids: ${dupes.slice(0, 5).join(", ")}`)
      return
    }
    case "no-errors":
      if (s.logs.length) throw new Error(`console errors:\n${s.logs.join("\n")}`)
      return
    case "no-overflow": {
      const l = await page.evaluate(() => ({ w: innerWidth, d: document.documentElement.scrollWidth }))
      if (l.d > l.w) throw new Error(`horizontal overflow: document ${l.d}px wider than viewport ${l.w}px`)
      return
    }
    default:
      throw new Error(`unknown expectation "${kind}"`)
  }
}

async function open(base: string, options: { javaScript?: boolean; width?: number; height?: number } = {}): Promise<Session> {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    javaScriptEnabled: options.javaScript ?? true,
    viewport: { width: options.width ?? 1280, height: options.height ?? 900 },
    reducedMotion: "reduce",
  })
  await context.addInitScript("globalThis.__name = (f) => f")
  const page = await context.newPage()
  page.setDefaultTimeout(5000)
  const s: Session = { browser, context, page, base, logs: [], status: 0 }
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) s.logs.push(`console: ${m.text()}`)
  })
  page.on("pageerror", (e) => s.logs.push(`pageerror: ${e.message}`))
  page.on("response", (r) => {
    if (r.status() >= 400 && r.request().resourceType() !== "document") s.logs.push(`http ${r.status()}: ${r.url()}`)
  })
  return s
}

async function main() {
  const args = process.argv.slice(2)
  if (!args.length || args[0] === "help") {
    console.log(`usage: pnpm driver [--nojs] [--mobile] <op> <op> …  (against BASE_URL, default ${BASE}; start the server first)\n\n${HELP}`)
    return
  }
  const nojs = args.includes("--nojs")
  const mobile = args.includes("--mobile")
  const ops = args.filter((a) => !a.startsWith("--"))
  const s = await open(BASE, { javaScript: !nojs, width: mobile ? 390 : 1280, height: mobile ? 844 : 900 })
  try {
    for (const op of ops) {
      console.log(`› ${op}`)
      await run(s, op, (t) => console.log(t))
    }
  } catch (error) {
    console.error(`✗ ${(error as Error).message}`)
    process.exitCode = 1
  } finally {
    await s.browser.close()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main()

export type { Session }
export { BASE, HELP, open, run, words }
