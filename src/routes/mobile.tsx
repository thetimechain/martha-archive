import { Hono } from "hono";

export const mobileRoute = new Hono();

const SHELL = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#F5F0E4">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <title>Martha Episodes</title>
  <link rel="stylesheet" href="/static/m/style.css">
  <link rel="icon" href="/static/favicon.svg">
</head>
<body>
  <div id="app"></div>
  <script src="/static/m/app.js" defer></script>
</body>
</html>`;

mobileRoute.get("/m/", (c) => c.html(SHELL));
mobileRoute.get("/m/*", (c) => c.html(SHELL));
