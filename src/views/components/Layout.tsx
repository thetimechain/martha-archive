import type { FC, PropsWithChildren } from "hono/jsx";
import { Header } from "./Header.js";
import { Footer } from "./Footer.js";

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
  }>
> = ({ title, description, og, canonical, jsonLd, footerMeta, head, children }) => {
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
        {og?.description && <meta property="og:description" content={og.description} />}
        {og?.url && <meta property="og:url" content={og.url} />}
        <meta property="og:type" content={og?.type ?? "website"} />
        <meta property="og:site_name" content="Martha Stewart Living: An Archive" />
        <meta property="og:image" content={og?.image ?? "/static/og-wordmark.png"} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={og?.title ?? fullTitle} />
        {og?.description && <meta name="twitter:description" content={og.description} />}
        <meta name="twitter:image" content={og?.image ?? "/static/og-wordmark.png"} />
        <link rel="icon" href="/static/favicon.svg" type="image/svg+xml" />
        <link rel="stylesheet" href="/static/styles/tokens.css" />
        <link rel="stylesheet" href="/static/styles/base.css" />
        <link rel="stylesheet" href="/static/styles/typography.css" />
        <link rel="stylesheet" href="/static/styles/components.css" />
        <link rel="stylesheet" href="/static/styles/layout.css" />
        {ldArray.map((ld) => (
          <script
            type="application/ld+json"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
          />
        ))}
        {head}
      </head>
      <body>
        <Header />
        <main id="main">{children}</main>
        <Footer meta={footerMeta} />
      </body>
    </html>
  );
};
