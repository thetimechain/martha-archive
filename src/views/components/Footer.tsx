import type { FC } from "hono/jsx";
import { copy } from "../../copy.js";

export const Footer: FC<{ meta?: { lastImport?: string; episodeCount?: number } }> = ({ meta }) => (
  <footer class="site-footer page" role="contentinfo">
    <hr class="hairline" />
    <p class="caption">{copy.tagline} An archive of Martha Stewart programming, 1986 to present.</p>
    {meta && (meta.lastImport || meta.episodeCount !== undefined) && (
      <p class="caption">
        {meta.lastImport && <>{copy.imported}: {new Date(meta.lastImport).toLocaleDateString("en-US")} · </>}
        {meta.episodeCount !== undefined && (
          <>
            {meta.episodeCount.toLocaleString()} episodes {copy.documented} · <a href="/gaps">{copy.gaps}</a>
          </>
        )}
      </p>
    )}
  </footer>
);
