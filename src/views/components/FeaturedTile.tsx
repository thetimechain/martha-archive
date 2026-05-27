import type { FC } from "hono/jsx";
import type { FeaturedTile as FeaturedTileData } from "../../db/queries.js";
import { formatDate } from "./EpisodeCard.js";

/**
 * Sits in the first slot of the /episodes archive grid. Same outer footprint
 * as EpisodeCard so the grid stays tidy; visually differentiated with a
 * "Today" / "This week" eyebrow and a slightly heavier surround.
 *
 * Picks are randomized per request (see fetchFeaturedTile), so two visitors
 * in the same minute may see two different episodes.
 */
export const FeaturedTile: FC<{ episode: FeaturedTileData }> = ({ episode }) => {
  const date = formatDate(episode.air_date, episode.air_year, "day");
  const eyebrow =
    episode.bucket === "on-this-day"
      ? `On this day · ${episode.air_year ?? "—"}`
      : `This week in ${episode.air_year ?? "—"}`;
  return (
    <article class="episode-card episode-card--featured" data-bucket={episode.bucket}>
      <a href={`/episodes/${episode.id}`}>
        {episode.photo_url ? (
          <div class="episode-card__photo episode-card__photo--image episode-card__photo--featured">
            <img
              src={episode.photo_url}
              alt={episode.title}
              loading="eager"
              decoding="async"
              width={640}
              height={360}
            />
            <span class="featured-tile__badge">{eyebrow}</span>
          </div>
        ) : (
          <div class="episode-card__photo episode-card__photo--featured episode-card__photo--featured-no-image" role="img" aria-label={eyebrow}>
            <span class="featured-tile__year">{episode.air_year ?? ""}</span>
            <span class="featured-tile__badge">{eyebrow}</span>
          </div>
        )}
        <p class="episode-card__eyebrow featured-tile__eyebrow">{eyebrow}</p>
        <h3 class="episode-card__title">{episode.title}</h3>
        <p class="episode-card__airdate">
          {episode.show_name ?? episode.show_slug} · {date}
        </p>
        <hr class="episode-card__rule" />
      </a>
    </article>
  );
};
