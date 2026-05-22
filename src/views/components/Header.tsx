import type { FC } from "hono/jsx";
import { copy } from "../../copy.js";

export const Header: FC = () => (
  <header class="site-header page" role="banner">
    <a href="/" class="wordmark display-xl" aria-label="Martha Stewart Living, an archive — home">
      MARTHA&nbsp;STEWART&nbsp;LIVING
    </a>
    <p class="caption" style="margin-top:var(--space-1);font-style:italic;">{copy.episodeIndex}</p>
    <hr class="hairline" />
    <nav aria-label="Primary" class="site-nav">
      <ul>
        <li>
          <a class="smallcap-eyebrow" href="/episodes">
            {copy.archive}
          </a>
        </li>
        <li>
          <a class="smallcap-eyebrow" href="/collections">
            Collections
          </a>
        </li>
        <li>
          <a class="smallcap-eyebrow" href="/calendar">
            {copy.calendar}
          </a>
        </li>
        <li>
          <a class="smallcap-eyebrow" href="/design-system">
            {copy.design}
          </a>
        </li>
        <li>
          <a class="smallcap-eyebrow" href="/facts">
            The numbers
          </a>
        </li>
        <li>
          <a class="smallcap-eyebrow" href="/gaps">
            {copy.gaps}
          </a>
        </li>
      </ul>
      <form class="site-search" action="/episodes" method="get" role="search">
        <label class="visually-hidden" for="q">
          {copy.searchLabel}
        </label>
        <input
          type="search"
          name="q"
          id="q"
          placeholder="Search episodes"
          autoComplete="off"
          spellcheck={false}
        />
      </form>
    </nav>
  </header>
);
