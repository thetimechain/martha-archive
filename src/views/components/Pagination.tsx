import type { FC } from "hono/jsx";
import type { EpisodeQuery } from "../../lib/query.js";
import { buildHref, calcLastPage } from "../../lib/query.js";

export const Pagination: FC<{ params: EpisodeQuery; total: number; base?: string }> = ({ params, total, base = "/episodes" }) => {
  const last = calcLastPage(total, params.pageSize);
  if (last <= 1) return null;
  const cur = params.page;
  const nums = pageNumbers(cur, last);
  return (
    <nav class="pagination" aria-label="Pagination">
      {cur > 1 ? (
        <a href={buildHref(params, { page: cur - 1 }, base)} rel="prev" aria-label="Previous page">‹</a>
      ) : (
        <span class="disabled" aria-hidden="true">‹</span>
      )}
      {nums.map((n, i) =>
        n === "…" ? (
          <span class="sep">·</span>
        ) : n === cur ? (
          <span class="current" aria-current="page">{n}</span>
        ) : (
          <a href={buildHref(params, { page: n as number }, base)}>{n}</a>
        ),
      )}
      {cur < last ? (
        <a href={buildHref(params, { page: cur + 1 }, base)} rel="next" aria-label="Next page">›</a>
      ) : (
        <span class="disabled" aria-hidden="true">›</span>
      )}
    </nav>
  );
};

function pageNumbers(cur: number, last: number): Array<number | "…"> {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  const out: Array<number | "…"> = [1];
  const start = Math.max(2, cur - 1);
  const end = Math.min(last - 1, cur + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < last - 1) out.push("…");
  out.push(last);
  return out;
}
