import type { FC, PropsWithChildren } from "hono/jsx";
import { Header } from "./Header.js";
import { Footer } from "./Footer.js";

export type OG = {
  title: string;
  description?: string;
  url?: string;
  image?: string;
};

export const Layout: FC<
  PropsWithChildren<{
    title: string;
    description?: string;
    og?: OG;
    canonical?: string;
    footerMeta?: { lastImport?: string; episodeCount?: number };
  }>
> = ({ title, description, og, canonical, footerMeta, children }) => {
  const fullTitle = title.startsWith("Martha") ? title : `${title} — Martha Stewart Living: An Archive`;
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
        <meta property="og:type" content="website" />
        <meta property="og:image" content={og?.image ?? "/static/og-wordmark.png"} />
        <link rel="icon" href="/static/favicon.svg" type="image/svg+xml" />
        <link rel="stylesheet" href="/static/styles/tokens.css" />
        <link rel="stylesheet" href="/static/styles/base.css" />
        <link rel="stylesheet" href="/static/styles/typography.css" />
        <link rel="stylesheet" href="/static/styles/components.css" />
        <link rel="stylesheet" href="/static/styles/layout.css" />
      </head>
      <body>
        <Header />
        <main id="main">{children}</main>
        <Footer meta={footerMeta} />
      </body>
    </html>
  );
};
