/* Martha Episodes — Mobile SPA
 * Vanilla JS, no framework. Loads all episodes once, searches client-side.
 * Routes via history.pushState. Spec: handoff-mobile.md
 */
(function () {
  'use strict';

  /* ─── Show metadata — canonical from data.js in the handoff package ──── */
  // bg/fg colors are drawn from the 1990s magazine palettes; DO NOT invent new ones.
  const SHOWS = {
    'martha-stewart-living':       { short:'Living',        bg:'#F3EBC9', fg:'#5A4914' },
    'martha-bakes':                { short:'Bakes',         bg:'#E4ECDB', fg:'#4A5C3A' },
    'cooking-school':              { short:'Cooking School',bg:'#DDE5EE', fg:'#3B4F66' },
    'martha-stewart-show':         { short:'The Show',      bg:'#E8DFE8', fg:'#4F2F5A' },
    'martha-and-snoops':           { short:'Martha & Snoop',bg:'#F0DED2', fg:'#7A3F22' },
    'martha-knows-best':           { short:'Knows Best',    bg:'#E8EBD8', fg:'#4F5638' },
    'martha-gets-down-and-dirty':  { short:'Down & Dirty',  bg:'#DDE6DE', fg:'#3F5B45' },
    'martha-cooks':                { short:'Cooks',         bg:'#F3E6D3', fg:'#6B4823' },
    'martha-holidays':             { short:'Holidays',      bg:'#E8D8D2', fg:'#6E2820' },
    'apprentice-martha-stewart':   { short:'Apprentice',    bg:'#D6DDE3', fg:'#36464F' },
    'from-marthas-kitchen':        { short:'Kitchen',       bg:'#F0D8D2', fg:'#6E2820' },
    'holiday-special':             { short:'Specials',      bg:'#DDE3EC', fg:'#3A4960' },
  };
  // Convenience lookup for the old code paths that use SHOW_SHORT
  const SHOW_SHORT = Object.fromEntries(Object.entries(SHOWS).map(([k,v]) => [k, v.short]));

  // Full show names derived from SHOWS table
  const SHOW_NAMES = {
    'martha-stewart-living':          'Martha Stewart Living',
    'martha-stewart-show':            'The Martha Stewart Show',
    'martha-bakes':                   'Martha Bakes',
    'cooking-school':                 "Martha Stewart's Cooking School",
    'martha-and-snoops':              "Martha & Snoop's Potluck",
    'martha-knows-best':              'Martha Knows Best',
    'martha-cooks':                   'Martha Cooks',
    'martha-holidays':                'Martha Holidays',
    'from-marthas-kitchen':           "From Martha's Kitchen",
    'martha-gets-down-and-dirty':     'Martha Gets Down and Dirty',
    'apprentice-martha-stewart':      'The Apprentice: Martha Stewart',
    'holiday-special':                'Holiday Specials',
  };

  /* ─── Popular chips — 12 real MSL topics, all shown at once in a 4×3 grid ─
     Verified against the DB: each has 30+ episodes in Martha Stewart Living.
     Ordered so each row of 4 reads as a coherent group.                      */
  const ALL_CHIPS = [
    // Row 1 — the garden and kitchen
    { q:'gardening',  label:'gardening'  },
    { q:'crafts',     label:'crafts'     },
    { q:'baking',     label:'baking'     },
    { q:'cookies',    label:'cookies'    },
    // Row 2 — the seasons
    { q:'halloween',  label:'halloween'  },
    { q:'christmas',  label:'christmas'  },
    { q:'flowers',    label:'flowers'    },
    { q:'field trip', label:'field trip' },
    // Row 3 — the table
    { q:'french',     label:'french'     },
    { q:'pasta',      label:'pasta'      },
    { q:'chocolate',  label:'chocolate'  },
    { q:'pie',        label:'pies'       },
  ];
  // All chips shown at once — no expand button
  const CHIPS_DEFAULT = ALL_CHIPS.length;

  /* ─── State ─────────────────────────────────────────────────────────────── */
  let episodes = null;      // full compact array, loaded once
  let showSeasons = {};     // show_slug → Set of season numbers
  let query = '';
  let filterShow = 'martha-stewart-living'; // default to the OG
  let filterYear = '';
  let filterSeason = '';
  let chipsExpanded = false;
  let currentRoute = { path: '/', params: {} };
  let searchInput = null;

  /* ─── Data loading ──────────────────────────────────────────────────────── */
  async function loadEpisodes() {
    const r = await fetch('/api/episodes/compact', {
      headers: { 'Accept-Encoding': 'gzip', 'Accept': 'application/json' },
    });
    if (!r.ok) throw new Error('Failed to load episodes: ' + r.status);
    episodes = await r.json();
    // Build show→seasons index
    for (const ep of episodes) {
      if (!showSeasons[ep.show_slug]) showSeasons[ep.show_slug] = new Set();
      if (ep.season != null) showSeasons[ep.show_slug].add(ep.season);
    }
  }

  /* ─── Scoring — exact spec from handoff §3 ──────────────────────────────── */
  function searchScore(ep, q) {
    const n = q.toLowerCase().trim();
    if (!n) return 0;
    let s = 0;
    if (ep.title.toLowerCase().includes(n))                                  s += 5;
    if ((ep.tags   || []).some(t => t.toLowerCase().includes(n)))            s += 4;
    if ((ep.guests || []).some(g => g.toLowerCase().includes(n)))            s += 4;
    if ((ep.recipes|| []).some(r => r.toLowerCase().includes(n)))            s += 3;
    if ((ep.topics || []).some(t => (t||'').toLowerCase().includes(n)))      s += 2;
    if ((ep.themes || []).some(t => (t||'').toLowerCase().includes(n)))      s += 2;
    const short = (SHOW_SHORT[ep.show_slug] || '').toLowerCase();
    if (short.includes(n))                                                   s += 2;
    const name = (ep.show_name || SHOW_NAMES[ep.show_slug] || '').toLowerCase();
    if (name.includes(n))                                                    s += 2;
    if ((ep.description || '').toLowerCase().includes(n))                    s += 1;
    if ((ep.streaming   || []).some(x => x.toLowerCase().includes(n)))      s += 1;
    return s;
  }

  /* ─── Filter + search ───────────────────────────────────────────────────── */
  function getFiltered() {
    let pool = episodes;
    if (filterShow)   pool = pool.filter(e => e.show_slug === filterShow);
    if (filterYear)   pool = pool.filter(e => e.air_year  === Number(filterYear));
    if (filterSeason && filterShow) pool = pool.filter(e => e.season === Number(filterSeason));
    if (!query.trim()) return { items: pool, scored: false };
    const q = query.trim();
    const ranked = pool
      .map(e => ({ ep: e, s: searchScore(e, q) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s);
    return { items: ranked.map(x => x.ep), scored: true };
  }

  /* ─── Highlight helper ──────────────────────────────────────────────────── */
  function hl(text, q) {
    if (!q || !text) return esc(text || '');
    const safe = esc(text);
    const n = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(`(${n})`, 'gi'), '<mark>$1</mark>');
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ─── Formatting helpers ────────────────────────────────────────────────── */
  function fmtDate(ep) {
    if (!ep.air_date) return ep.air_year ? String(ep.air_year) : '—';
    const d = new Date(ep.air_date + 'T00:00:00Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }

  function fmtDuration(mins) {
    if (!mins) return '';
    return '· ' + mins + 'm';
  }

  // Per-show badge using canonical inline colors from data.js
  function badgeHTML(slug) {
    const show = SHOWS[slug];
    if (show) {
      return `<span class="ep-badge" style="background:${esc(show.bg)};color:${esc(show.fg)};">${esc(show.short)}</span>`;
    }
    return `<span class="ep-badge" style="background:#E0D9C8;color:#5C544A;">${esc((slug||'').slice(0,8).toUpperCase())}</span>`;
  }

  function badgeClass(slug) {
    return 'ep-badge'; // class only; inline style handles colors
  }

  function shortName(slug) {
    return (SHOWS[slug] || SHOW_SHORT[slug]) ? (SHOWS[slug]?.short || SHOW_SHORT[slug]) : (SHOW_NAMES?.[slug] || slug).toUpperCase().slice(0, 8);
  }

  /* ─── Tonight/This month helper ─────────────────────────────────────────── */
  function getThisMonthEpisodes() {
    const now = new Date();
    const m = now.getMonth() + 1;
    return episodes
      .filter(e => {
        if (!e.air_date) return false;
        const month = parseInt(e.air_date.slice(5, 7), 10);
        return month === m;
      })
      .sort((a, b) => {
        // Newest year first (most recent airing in this month)
        return (b.air_year || 0) - (a.air_year || 0);
      })
      .slice(0, 10);
  }

  function getRecentEpisodes() {
    return [...episodes]
      .filter(e => e.air_date)
      .sort((a, b) => b.air_date.localeCompare(a.air_date))
      .slice(0, 30);
  }

  /* ─── Tags that matter (filter year-only tags out of pill display) ──────── */
  function goodTags(ep, max) {
    const yearRe = /^\d{4}$/;
    const tags = (ep.tags || []).filter(t => !yearRe.test(t));
    return tags.slice(0, max || 3);
  }

  /* ─── Per-show placeholder colors for photo-less episodes ──────────────── */
  const SHOW_PLACEHOLDER = {
    'martha-stewart-living':       '#F3EBC9',
    'martha-bakes':                '#E4ECDB',
    'cooking-school':              '#DDE5EE',
    'martha-stewart-show':         '#E8DFE8',
    'martha-and-snoops':           '#F0DED2',
    'martha-knows-best':           '#E8EBD8',
    'martha-gets-down-and-dirty':  '#DDE6DE',
    'martha-cooks':                '#F3E6D3',
    'martha-holidays':             '#E8D8D2',
    'apprentice-martha-stewart':   '#D6DDE3',
    'from-marthas-kitchen':        '#F0D8D2',
    'holiday-special':             '#DDE3EC',
  };

  /* ─── Episode CARD — full-width hero image ───────────────────────────────
     Used when the episode has a photograph. Shows image full-width 16:9
     with season numeral overlaid, then title + metadata below.              */
  function epCardHTML(ep, q) {
    const tags  = goodTags(ep, 3);
    const guest = (ep.guests || [])[0];
    const pills = [
      ...(guest ? [`<span class="pill-guest">★ ${esc(guest)}</span>`] : []),
      ...tags.map(t => `<span class="pill-tag">${esc(t)}</span>`),
    ].join('');

    const hasNum = ep.season != null && ep.episode_number != null;
    const numHTML = hasNum
      ? `<div class="ep-card__numeral">
           <span class="ep-card__s">S${ep.season}</span>
           <span class="ep-card__e">${ep.episode_number}</span>
         </div>`
      : ep.air_year
        ? `<div class="ep-card__numeral"><span class="ep-card__e" style="font-size:20px;">${ep.air_year}</span></div>`
        : '';

    // Image or show-colored placeholder
    const placeholderColor = SHOW_PLACEHOLDER[ep.show_slug] || '#E0D9C8';
    const imgHTML = ep.photo_url
      ? `<img class="ep-card__img"
            src="${esc(ep.photo_url)}"
            alt="${esc(ep.title)}"
            loading="lazy"
            decoding="async"
            width="640" height="360"
            onload="this.classList.add('loaded')">`
      : '';

    return `<article class="ep-card" data-id="${esc(ep.id)}" role="button" tabindex="0" aria-label="${esc(ep.title)}">
      <div class="ep-card__img-wrap" style="background:${esc(placeholderColor)};">
        ${imgHTML}
        ${numHTML}
      </div>
      <div class="ep-card__body">
        <div class="ep-card__meta">
          ${badgeHTML(ep.show_slug)}
          <span class="ep-date">${fmtDate(ep)} ${fmtDuration(ep.runtime_minutes)}</span>
        </div>
        <h3 class="ep-card__title">${hl(ep.title, q)}</h3>
        ${ep.description ? `<p class="ep-card__desc">${hl(ep.description, q)}</p>` : ''}
        ${pills ? `<div class="ep-card__pills">${pills}</div>` : ''}
      </div>
    </article>`;
  }

  /* ─── Episode ROW — compact list (photo-less fallback) ──────────────────── */
  function epRowHTML(ep, q) {
    const tags  = goodTags(ep, 3);
    const guest = (ep.guests || [])[0];

    let numCol;
    if (ep.season != null && ep.episode_number != null) {
      numCol = `<div class="ep-num">
        <span class="ep-num__season">S${ep.season}</span>
        <span class="ep-num__episode">${ep.episode_number}</span>
      </div>`;
    } else if (ep.air_year) {
      numCol = `<div class="ep-num ep-num--year">
        <span class="ep-num__season">${ep.air_year}</span>
      </div>`;
    } else {
      numCol = `<div class="ep-num"><span class="ep-num__season">—</span></div>`;
    }

    const pills = [
      ...(guest ? [`<span class="pill-guest">★ ${esc(guest)}</span>`] : []),
      ...tags.map(t => `<span class="pill-tag">${esc(t)}</span>`),
    ].join('');

    return `<article class="ep-row" data-id="${esc(ep.id)}" role="button" tabindex="0" aria-label="${esc(ep.title)}">
      ${numCol}
      <div class="ep-body">
        <div class="ep-meta">
          ${badgeHTML(ep.show_slug)}
          <span class="ep-date">${fmtDate(ep)} ${fmtDuration(ep.runtime_minutes)}</span>
        </div>
        <h3 class="ep-title">${hl(ep.title, q)}</h3>
        ${ep.description ? `<p class="ep-desc">${hl(ep.description, q)}</p>` : ''}
        ${pills ? `<div class="ep-pills">${pills}</div>` : ''}
      </div>
    </article>`;
  }

  /* Choose card vs row based on whether the episode has a photo */
  function epHTML(ep, q) {
    return ep.photo_url ? epCardHTML(ep, q) : epRowHTML(ep, q);
  }

  /* ─── Count line ─────────────────────────────────────────────────────────── */
  function countLine(result) {
    const total = episodes.length;
    const isDefaultState = !query && !filterYear && !filterSeason && filterShow === 'martha-stewart-living';
    if (result.scored && query) {
      return `${result.items.length.toLocaleString()} result${result.items.length !== 1 ? 's' : ''} for "${esc(query)}"`;
    }
    if (isDefaultState) {
      return `${result.items.length.toLocaleString()} episodes · Martha Stewart Living · 1993–2004`;
    }
    if (filterShow || filterYear || filterSeason) {
      return `${result.items.length.toLocaleString()} episode${result.items.length !== 1 ? 's' : ''}`;
    }
    return `${total.toLocaleString()} episodes · ${Object.keys(showSeasons).length} programs · 1993–now`;
  }

  /* ─── Build season options for the current show ─────────────────────────── */
  function buildSeasonOptions() {
    if (!filterShow || !showSeasons[filterShow]) return '';
    const seasons = [...showSeasons[filterShow]].sort((a, b) => a - b);
    return seasons.map(s => `<option value="${s}" ${filterSeason == s ? 'selected' : ''}>Season ${s}</option>`).join('');
  }

  /* ─── Build year options ─────────────────────────────────────────────────── */
  function buildYearOptions() {
    const years = [...new Set(episodes.map(e => e.air_year).filter(Boolean))].sort((a, b) => b - a);
    return years.map(y => `<option value="${y}" ${filterYear == y ? 'selected' : ''}>${y}</option>`).join('');
  }

  /* ─── Build show options ─────────────────────────────────────────────────── */
  function buildShowOptions() {
    const slugs = Object.keys(showSeasons).sort();
    return slugs.map(s => `<option value="${s}" ${filterShow === s ? 'selected' : ''}>${SHOW_NAMES[s] || s}</option>`).join('');
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * HOME VIEW
   * ─────────────────────────────────────────────────────────────────────────── */
  function renderHome() {
    const result   = getFiltered();
    const chips    = ALL_CHIPS; // all shown at once — grid fills evenly
    const hasQuery = !!query.trim();
    const hasFilter= !!(filterShow || filterYear || filterSeason);
    const showExpand = false; // no expand needed

    let feed = '';
    if (hasQuery || hasFilter) {
      if (result.items.length === 0) {
        feed = `<div class="state-empty">
          <p class="state-empty__title">No episodes match</p>
          <p class="state-empty__sub">Try a different word or clear the filters.</p>
        </div>`;
      } else {
        feed = `<div class="section-hd">
          ${hasQuery ? `RESULTS <span class="section-hd__count">${result.items.length}</span>` : 'EPISODES'}
        </div>` + result.items.map(ep => epHTML(ep, query)).join('');
      }
    } else {
      const tonight = getThisMonthEpisodes();
      const recent  = getRecentEpisodes();
      const now = new Date();
      const monthName = now.toLocaleString('en-US', { month: 'long' }).toUpperCase();

      feed = `
        ${tonight.length > 0 ? `
          <div class="section-hd">${monthName}, IN EARLIER YEARS</div>
          ${tonight.map(ep => epHTML(ep, '')).join('')}
        ` : ''}
        <div class="section-hd">RECENT IN THE ARCHIVE <span class="section-hd__count">${recent.length}</span></div>
        ${recent.map(ep => epHTML(ep, '')).join('')}
      `;
    }

    document.getElementById('view').innerHTML = `
      <div class="search-wrap">
        <div class="search-input">
          <svg class="search-icon" width="18" height="18" viewBox="0 0 17 17" fill="none" aria-hidden="true">
            <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" stroke-width="1.5"/>
            <line x1="12" y1="12" x2="16" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input id="q" type="search" placeholder='Search "brunch", "new york"…'
            autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
            value="${esc(query)}" inputmode="search" aria-label="Search episodes">
          <button class="search-clear ${query ? 'visible' : ''}" id="clear-q" aria-label="Clear search">×</button>
        </div>
        <div class="count-row">
          <span class="count-line" id="count-line">${countLine(result)}</span>
          ${(hasFilter || query) ? `<button class="clear-filters visible" id="clear-filters" style="padding:0;background:none;border:none;">× clear</button>` : ''}
        </div>
      </div>

      <div class="filter-row">
        <div class="filter-select-wrap ${filterShow ? 'active' : ''}">
          <select class="filter-select" id="sel-show" aria-label="Show">
            <option value="">Show</option>
            ${buildShowOptions()}
          </select>
          <span class="filter-chevron" aria-hidden="true">▾</span>
        </div>
        <div class="filter-select-wrap ${filterYear ? 'active' : ''}">
          <select class="filter-select" id="sel-year" aria-label="Year">
            <option value="">Year</option>
            ${buildYearOptions()}
          </select>
          <span class="filter-chevron" aria-hidden="true">▾</span>
        </div>
        <div class="filter-select-wrap ${filterSeason ? 'active' : ''} ${!filterShow ? 'disabled' : ''}">
          <select class="filter-select" id="sel-season" aria-label="Season" ${!filterShow ? 'disabled' : ''}>
            <option value="">Season</option>
            ${buildSeasonOptions()}
          </select>
          <span class="filter-chevron" aria-hidden="true">▾</span>
        </div>
      </div>

      ${!hasQuery ? `
        <div class="chips-section" id="chips-section">
          <div class="chips-label">POPULAR</div>
          <div class="chips-wrap">
            ${chips.map(c => `<button class="chip" data-chip="${esc(c.q)}">${esc(c.label)}</button>`).join('')}
          </div>
        </div>
      ` : ''}

      <div id="feed">${feed}</div>
    `;

    // Wire search input
    searchInput = document.getElementById('q');
    let debounce = 0;
    searchInput.addEventListener('input', e => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        query = e.target.value;
        renderHome();
        // Re-focus to keep keyboard up
        document.getElementById('q')?.focus();
      }, 120);
    });
    // Autofocus only on fresh load (not after search re-render)
    if (!query && !hasFilter) {
      searchInput.focus();
    } else {
      // Move cursor to end
      searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
    }

    // Clear search
    document.getElementById('clear-q')?.addEventListener('click', () => {
      query = '';
      renderHome();
      document.getElementById('q')?.focus();
    });

    // Clear all filters (button now lives inside search-wrap)
    document.getElementById('clear-filters')?.addEventListener('click', (e) => {
      e.stopPropagation();
      query = ''; filterShow = 'martha-stewart-living'; filterYear = ''; filterSeason = '';
      renderHome();
      document.getElementById('q')?.focus();
    });

    // Show select
    document.getElementById('sel-show')?.addEventListener('change', e => {
      filterShow = e.target.value;
      filterSeason = '';
      renderHome();
    });

    // Year select
    document.getElementById('sel-year')?.addEventListener('change', e => {
      filterYear = e.target.value;
      renderHome();
    });

    // Season select
    document.getElementById('sel-season')?.addEventListener('change', e => {
      filterSeason = e.target.value;
      renderHome();
    });

    // Chip taps
    document.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        query = btn.dataset.chip;
        renderHome();
        document.getElementById('q')?.focus();
      });
    });

    // Episode row taps
    document.querySelectorAll('.ep-row').forEach(row => {
      row.addEventListener('click', () => navigate('/episode/' + row.dataset.id));
      row.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') navigate('/episode/' + row.dataset.id);
      });
    });
    // Episode card taps (same behavior)
    document.querySelectorAll('.ep-card').forEach(card => {
      card.addEventListener('click', () => navigate('/episode/' + card.dataset.id));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') navigate('/episode/' + card.dataset.id);
      });
    });
    // Fade-in images that are already cached (complete before load fires)
    document.querySelectorAll('.ep-card__img').forEach(img => {
      if (img.complete && img.naturalWidth > 0) img.classList.add('loaded');
    });

    // Update URL with state
    const sp = new URLSearchParams();
    if (query)       sp.set('q', query);
    if (filterShow)  sp.set('show', filterShow);
    if (filterYear)  sp.set('year', filterYear);
    if (filterSeason)sp.set('season', filterSeason);
    const qs = sp.toString();
    const url = '/m/' + (qs ? '?' + qs : '');
    if (window.location.pathname + window.location.search !== url) {
      history.replaceState({}, '', url);
    }
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * EPISODE DETAIL VIEW
   * ─────────────────────────────────────────────────────────────────────────── */
  function renderEpisodeDetail(id) {
    const ep = episodes.find(e => e.id === id);
    if (!ep) {
      document.getElementById('view').innerHTML = `
        <div class="state-empty">
          <p class="state-empty__title">Episode not found</p>
          <p class="state-empty__sub"><button onclick="navigate('/')">Back to search</button></p>
        </div>`;
      return;
    }

    // Prev / Next within the same show+season
    let prev = null, next = null;
    if (ep.show_slug && ep.season != null && ep.episode_number != null) {
      const season = episodes.filter(e =>
        e.show_slug === ep.show_slug && e.season === ep.season && e.episode_number != null
      ).sort((a, b) => a.episode_number - b.episode_number);
      const idx = season.findIndex(e => e.id === id);
      if (idx > 0)               prev = season[idx - 1];
      if (idx < season.length - 1) next = season[idx + 1];
    }

    const hero = ep.photo_url
      ? `<img class="detail-hero" src="${esc(ep.photo_url)}" alt="${esc(ep.title)}" loading="eager" decoding="async">`
      : `<div class="detail-hero-placeholder">PHOTOGRAPH WANTED</div>`;

    const streamingPills = (ep.streaming || []).length > 0
      ? `<div class="detail-section">
          <div class="detail-section-hd">STREAMING</div>
          <div class="detail-streaming-pills">
            ${(ep.streaming || []).map(s => `<span class="detail-streaming-pill">${esc(s)}</span>`).join('')}
          </div>
        </div>` : '';

    const recipesSection = (ep.recipes || []).length > 0
      ? `<div class="detail-section">
          <div class="detail-section-hd">RECIPES</div>
          <ul class="detail-list">${(ep.recipes || []).map(r => `<li>${esc(r)}</li>`).join('')}</ul>
        </div>` : '';

    const guestsSection = (ep.guests || []).length > 0
      ? `<div class="detail-section">
          <div class="detail-section-hd">GUESTS</div>
          <ul class="detail-list">${(ep.guests || []).map(g => `<li>
            <button class="tap-target" style="font:inherit;color:var(--garden-hosta);background:none;border:none;padding:0;cursor:pointer;font-family:var(--font-serif);"
              onclick="setQueryAndGo('${esc(g.replace(/'/g, "\\'"))}')">★ ${esc(g)}</button>
          </li>`).join('')}</ul>
        </div>` : '';

    const topicsSection = (ep.topics || []).length > 0
      ? `<div class="detail-section">
          <div class="detail-section-hd">TOPICS</div>
          <div class="ep-pills" style="padding:2px 0;">
            ${(ep.topics || []).map(t => `<button class="chip" onclick="setQueryAndGo('${esc(t.replace(/'/g, "\\'"))}')">${esc(t)}</button>`).join('')}
          </div>
        </div>` : '';

    const tagsSection = goodTags(ep).length > 0
      ? `<div class="detail-section">
          <div class="detail-section-hd">TAGS</div>
          <div class="ep-pills" style="padding:2px 0;">
            ${goodTags(ep, 20).map(t => `<button class="chip" onclick="setQueryAndGo('${esc(t.replace(/'/g, "\\'"))}')">${esc(t)}</button>`).join('')}
          </div>
        </div>` : '';

    const watchBtn = ep.mst_canonical_url
      ? `<a class="detail-watch-btn" href="${esc(ep.mst_canonical_url)}" target="_blank" rel="noreferrer">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <polygon points="6,4 16,10 6,16" fill="white"/>
          </svg>
          Watch on marthastewart.tv
        </a>` : '';

    const confColor = { confirmed: 'conf-confirmed', partial: 'conf-partial', inferred: 'conf-inferred' };
    const confidence = ep.confidence || 'inferred';

    const prevNextHTML = `<div class="prevnext">
      <div class="prevnext__item">
        ${prev ? `<button onclick="navigate('/episode/${esc(prev.id)}')" style="background:none;border:none;text-align:left;cursor:pointer;padding:0;">
          <div class="prevnext__dir">← Previous</div>
          <div class="prevnext__title">${esc(prev.title)}</div>
        </button>` : `<div class="prevnext__dir" style="color:var(--ink-whisper)">—</div>`}
      </div>
      <div class="prevnext__item prevnext__item--next">
        ${next ? `<button onclick="navigate('/episode/${esc(next.id)}')" style="background:none;border:none;text-align:right;cursor:pointer;padding:0;width:100%;">
          <div class="prevnext__dir">Next →</div>
          <div class="prevnext__title">${esc(next.title)}</div>
        </button>` : `<div class="prevnext__dir" style="color:var(--ink-whisper)">—</div>`}
      </div>
    </div>`;

    document.getElementById('view').innerHTML = `
      ${hero}
      <div class="detail-body">
        <div class="detail-eyebrow">
          <span class="${badgeClass(ep.show_slug)}" data-show="${esc(ep.show_slug)}">${shortName(ep.show_slug)}</span>
          ${ep.season != null && ep.episode_number != null
            ? `<span style="font-size:12px;color:var(--ink-soft)">S${ep.season}·E${ep.episode_number}</span>`
            : ''}
        </div>
        <h1 class="detail-title">${esc(ep.title)}</h1>
        <p class="detail-airdate">${fmtDate(ep)}${ep.runtime_minutes ? ' · ' + ep.runtime_minutes + ' min' : ''}</p>
        ${ep.description ? `<p class="detail-desc">${esc(ep.description)}</p>` : ''}
        ${watchBtn}
        ${streamingPills}
        ${recipesSection}
        ${guestsSection}
        ${topicsSection}
        ${tagsSection}
        <div class="detail-confidence">
          <span class="confidence-dot ${confColor[confidence] || 'conf-inferred'}"></span>
          ${confidence}${ep.provenance === 'marthastewart-tv' ? ' · sourced from marthastewart.tv' : ''}
        </div>
      </div>
      ${prevNextHTML}
    `;
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * SHOW VIEW
   * ─────────────────────────────────────────────────────────────────────────── */
  function renderShow(slug, seasonNum) {
    const name = SHOW_NAMES[slug] || slug;
    const seasons = showSeasons[slug] ? [...showSeasons[slug]].sort((a, b) => a - b) : [];
    const allShowEps = episodes.filter(e => e.show_slug === slug);

    if (seasonNum != null) {
      // Render one season's episodes
      const sEps = allShowEps
        .filter(e => e.season === Number(seasonNum))
        .sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0));
      document.getElementById('view').innerHTML = `
        <div class="show-hero">
          <p style="font-size:12px;color:var(--ink-whisper);margin-bottom:4px;">${esc(name)}</p>
          <h1 class="show-hero__title">Season ${seasonNum}</h1>
          <p class="show-hero__meta">${sEps.length} episode${sEps.length !== 1 ? 's' : ''}</p>
        </div>
        ${sEps.map(ep => epHTML(ep, '')).join('')}
      `;
    } else {
      // Show overview: list seasons
      const total = allShowEps.length;
      document.getElementById('view').innerHTML = `
        <div class="show-hero">
          <h1 class="show-hero__title">${esc(name)}</h1>
          <p class="show-hero__meta">${total.toLocaleString()} episode${total !== 1 ? 's' : ''}
            · ${seasons.length} season${seasons.length !== 1 ? 's' : ''}</p>
        </div>
        ${seasons.map(s => {
          const cnt = allShowEps.filter(e => e.season === s).length;
          return `<div class="season-row" data-slug="${esc(slug)}" data-season="${s}" role="button" tabindex="0">
            <div class="season-num">${s}</div>
            <div class="season-info">
              <div class="season-title">Season ${s}</div>
              <div class="season-count">${cnt} episode${cnt !== 1 ? 's' : ''}</div>
            </div>
            <span class="season-chevron" aria-hidden="true">›</span>
          </div>`;
        }).join('')}
      `;
      document.querySelectorAll('.season-row').forEach(row => {
        const handler = () => navigate('/show/' + row.dataset.slug + '/s' + row.dataset.season);
        row.addEventListener('click', handler);
        row.addEventListener('keydown', e => { if (e.key === 'Enter') handler(); });
      });
    }

    // Wire episode rows and cards in season/show view
    document.querySelectorAll('.ep-row, .ep-card').forEach(el => {
      el.addEventListener('click', () => navigate('/episode/' + el.dataset.id));
    });
    document.querySelectorAll('.ep-card__img').forEach(img => {
      if (img.complete && img.naturalWidth > 0) img.classList.add('loaded');
    });
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * RANDOM VIEW
   * ─────────────────────────────────────────────────────────────────────────── */
  function navigateRandom() {
    const pool = episodes.filter(e => e.confidence === 'confirmed' || e.confidence === 'partial');
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) navigate('/episode/' + pick.id);
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * GUESTS VIEW
   * ─────────────────────────────────────────────────────────────────────────── */

  // Build guest index from in-memory episodes (no extra API call needed)
  function buildGuestIndex() {
    const map = new Map(); // name → { count, shows: Set<slug> }
    for (const ep of episodes) {
      for (const name of (ep.guests || [])) {
        if (!name) continue;
        if (!map.has(name)) map.set(name, { count: 0, shows: new Set() });
        const g = map.get(name);
        g.count++;
        g.shows.add(ep.show_slug);
      }
    }
    return Array.from(map.entries())
      .map(([name, g]) => ({ name, count: g.count, shows: Array.from(g.shows).sort() }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  let guestIndex = null; // cached after first build

  let guestFilter = '';  // live filter within the guests view

  function guestRowHTML(g) {
    const badges = g.shows.map(s => {
      const show = SHOWS[s];
      const style = show ? `background:${show.bg};color:${show.fg};` : 'background:#E0D9C8;color:#5C544A;';
      return `<span class="ep-badge" style="${style}font-size:9px;padding:1px 5px;">${esc(show?.short || s.slice(0,7).toUpperCase())}</span>`;
    }).join('');
    return `<div class="ep-row" style="cursor:pointer;" onclick="setQueryAndGo('${esc(g.name.replace(/'/g, "\\'"))}')" role="button" tabindex="0" aria-label="Search ${esc(g.name)}">
      <div class="ep-num">
        <span class="ep-num__episode" style="font-size:1.4rem;">${g.count}</span>
      </div>
      <div class="ep-body">
        <div class="ep-title" style="font-size:15px;">${hl(g.name, guestFilter)}</div>
        <div class="ep-pills" style="margin-top:4px;">${badges}</div>
      </div>
    </div>`;
  }

  function renderGuests() {
    if (!guestIndex) guestIndex = buildGuestIndex();

    const q = guestFilter.trim().toLowerCase();
    const filtered = q
      ? guestIndex.filter(g => g.name.toLowerCase().includes(q))
      : guestIndex;

    const recurring  = filtered.filter(g => g.count >= 3);
    const multi      = filtered.filter(g => g.count === 2);
    const single     = filtered.filter(g => g.count === 1);

    // A-Z for single-appearance guests
    const alpha = {};
    for (const g of single) {
      const l = g.name.charAt(0).toUpperCase();
      (alpha[l] = alpha[l] || []).push(g);
    }
    const letters = Object.keys(alpha).sort();

    const alphaHTML = letters.map(l =>
      `<div style="margin-bottom:var(--space-3);">
         <p style="font-family:var(--font-display);font-size:2rem;line-height:1;color:var(--ink-whisper);padding:var(--space-2) 16px 0;">${esc(l)}</p>
         ${alpha[l].map(guestRowHTML).join('')}
       </div>`
    ).join('');

    document.getElementById('view').innerHTML = `
      <div style="padding:16px 16px 0;">
        <p style="font-family:var(--font-display);font-size:var(--size-display);line-height:1.1;margin-bottom:8px;">Who was there.</p>
        <p style="font-size:12px;color:var(--ink-whisper);margin-bottom:12px;">${filtered.length} of ${guestIndex.length} guests · tap any name to search their episodes</p>

        <div class="search-input" style="margin-bottom:0;">
          <svg width="16" height="16" viewBox="0 0 17 17" fill="none" aria-hidden="true">
            <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" stroke-width="1.5"/>
            <line x1="12" y1="12" x2="16" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input id="guest-q" type="search" placeholder="Filter guests…"
            autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
            value="${esc(guestFilter)}" inputmode="search">
          <button class="search-clear ${guestFilter ? 'visible' : ''}" id="clear-gq" aria-label="Clear">×</button>
        </div>
      </div>

      ${recurring.length > 0 ? `
        <div class="section-hd" style="margin-top:var(--space-3);">RECURRING <span class="section-hd__count">${recurring.length}</span></div>
        ${recurring.map(guestRowHTML).join('')}
      ` : ''}

      ${multi.length > 0 ? `
        <div class="section-hd">APPEARED TWICE <span class="section-hd__count">${multi.length}</span></div>
        ${multi.map(guestRowHTML).join('')}
      ` : ''}

      ${single.length > 0 ? `
        <div class="section-hd">ONCE <span class="section-hd__count">${single.length}</span></div>
        ${alphaHTML}
      ` : ''}

      ${filtered.length === 0 ? `
        <div class="state-empty">
          <p class="state-empty__title">No guests match</p>
          <p class="state-empty__sub">Try a different name.</p>
        </div>
      ` : ''}
    `;

    // Wire filter input
    const qi = document.getElementById('guest-q');
    let deb = 0;
    qi?.addEventListener('input', e => {
      clearTimeout(deb);
      deb = setTimeout(() => {
        guestFilter = e.target.value;
        renderGuests();
        document.getElementById('guest-q')?.focus();
      }, 120);
    });
    document.getElementById('clear-gq')?.addEventListener('click', () => {
      guestFilter = '';
      renderGuests();
      document.getElementById('guest-q')?.focus();
    });

    // Wire row keyboard nav
    document.querySelectorAll('.ep-row[role="button"]').forEach(row => {
      row.addEventListener('keydown', e => { if (e.key === 'Enter') row.click(); });
    });
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * ABOUT VIEW
   * ─────────────────────────────────────────────────────────────────────────── */
  function renderAbout() {
    const total = episodes ? episodes.length.toLocaleString() : '—';
    document.getElementById('view').innerHTML = `
      <div class="about-body">
        <h2>What is this?</h2>
        <p>A complete episode index for Martha Stewart's television work — ${total} episodes across twelve programs, 1986 to now. Search by ingredient, guest, holiday, or place. It is a good thing.</p>

        <h2>Sources</h2>
        <p>Episode data compiled from TheTVDB, IMDb, TV Guide, Yidio, Wikipedia, and marthastewart.tv. Photographs courtesy of marthastewart.tv (Vimeo OTT). Hallmark-era episodes (Seasons 10–11, 2002–2004) recovered from the marthastewart.tv streaming archive in May 2026.</p>

        <h2>Design</h2>
        <p>Typography: Cormorant Garamond (display) and Libre Caslon Text (body), self-hosted from Google Fonts. Palette drawn from <em>Martha Stewart Living</em>, 1990–1999, art-directed by Gael Towey. The design prefers restraint: no gradients, no shadows, no rounded corners greater than 10px on this page.</p>

        <h2>Confidence</h2>
        <p>Each episode carries a confidence label: <em>confirmed</em> means a reliable primary source; <em>partial</em> means a date placeholder; <em>inferred</em> means an educated guess. About 38% of episodes are confirmed.</p>

        <h2>Archive</h2>
        <p>Desktop version and full archive: <a href="https://martha.fly.dev" target="_blank">martha.fly.dev</a></p>

        <p style="margin-top:32px;font-size:13px;color:var(--ink-whisper);">
          Built May 2026 · It is a good thing.
        </p>
      </div>
    `;
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * TOP BAR
   * ─────────────────────────────────────────────────────────────────────────── */
  function updateTopBar(path) {
    const topBar = document.getElementById('top-bar');
    if (!topBar) return;
    const isHome = path === '/' || path === '';

    topBar.innerHTML = isHome
      ? `<span class="top-bar__wordmark">Martha Episodes</span>
         <div class="top-bar__right">
           <button class="top-bar__filter-btn" aria-label="Filter" onclick="document.getElementById('sel-show')?.focus()">
             <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
               <path d="M2 4h14M4 9h10M7 14h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
             </svg>
           </button>
         </div>`
      : `<button class="top-bar__back" onclick="history.back()" aria-label="Go back">
           <svg width="10" height="18" viewBox="0 0 10 18" fill="none" aria-hidden="true">
             <path d="M9 1L1 9l8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
           </svg>
           Back
         </button>
         <span class="top-bar__wordmark" style="font-size:13px;letter-spacing:0.1em;">Martha Episodes</span>
         <div class="top-bar__right"></div>`;
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * TAB BAR
   * ─────────────────────────────────────────────────────────────────────────── */
  function updateTabBar(path) {
    const tabs = document.querySelectorAll('.tab-bar__item');
    tabs.forEach(t => t.classList.remove('active'));
    if (path === '/' || path === '')          tabs[0]?.classList.add('active');
    else if (path.startsWith('/guests'))      tabs[1]?.classList.add('active');
    else if (path.startsWith('/random'))      tabs[2]?.classList.add('active');
    else if (path.startsWith('/about'))       tabs[3]?.classList.add('active');
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * ROUTER
   * ─────────────────────────────────────────────────────────────────────────── */
  function parsePath(url) {
    const u = new URL(url, window.location.origin);
    // Strip /m prefix
    let path = u.pathname.replace(/^\/m/, '') || '/';
    if (!path.startsWith('/')) path = '/' + path;
    return { path, search: u.searchParams };
  }

  function route(url) {
    const { path, search } = parsePath(url);
    updateTopBar(path);
    updateTabBar(path);

    // Restore home state from URL params
    if (path === '/' || path === '') {
      query        = search.get('q') || '';
      filterShow   = search.get('show') || 'martha-stewart-living'; // default to the OG
      filterYear   = search.get('year') || '';
      filterSeason = search.get('season') || '';
      renderHome();
      document.getElementById('view')?.scrollTo(0, 0);
      return;
    }

    // Episode detail
    const epM = path.match(/^\/episode\/(.+)$/);
    if (epM) {
      renderEpisodeDetail(decodeURIComponent(epM[1]));
      document.getElementById('view')?.scrollTo(0, 0);
      return;
    }

    // Show season: /show/:slug/s:n
    const seasonM = path.match(/^\/show\/([^/]+)\/s(\d+)$/);
    if (seasonM) {
      renderShow(decodeURIComponent(seasonM[1]), Number(seasonM[2]));
      document.getElementById('view')?.scrollTo(0, 0);
      return;
    }

    // Show overview
    const showM = path.match(/^\/show\/([^/]+)$/);
    if (showM) {
      renderShow(decodeURIComponent(showM[1]), null);
      document.getElementById('view')?.scrollTo(0, 0);
      return;
    }

    // Guests
    if (path === '/guests') {
      renderGuests();
      document.getElementById('view')?.scrollTo(0, 0);
      return;
    }

    // Random
    if (path === '/random') { navigateRandom(); return; }

    // About
    if (path === '/about') {
      renderAbout();
      document.getElementById('view')?.scrollTo(0, 0);
      return;
    }

    // Fallback to home
    navigate('/');
  }

  function navigate(path) {
    const url = '/m' + path;
    history.pushState({}, '', url);
    route(url);
  }

  // Expose helpers for inline onclick handlers
  window.navigate = navigate;
  window.setQueryAndGo = function(q) {
    query = q;
    navigate('/');
    // After re-render, focus input
    setTimeout(() => document.getElementById('q')?.focus(), 50);
  };

  /* ───────────────────────────────────────────────────────────────────────────
   * SHELL HTML
   * ─────────────────────────────────────────────────────────────────────────── */
  function buildShell() {
    document.getElementById('app').innerHTML = `
      <div id="top-bar" class="top-bar" role="banner"></div>

      <div id="view" class="view" role="main"></div>

      <nav class="tab-bar" role="navigation" aria-label="Main navigation">
        <button class="tab-bar__item active" onclick="navigate('/')" aria-label="Home">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <!-- Chimney — set slightly right of center, classic colonial -->
            <rect x="13.5" y="1.5" width="2.5" height="5" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
            <!-- Roof with gentle pitch and eave line -->
            <polyline points="1,11 11,3 21,11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="2" y1="11" x2="20" y2="11" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
            <!-- House walls -->
            <rect x="3" y="11" width="16" height="9.5" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
            <!-- Door with arched top — centered -->
            <path d="M9.5 20.5V16C9.5 15.2 10 14.8 11 14.8S12.5 15.2 12.5 16V20.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            <!-- Left window — divided panes (mullion) -->
            <rect x="4.5" y="13" width="3" height="3" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
            <line x1="6" y1="13" x2="6" y2="16" stroke="currentColor" stroke-width="0.8"/>
            <line x1="4.5" y1="14.5" x2="7.5" y2="14.5" stroke="currentColor" stroke-width="0.8"/>
            <!-- Right window — divided panes (mullion) -->
            <rect x="14.5" y="13" width="3" height="3" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
            <line x1="16" y1="13" x2="16" y2="16" stroke="currentColor" stroke-width="0.8"/>
            <line x1="14.5" y1="14.5" x2="17.5" y2="14.5" stroke="currentColor" stroke-width="0.8"/>
          </svg>
          Home
        </button>
        <button class="tab-bar__item" onclick="navigate('/guests')" aria-label="Guest index">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <circle cx="11" cy="8" r="4" stroke="currentColor" stroke-width="1.6"/>
            <path d="M3 20c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
          Guests
        </button>
        <button class="tab-bar__item" onclick="navigate('/random')" aria-label="Random episode">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="9" stroke="currentColor" stroke-width="1.6"/>
            <circle cx="11" cy="11" r="2" fill="currentColor"/>
            <circle cx="7"  cy="8"  r="1.2" fill="currentColor"/>
            <circle cx="15" cy="8"  r="1.2" fill="currentColor"/>
            <circle cx="7"  cy="14" r="1.2" fill="currentColor"/>
            <circle cx="15" cy="14" r="1.2" fill="currentColor"/>
          </svg>
          Random
        </button>
        <button class="tab-bar__item" onclick="navigate('/about')" aria-label="About">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="9" stroke="currentColor" stroke-width="1.6"/>
            <line x1="11" y1="10" x2="11" y2="16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <circle cx="11" cy="7" r="1.1" fill="currentColor"/>
          </svg>
          About
        </button>
      </nav>
    `;
  }

  /* ───────────────────────────────────────────────────────────────────────────
   * INIT
   * ─────────────────────────────────────────────────────────────────────────── */
  async function init() {
    buildShell();
    document.getElementById('view').innerHTML =
      '<div class="state-loading">Loading…</div>';

    window.addEventListener('popstate', () => route(window.location.href));

    try {
      await loadEpisodes();
      route(window.location.href);
    } catch (err) {
      console.error(err);
      document.getElementById('view').innerHTML = `
        <div class="state-empty">
          <p class="state-empty__title">Could not load episodes</p>
          <p class="state-empty__sub">Please try refreshing the page.</p>
        </div>`;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
