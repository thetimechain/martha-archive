import { Hono } from "hono";

export const mobileRoute = new Hono();

const SHELL = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

  <!-- Primary meta -->
  <title>Martha Episodes — A complete archive</title>
  <meta name="description" content="2,842 episodes across 12 Martha Stewart programs, 1986–now. Search by guest, ingredient, holiday, or place.">
  <meta name="color-scheme" content="light">

  <!-- Theme / status bar -->
  <meta name="theme-color" content="#F5F0E4">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Martha Episodes">
  <meta name="mobile-web-app-capable" content="yes">

  <!-- PWA manifest -->
  <link rel="manifest" href="/static/m/manifest.json">

  <!-- Apple touch icons -->
  <link rel="apple-touch-icon" href="/static/icons/icon-192.svg">
  <link rel="apple-touch-icon" sizes="180x180" href="/static/icons/icon-192.svg">

  <!-- Favicon -->
  <link rel="icon" href="/static/favicon.svg" type="image/svg+xml">

  <!-- OpenGraph -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="Martha Episodes — A complete archive">
  <meta property="og:description" content="2,842 episodes across 12 Martha Stewart programs, 1986 to now.">
  <meta property="og:url" content="https://martha.fly.dev/m/">
  <meta property="og:image" content="/static/icons/og-wordmark.svg">

  <!-- Preconnect for fonts (already self-hosted — but vhx image CDN) -->
  <link rel="preconnect" href="https://vhx.imgix.net" crossorigin>

  <!-- Preload the episode data — it's the LCP blocker -->
  <link rel="preload" href="/api/episodes/compact" as="fetch" crossorigin>

  <!-- Styles -->
  <link rel="stylesheet" href="/static/m/style.css">

  <!-- Service worker registration -->
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/static/m/sw.js', { scope: '/m/' })
        .catch(() => {}); // silently ignore if SW registration fails
    }
  </script>
</head>
<body>
  <div id="app"></div>
  <script src="/static/m/app.js"></script>
</body>
</html>`;

mobileRoute.get("/m/", (c) => c.html(SHELL));
mobileRoute.get("/m/*", (c) => c.html(SHELL));
