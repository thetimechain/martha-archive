import { env } from "./env.js";

const SITE_NAME = "Martha Stewart Living: An Archive";

export function siteHost(): string {
  if (env.CANONICAL_HOST) return env.CANONICAL_HOST;
  if (env.FLY_APP_NAME) return `https://${env.FLY_APP_NAME}.fly.dev`;
  return "https://martha.fly.dev";
}

export function canonical(path: string): string {
  const base = siteHost();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export type EpJsonLdInput = {
  id: string;
  title: string;
  description?: string | null;
  air_date?: string | null;
  air_year?: number | null;
  season?: number | null;
  episode_number?: number | null;
  runtime_minutes?: number | null;
  photo_url?: string | null;
  show_name?: string | null;
  show_slug?: string | null;
  guests?: string[];
};

export function tvEpisodeJsonLd(ep: EpJsonLdInput) {
  const url = canonical(`/episodes/${ep.id}`);
  return {
    "@context": "https://schema.org",
    "@type": "TVEpisode",
    name: ep.title,
    url,
    ...(ep.description ? { description: ep.description } : {}),
    ...(ep.air_date ? { datePublished: ep.air_date } : ep.air_year ? { datePublished: String(ep.air_year) } : {}),
    ...(ep.season !== null && ep.season !== undefined ? { partOfSeason: { "@type": "TVSeason", seasonNumber: ep.season } } : {}),
    ...(ep.episode_number !== null && ep.episode_number !== undefined ? { episodeNumber: ep.episode_number } : {}),
    ...(ep.runtime_minutes ? { timeRequired: `PT${ep.runtime_minutes}M` } : {}),
    ...(ep.photo_url ? { image: ep.photo_url } : {}),
    ...(ep.show_name && ep.show_slug
      ? { partOfSeries: { "@type": "TVSeries", name: ep.show_name, url: canonical(`/shows/${ep.show_slug}`) } }
      : {}),
    ...(ep.guests && ep.guests.length
      ? { actor: ep.guests.map((g) => ({ "@type": "Person", name: g })) }
      : {}),
  };
}

export function tvSeriesJsonLd(opts: { slug: string; name: string; description?: string; numberOfEpisodes?: number; startYear?: number; endYear?: number }) {
  const url = canonical(`/shows/${opts.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: opts.name,
    url,
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.numberOfEpisodes ? { numberOfEpisodes: opts.numberOfEpisodes } : {}),
    ...(opts.startYear ? { startDate: String(opts.startYear) } : {}),
    ...(opts.endYear ? { endDate: String(opts.endYear) } : {}),
    creator: { "@type": "Person", name: "Martha Stewart" },
  };
}

export function itemListJsonLd(opts: { url: string; name: string; items: Array<{ url: string; name: string }> }) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: opts.name,
    url: opts.url,
    numberOfItems: opts.items.length,
    itemListElement: opts.items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: it.url,
      name: it.name,
    })),
  };
}

export function collectionPageJsonLd(opts: { url: string; name: string; description: string; itemCount: number }) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: opts.name,
    description: opts.description,
    url: opts.url,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: siteHost() },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: opts.itemCount,
    },
  };
}

export function breadcrumbsJsonLd(crumbs: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
}

export function websiteJsonLd() {
  const base = siteHost();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: base,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${base}/episodes?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}
