import type { FC } from "hono/jsx";
import type { EpisodeQuery } from "../../lib/query.js";
import type { Facets } from "../../db/queries.js";
import { buildHref } from "../../lib/query.js";
import { copy } from "../../copy.js";

function toggle(arr: string[], v: string): string[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export const FilterSidebar: FC<{ params: EpisodeQuery; facets: Facets }> = ({ params, facets }) => {
  return (
    <aside class="filter-sidebar" aria-label="Filters">
      {(params.show.length || params.season !== undefined || params.year !== undefined || params.topic.length || params.theme.length || params.tag.length || params.guest || params.confidence) && (
        <div class="filter-section">
          <a href="/episodes" class="smallcap-eyebrow" style="text-decoration:none;color:var(--terracotta);">{copy.clearFilters}</a>
        </div>
      )}
      <div class="filter-section">
        <h2>{copy.showLabel}</h2>
        <ul class="filter-list">
          {facets.shows.slice(0, 12).map((f) => (
            <li>
              <a
                href={buildHref(params, { show: toggle(params.show, f.value), page: 1 })}
                data-active={params.show.includes(f.value) ? "true" : "false"}
              >
                {f.label} <span class="count">{f.count}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
      {params.show.length === 1 && facets.seasons.length > 0 && (
        <div class="filter-section">
          <h2>{copy.seasonLabel}</h2>
          <ul class="filter-list">
            {facets.seasons.map((f) => (
              <li>
                <a
                  href={buildHref(params, { season: params.season === Number(f.value) ? undefined : Number(f.value), page: 1 })}
                  data-active={params.season === Number(f.value) ? "true" : "false"}
                >
                  {f.label} <span class="count">{f.count}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {facets.years.length > 0 && (
        <div class="filter-section">
          <h2>{copy.yearLabel}</h2>
          <ul class="filter-list">
            {facets.years.slice(0, 30).map((f) => (
              <li>
                <a
                  href={buildHref(params, { year: params.year === Number(f.value) ? undefined : Number(f.value), page: 1 })}
                  data-active={params.year === Number(f.value) ? "true" : "false"}
                >
                  {f.label} <span class="count">{f.count}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {facets.topics.length > 0 && (
        <div class="filter-section">
          <h2>{copy.topicLabel}</h2>
          <ul class="filter-list">
            {facets.topics.slice(0, 20).map((f) => (
              <li>
                <a
                  href={buildHref(params, { topic: toggle(params.topic, f.value), page: 1 })}
                  data-active={params.topic.includes(f.value) ? "true" : "false"}
                >
                  {f.label} <span class="count">{f.count}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {facets.themes.length > 0 && (
        <div class="filter-section">
          <h2>{copy.themeLabel}</h2>
          <ul class="filter-list">
            {facets.themes.slice(0, 20).map((f) => (
              <li>
                <a
                  href={buildHref(params, { theme: toggle(params.theme, f.value), page: 1 })}
                  data-active={params.theme.includes(f.value) ? "true" : "false"}
                >
                  {f.label} <span class="count">{f.count}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {facets.confidences.length > 0 && (
        <div class="filter-section">
          <h2>{copy.confidenceLabel}</h2>
          <ul class="filter-list">
            {facets.confidences.map((f) => (
              <li>
                <a
                  href={buildHref(params, { confidence: params.confidence === (f.value as any) ? undefined : (f.value as any), page: 1 })}
                  data-active={params.confidence === f.value ? "true" : "false"}
                >
                  {f.label} <span class="count">{f.count}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
};
