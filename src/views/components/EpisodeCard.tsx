import type { FC } from "hono/jsx";
import { copy } from "../../copy.js";

export type EpisodeCardData = {
  id: string;
  showName: string | null | undefined;
  title: string;
  airDate: string | null | undefined;
  airYear: number | null | undefined;
  airPrecision: string | null | undefined;
  photoUrl?: string | null;
};

const TONES = ["bedford", "eggshell", "sage", "buttermilk", "crocus", "stone"] as const;
function toneFor(id: string): (typeof TONES)[number] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length]!;
}

export function formatDate(airDate: string | null | undefined, airYear: number | null | undefined, precision: string | null | undefined): string {
  if (precision === "day" && airDate) {
    const d = new Date(`${airDate}T00:00:00Z`);
    if (!Number.isNaN(d.valueOf())) {
      return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
    }
  }
  if (airYear) return String(airYear);
  return "—";
}

export const EpisodeCard: FC<{ episode: EpisodeCardData }> = ({ episode }) => {
  const tone = toneFor(episode.id);
  const date = formatDate(episode.airDate, episode.airYear, episode.airPrecision);
  const photoClass =
    tone === "bedford" ? "episode-card__photo" : `episode-card__photo episode-card__photo--${tone}`;
  return (
    <article class="episode-card">
      <a href={`/episodes/${episode.id}`}>
        {episode.photoUrl ? (
          <div class="episode-card__photo episode-card__photo--image">
            <img
              src={episode.photoUrl}
              alt={episode.title}
              loading="lazy"
              decoding="async"
              width={640}
              height={360}
            />
          </div>
        ) : (
          <div class={photoClass} role="img" aria-label={`${copy.photographWanted} for ${episode.title}`}>
            <span class="episode-card__photo-caption">{copy.photographWanted}</span>
          </div>
        )}
        {episode.showName && <p class="episode-card__eyebrow">{episode.showName}</p>}
        <h3 class="episode-card__title">{episode.title}</h3>
        <p class="episode-card__airdate">{date}</p>
        <hr class="episode-card__rule" />
      </a>
    </article>
  );
};
