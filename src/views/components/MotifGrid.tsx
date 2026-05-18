import type { FC } from "hono/jsx";

const TONES = ["eggshell", "sage", "buttermilk", "crocus", "wisteria", "hydrangea", "stone", "putty"];

export const MotifGrid: FC<{ items: string[] }> = ({ items }) => (
  <div class="taxonomy-grid">
    {items.map((label, i) => (
      <div class="taxonomy-tile">
        <div class={`taxonomy-tile__photo taxonomy-tile__photo--${TONES[i % TONES.length]}`} aria-hidden="true">
          <span class="episode-card__photo-caption">{label}</span>
        </div>
        <span class="taxonomy-tile__label">{label}</span>
        <span class="taxonomy-tile__meta">Photograph wanted</span>
      </div>
    ))}
  </div>
);
