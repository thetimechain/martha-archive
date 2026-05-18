import { Hono } from "hono";
import { Layout } from "../views/components/Layout.js";
import { fetchCalendarYear, fetchCalendarYearsAvailable, fetchLastImport, fetchRowCounts } from "../db/queries.js";
import { monthCells, MONTH_NAMES } from "../lib/calendar.js";

export const calendarRoute = new Hono();

calendarRoute.get("/calendar", async (c) => {
  const years = await fetchCalendarYearsAvailable();
  if (!years.length) return c.redirect("/", 302);
  const latest = years[years.length - 1]!;
  return c.redirect(`/calendar/${latest}`, 302);
});

calendarRoute.get("/calendar/:year", async (c) => {
  const yearStr = c.req.param("year");
  const year = Number.parseInt(yearStr, 10);
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return c.notFound();

  const [entriesRaw, years, lastImport, counts] = await Promise.all([
    fetchCalendarYear(year),
    fetchCalendarYearsAvailable(),
    fetchLastImport(),
    fetchRowCounts(),
  ]);
  if (!years.includes(year)) return c.notFound();

  const byIso = new Map<string, { id: string; title: string }>();
  for (const r of entriesRaw as any[]) {
    if (r.episode_id) byIso.set(r.air_date, { id: r.episode_id, title: r.ep_title ?? r.title ?? "" });
  }

  return c.html(
    <Layout
      title={`Calendar ${year} — The Martha Stewart Show`}
      description={`Episode calendar for The Martha Stewart Show, ${year}.`}
      footerMeta={{ lastImport: lastImport?.finishedAt?.toISOString(), episodeCount: counts.episodes ?? 0 }}
    >
      <div class="page page--wide" style="padding-top:var(--space-4);">
        <header class="results-header">
          <p class="section-eyebrow">The Martha Stewart Show</p>
          <h1 class="display">Broadcast calendar, {year}</h1>
        </header>
        <nav class="calendar-years" aria-label="Year">
          {years.map((y) => (
            <a href={`/calendar/${y}`} data-active={y === year ? "true" : "false"}>{y}</a>
          ))}
        </nav>
        {byIso.size === 0 ? (
          <p class="caption">No documented episodes in {year}.</p>
        ) : (
          <div class="calendar-months">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
              const cells = monthCells(year, m);
              return (
                <section class="calendar-month">
                  <h3>{MONTH_NAMES[m - 1]}</h3>
                  <div class="calendar-grid" role="grid" aria-label={`${MONTH_NAMES[m - 1]} ${year}`}>
                    {["S", "M", "T", "W", "T", "F", "S"].map((d) => (
                      <span class="dow">{d}</span>
                    ))}
                    {cells.map((cell) => {
                      if (cell.kind === "pad") return <span class="calendar-cell pad">·</span>;
                      const ep = byIso.get(cell.iso);
                      if (ep) {
                        return (
                          <span class="calendar-cell has-episode" title={ep.title}>
                            <a href={`/episodes/${ep.id}`} aria-label={`${cell.iso}: ${ep.title}`}>
                              {cell.day}
                            </a>
                          </span>
                        );
                      }
                      return <span class="calendar-cell">{cell.day}</span>;
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </Layout>,
  );
});
