import type { FC } from "hono/jsx";
import type { EpisodeQuery } from "../../lib/query.js";
import { buildHref } from "../../lib/query.js";

function weight(c: number, max: number): 1 | 2 | 3 | 4 {
  const r = c / Math.max(1, max);
  if (r > 0.66) return 4;
  if (r > 0.4) return 3;
  if (r > 0.2) return 2;
  return 1;
}

export const TagCloud: FC<{ tags: Array<{ tag: string; count: number }>; params: EpisodeQuery }> = ({ tags, params }) => {
  if (!tags.length) return null;
  const max = Math.max(...tags.map((t) => t.count));
  return (
    <nav class="tag-cloud" aria-label="Tag cloud">
      {tags.map((t) => {
        const active = params.tag.includes(t.tag);
        const w = weight(t.count, max);
        return (
          <a
            href={buildHref(params, { tag: active ? params.tag.filter((x) => x !== t.tag) : [...params.tag, t.tag], page: 1 })}
            class={`tag-w-${w}`}
            data-active={active ? "true" : "false"}
            title={`${t.count} episodes`}
          >
            {t.tag}
          </a>
        );
      })}
    </nav>
  );
};
