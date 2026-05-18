import type { FC } from "hono/jsx";

export const TypeRamp: FC = () => (
  <div class="type-ramp">
    <div class="row"><span class="key">Display XL · wordmark</span><span class="display-xl">MARTHA</span></div>
    <div class="row"><span class="key">Display · page opener</span><span class="display">It is a good thing.</span></div>
    <div class="row"><span class="key">Display smaller · section</span><span class="display-smaller">Cherry preserves and tool handles.</span></div>
    <div class="row"><span class="key">Smallcap eyebrow</span><span class="smallcap-eyebrow">Begin with the best ingredients</span></div>
    <div class="row"><span class="key">Body · serif</span><span class="body">A multi-segment episode covering chocolate chip cookies, hydrangeas, and oven-dried tomatoes. Martha moves through each subject with precision, combining kitchen technique, craft, and home management.</span></div>
    <div class="row"><span class="key">Caption · italic</span><span class="caption">Photograph wanted.</span></div>
  </div>
);
