import type { FC, PropsWithChildren } from "hono/jsx";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { Header } from "./Header.js";
import { Footer } from "./Footer.js";
import { safeJsonForScriptTag } from "../../lib/safe-json.js";
import { canonical as absoluteUrl } from "../../lib/seo.js";

// Cache-buster derived from the contents of every CSS file in public/styles/.
// Because the hash depends only on file contents — not machine boot time —
// both fly.io machines produce the same BUILD_ID for the same deploy.
// Falls back to Date.now() if the files can't be read (e.g. in unit tests).
function computeBuildId(): string {
  if (process.env.BUILD_ID) return process.env.BUILD_ID;
  try {
    const stylesDir = join(dirname(fileURLToPath(import.meta.url)), "../../../public/styles");
    const cssFiles = readdirSync(stylesDir).filter((f) => f.endsWith(".css")).sort();
    const hash = createHash("sha256");
    for (const file of cssFiles) {
      hash.update(readFileSync(join(stylesDir, file)));
    }
    return hash.digest("hex").slice(0, 8);
  } catch (err) {
    // Log so this never silently regresses to the broken behavior.
    console.warn("[Layout] computeBuildId fell back to Date.now() — cross-machine cache-busting disabled. Reason:", (err as Error).message);
    return String(Date.now());
  }
}

const BUILD_ID = computeBuildId();

export type OG = {
  title: string;
  description?: string;
  url?: string;
  image?: string;
  type?: "website" | "article" | "video.tv_show" | "video.episode";
};

export const Layout: FC<
  PropsWithChildren<{
    title: string;
    description?: string;
    og?: OG;
    canonical?: string;
    jsonLd?: object | object[];
    footerMeta?: { lastImport?: string; episodeCount?: number };
    head?: any;
    /** Render without site header/footer; body locks to 100dvh, no scroll.
     *  Used by immersive views like /places/map. */
    bare?: boolean;
  }>
> = ({ title, description, og, canonical, jsonLd, footerMeta, head, bare, children }) => {
  const fullTitle = title.startsWith("Martha") ? title : `${title} — Martha Stewart Living: An Archive`;
  const ldArray = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{fullTitle}</title>
        {description && <meta name="description" content={description} />}
        {canonical && <link rel="canonical" href={canonical} />}
        <meta property="og:title" content={og?.title ?? fullTitle} />
        {(og?.description ?? description) && <meta property="og:description" content={og?.description ?? description} />}
        {(og?.url ?? canonical) && <meta property="og:url" content={og?.url ?? canonical} />}
        <meta property="og:type" content={og?.type ?? "website"} />
        <meta property="og:site_name" content="Martha Stewart Living: An Archive" />
        <meta property="og:image" content={og?.image ?? absoluteUrl("/static/icons/og-wordmark.png")} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={og?.title ?? fullTitle} />
        {(og?.description ?? description) && <meta name="twitter:description" content={og?.description ?? description} />}
        <meta name="twitter:image" content={og?.image ?? absoluteUrl("/static/icons/og-wordmark.png")} />
        <link rel="icon" href="/static/favicon.svg" type="image/svg+xml" />
        <link rel="stylesheet" href={`/static/styles/tokens.css?v=${BUILD_ID}`} />
        <link rel="stylesheet" href={`/static/styles/base.css?v=${BUILD_ID}`} />
        <link rel="stylesheet" href={`/static/styles/typography.css?v=${BUILD_ID}`} />
        <link rel="stylesheet" href={`/static/styles/components.css?v=${BUILD_ID}`} />
        <link rel="stylesheet" href={`/static/styles/layout.css?v=${BUILD_ID}`} />
        {ldArray.map((ld) => (
          <script
            type="application/ld+json"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: safeJsonForScriptTag(ld) }}
          />
        ))}
        {head}
      </head>
      <body class={bare ? "body--bare" : undefined}>
        {!bare && <Header />}
        <main id="main">{children}</main>
        {!bare && <Footer meta={footerMeta} />}
      </body>
    </html>
  );
};
