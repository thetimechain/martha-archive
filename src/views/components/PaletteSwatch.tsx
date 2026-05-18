import type { FC } from "hono/jsx";

export const PaletteSwatch: FC<{ name: string; hex: string; role?: string | null; notes?: string | null }> = ({
  name,
  hex,
  role,
  notes,
}) => (
  <div class="palette-swatch">
    <div class="palette-swatch__chip" style={`background:${hex};`} aria-label={`${name} swatch ${hex}`} />
    <div class="palette-swatch__meta">
      <span class="palette-swatch__name">{name}</span>
      <span class="palette-swatch__hex">{hex.toUpperCase()}</span>
      {role && <span class="palette-swatch__role">{role}</span>}
      {notes && <span class="palette-swatch__role">{notes}</span>}
    </div>
  </div>
);
