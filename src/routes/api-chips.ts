// GET /api/chips — returns Popular topic chips ranked by:
//   1. Seasonal proximity (how close is today to this chip's holiday?)
//   2. Persistent click count (stored in DB — lightweight, incremented server-side)
//   3. Episode count in MSL (coverage signal = SEO relevance)
// Client sends ?clicked=<chip_q> to increment a counter.

import { Hono } from "hono";
import { sql } from "../db/client.js";

export const chipsRoute = new Hono();

// Full chip catalog — 24 topics, all verified in MSL (≥25 episodes each)
// q = search term, label = display text, month = peak month (1-12) or null
const CATALOG = [
  // Seasonal — peak month drives ranking in the weeks before
  { q: "gardening",    label: "Gardening",    month: 4,  base: 270 },
  { q: "halloween",    label: "Halloween",    month: 10, base: 33  },
  { q: "thanksgiving", label: "Thanksgiving", month: 11, base: 30  },
  { q: "christmas",    label: "Christmas",    month: 12, base: 53  },
  { q: "easter",       label: "Easter",       month: 4,  base: 20  },
  { q: "flowers",      label: "Flowers",      month: 5,  base: 80  },
  { q: "harvest",      label: "Harvest",      month: 9,  base: 31  },
  { q: "brunch",       label: "Brunch",       month: 5,  base: 16  },
  // Evergreen high-volume
  { q: "crafts",       label: "Crafts",       month: null, base: 555 },
  { q: "baking",       label: "Baking",       month: null, base: 220 },
  { q: "cookies",      label: "Cookies",      month: null, base: 104 },
  { q: "field trip",   label: "Field Trip",   month: null, base: 144 },
  { q: "entertaining", label: "Entertaining", month: null, base: 110 },
  { q: "decorating",   label: "Decorating",   month: null, base: 52  },
  { q: "organizing",   label: "Organizing",   month: null, base: 27  },
  { q: "preserving",   label: "Preserving",   month: 8,  base: 20  },
  // The table
  { q: "french",       label: "French",       month: null, base: 45  },
  { q: "italian",      label: "Italian",      month: null, base: 44  },
  { q: "pasta",        label: "Pasta",        month: null, base: 30  },
  { q: "chocolate",    label: "Chocolate",    month: 2,  base: 45  },
  { q: "pie",          label: "Pies",         month: null, base: 46  },
  { q: "cake",         label: "Cakes",        month: null, base: 78  },
  { q: "herbs",        label: "Herbs",        month: 6,  base: 41  },
  { q: "chicken",      label: "Chicken",      month: null, base: 46  },
] as const;

type Chip = { q: string; label: string; score: number };

function seasonalBoost(month: number | null): number {
  if (!month) return 0;
  const now = new Date();
  const curMonth = now.getMonth() + 1; // 1-12
  const curDay   = now.getDate();
  // Days until the peak month (approximate: peak = 15th of target month)
  const daysUntil = (() => {
    let m = month, y = now.getFullYear();
    if (m < curMonth || (m === curMonth && curDay > 20)) y += 1;
    const target = new Date(y, m - 1, 1);
    return Math.round((target.getTime() - now.getTime()) / 86400000);
  })();
  // Full boost when ≤35 days out; taper off before 70 days; zero past 90
  if (daysUntil <= 0  && daysUntil > -14) return 300;  // in the month
  if (daysUntil <= 14) return 280;
  if (daysUntil <= 35) return 200;
  if (daysUntil <= 56) return 100;
  if (daysUntil <= 70) return  40;
  return 0;
}

chipsRoute.get("/api/chips", async (c) => {
  // Fetch click counts from DB (simple key-value in static_content table)
  let clickMap: Record<string, number> = {};
  try {
    const rows = await sql<{ slug: string; body_md: string }[]>`
      SELECT slug, body_md FROM static_content WHERE slug LIKE 'chip-click-%'
    `;
    for (const r of rows) {
      const key = r.slug.replace("chip-click-", "");
      clickMap[key] = parseInt(r.body_md, 10) || 0;
    }
  } catch { /* ignore — clicks are non-critical */ }

  const chips: Chip[] = CATALOG.map(c => {
    const seasonal = seasonalBoost(c.month ?? null);
    const clicks   = (clickMap[c.q] ?? 0) * 8;  // click weight
    const coverage = Math.min(c.base / 5, 80);   // coverage weight (capped)
    return { q: c.q, label: c.label, score: seasonal + clicks + coverage };
  });

  chips.sort((a, b) => b.score - a.score);
  c.header("Cache-Control", "public, max-age=3600");
  return c.json(chips);
});

// POST /api/chips/click?q=<chip_q> — increment tap counter
chipsRoute.post("/api/chips/click", async (c) => {
  const q = c.req.query("q");
  if (!q || !CATALOG.find(ch => ch.q === q)) return c.json({ ok: false }, 400);
  const key = `chip-click-${q}`;
  try {
    await sql`
      INSERT INTO static_content (slug, body_md, title)
      VALUES (${key}, '1', ${key})
      ON CONFLICT (slug) DO UPDATE
        SET body_md = (COALESCE(static_content.body_md::int, 0) + 1)::text,
            updated_at = now()
    `;
  } catch { /* non-critical */ }
  return c.json({ ok: true });
});
