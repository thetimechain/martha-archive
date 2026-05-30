// /places/map — fullscreen vintage atlas.
//
// Mobile-first: map is locked to the viewport between an app bar (top)
// and a chip strip (bottom). Tapping a pin lazy-fetches /api/places/:slug
// and slides up a bottom sheet with the bio + recent episode list.

(function () {
  "use strict";

  const dataEl  = document.getElementById("atlas-data");
  const mapEl   = document.getElementById("atlas-map");
  const sheetEl = document.getElementById("atlas-sheet");
  const sheetBody = document.getElementById("atlas-sheet-body");
  if (!dataEl || !mapEl || typeof L === "undefined") return;

  let points;
  try { points = JSON.parse(dataEl.textContent || "[]"); } catch (e) { return; }
  if (!Array.isArray(points) || points.length === 0) return;

  // Finding #15: make isTouch reactive to device-state changes (e.g. plugging
  // in a mouse on a tablet). mq.matches provides the initial value; the
  // change listener keeps it up-to-date and updates scroll-wheel behavior.
  const mq = matchMedia("(hover: none) and (pointer: coarse)");
  let isTouch = mq.matches;

  // Finding #9: LRU cache — Map preserves insertion order, so the first key
  // is always the oldest entry.
  const CACHE_MAX = 30;
  const placeCache = new Map(); // slug -> { name, kind, role, episodes }
  function cacheSet(key, value) {
    if (placeCache.has(key)) {
      // Key already present: delete and re-insert to refresh LRU position.
      // This also prevents a double-evict when updating an existing key at
      // capacity (FIFO evict + no-op set would shrink the cache by one).
      placeCache.delete(key);
    } else if (placeCache.size >= CACHE_MAX) {
      const oldest = placeCache.keys().next().value;
      if (oldest !== undefined) placeCache.delete(oldest);
    }
    placeCache.set(key, value);
  }

  // Finding #1: track the active slug so stale fetch responses are ignored.
  let currentOpenSlug = null;
  let currentAbort = null;

  const map = L.map(mapEl, {
    center: [40.0, -85.0],
    zoom: 4,
    scrollWheelZoom: isTouch,
    tap: true,
    zoomControl: true,
    attributionControl: false,
  });

  // Two-layer CARTO basemap (no auth required, free for non-commercial):
  // 1) Voyager nolabels — colored basemap (green parks, blue water).
  // 2) Voyager labels-only overlay — subtle gray place names on top so the
  //    user can navigate without crowding pin labels.
  // The painted/atlas feel comes from the CSS layer: heavy filter + paper-
  // grain SVG overlay + compass rose. Far more reliable than depending on
  // Stadia's auth-gated watercolor tiles.
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 18,
      subdomains: "abcd",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }
  ).addTo(map);

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 18,
      subdomains: "abcd",
      opacity: 0.7,
    }
  ).addTo(map);

  // Zoom-aware label visibility: at < 7 the labels overlap into chaos,
  // especially around NYC where ~30 pins crowd one square mile. Hide the
  // labels at low zoom; show them on individual pin hover/active.
  const atlasEl = document.querySelector(".atlas");
  function applyZoomState() {
    const zoomedOut = map.getZoom() < 7;
    if (atlasEl) atlasEl.classList.toggle("atlas--zoomed-out", zoomedOut);
  }
  map.on("zoomend", applyZoomState);

  let activeMarker = null;
  const markers = [];
  for (const p of points) {
    const icon = L.divIcon({
      className: "atlas-pin",
      html:
        '<span class="atlas-pin__hit" aria-hidden="true"></span>' +
        '<span class="atlas-pin__dot" data-kind="' + escapeAttr(p.kind) + '"></span>' +
        '<span class="atlas-pin__label">' + escapeHtml(p.name) + "</span>",
      iconSize: [120, 44],
      iconAnchor: [60, 22],
    });
    const marker = L.marker([p.lat, p.lng], { icon, riseOnHover: true });
    marker._slug = p.slug;
    marker._kind = p.kind;
    marker._name = p.name;
    marker._point = p;
    marker.on("click", function (ev) {
      // Stop the click from bubbling up to map click (which closes the sheet).
      if (ev && ev.originalEvent) L.DomEvent.stopPropagation(ev.originalEvent);
      setActiveMarker(marker);
      openSheet(p);
    });
    marker.addTo(map);
    markers.push(marker);
  }

  function setActiveMarker(m) {
    if (activeMarker && activeMarker !== m) {
      const el = activeMarker.getElement();
      if (el) el.classList.remove("atlas-pin--active");
    }
    activeMarker = m;
    if (m) {
      const el = m.getElement();
      if (el) el.classList.add("atlas-pin--active");
    }
  }
  function clearActiveMarker() { setActiveMarker(null); }

  if (markers.length > 0) {
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds(), { padding: [50, 50] });
  }
  // Apply initial zoom state now. zoomend will also fire after fitBounds
  // animates — and handles all subsequent zoom changes — but we call this
  // once here so the state is correct before any animation completes.
  applyZoomState();

  // Desktop-only courtesy: enable scroll zoom only when the map has focus.
  // Always attach both listeners so they are present if the device mode changes
  // (e.g. tablet + mouse plug-in). The isTouch check happens at call time,
  // not at boot time, so they correctly reflect the current pointer mode.
  mapEl.addEventListener("click", function () {
    if (!isTouch) map.scrollWheelZoom.enable();
  });
  map.on("mouseout", function () {
    if (!isTouch) map.scrollWheelZoom.disable();
  });

  // Finding #15: respond to pointer-type changes (e.g. tablet + mouse plug-in).
  // Reset scroll-wheel zoom to the correct default for the new pointer mode.
  mq.addEventListener("change", function (e) {
    isTouch = e.matches;
    if (isTouch) {
      map.scrollWheelZoom.enable();   // touch: always on (no scroll wheel anyway)
    } else {
      map.scrollWheelZoom.disable();  // desktop: off by default, click to enable
    }
  });

  // ── Filter chips ────────────────────────────────────────────────────────
  const chipRail = document.querySelector(".atlas-chips");
  const chips = document.querySelectorAll(".atlas-chip[data-kind]");
  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      const want = chip.getAttribute("data-kind");
      chips.forEach(function (c) { c.classList.toggle("is-active", c === chip); });
      markers.forEach(function (m) {
        const show = want === "all" || m._kind === want;
        if (show) m.addTo(map); else map.removeLayer(m);
      });
      closeSheet();
      // Center the chip in the horizontally-scrolling rail. If "All" was
      // tapped, scroll all the way back to the start.
      if (chipRail) {
        if (want === "all") {
          chipRail.scrollTo({ left: 0, behavior: "smooth" });
        } else {
          try { chip.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); }
          catch (_) { /* old browsers */ }
        }
      }
    });
  });

  // ── Bottom sheet (pin tap → drawer) ────────────────────────────────────
  function openSheet(p) {
    // Finding #1: abort any in-flight fetch from a previous pin tap so a slow
    // response for Pin A cannot overwrite the sheet that is now showing Pin B.
    if (currentAbort) currentAbort.abort();
    currentAbort = new AbortController();
    currentOpenSlug = p.slug;

    sheetEl.setAttribute("aria-hidden", "false");
    sheetEl.classList.add("is-open");
    sheetBody.innerHTML = renderSkeleton(p);

    if (placeCache.has(p.slug)) {
      const cached = placeCache.get(p.slug);
      cacheSet(p.slug, cached); // refresh LRU position on cache hit
      sheetBody.innerHTML = renderSheet(cached, p);
      return;
    }

    fetch("/api/places/" + encodeURIComponent(p.slug), { signal: currentAbort.signal })
      .then(function (r) {
        if (!r.ok) throw new Error("not ok");
        return r.json();
      })
      .then(function (data) {
        // Finding #9: use LRU cacheSet instead of bare Map.set.
        cacheSet(p.slug, data);
        // Finding #1: only render if this response is still the active pin.
        if (currentOpenSlug === p.slug && sheetEl.classList.contains("is-open")) {
          sheetBody.innerHTML = renderSheet(data, p);
        }
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return; // stale fetch — ignore
        if (currentOpenSlug === p.slug && sheetEl.classList.contains("is-open")) {
          sheetBody.innerHTML = renderSheet({ ...p, episodes: [] }, p);
        }
      });
  }

  function closeSheet() {
    sheetEl.classList.remove("is-open");
    sheetEl.setAttribute("aria-hidden", "true");
    currentOpenSlug = null; // Finding #1: no pin is open
    clearActiveMarker();
  }

  sheetEl.querySelector(".atlas-sheet__close").addEventListener("click", closeSheet);

  // Tap on map (outside any pin) closes the sheet.
  map.on("click", function () { closeSheet(); });

  // Escape closes the sheet.
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeSheet();
  });

  // ── Renderers ───────────────────────────────────────────────────────────
  function renderSkeleton(p) {
    return (
      '<p class="atlas-sheet__eyebrow" data-kind="' + escapeAttr(p.kind) + '">' + escapeHtml(p.kind || "place") + '</p>' +
      '<h2 class="atlas-sheet__name">' + escapeHtml(p.name) + '</h2>' +
      '<p class="atlas-sheet__loading">Loading episodes…</p>'
    );
  }

  function renderSheet(data, fallback) {
    const kind = data.kind || fallback.kind || "place";
    const name = data.name || fallback.name;
    const role = data.role || fallback.role || "";
    const eps  = data.episodes || [];

    let episodesHTML;
    if (eps.length > 0) {
      episodesHTML =
        '<p class="atlas-sheet__divider">Featured in</p>' +
        '<div class="atlas-sheet__episodes">' +
          eps.map(function (e) {
            const photo = e.photo_url
              ? '<img class="atlas-sheet__ep-photo" src="' + escapeAttr(e.photo_url) + '" alt="" loading="lazy">'
              : '<span class="atlas-sheet__ep-photo atlas-sheet__ep-photo--placeholder" aria-hidden="true"></span>';
            const meta = [
              e.show_name || "",
              e.season != null ? "S" + e.season : null,
              e.air_year || null,
            ].filter(Boolean).join(" · ");
            return (
              '<a class="atlas-sheet__ep" href="/episodes/' + escapeAttr(e.id) + '">' +
                photo +
                '<div>' +
                  '<p class="atlas-sheet__ep-title">' + escapeHtml(e.title) + '</p>' +
                  '<p class="atlas-sheet__ep-meta">' + escapeHtml(meta) + '</p>' +
                '</div>' +
              '</a>'
            );
          }).join("") +
        '</div>';
    } else {
      episodesHTML =
        '<p class="atlas-sheet__divider">Featured in</p>' +
        '<p class="atlas-sheet__empty">' +
          'A documented Martha-orbit location, but the matching episode hasn\u2019t ' +
          'been cross-referenced yet. See the full entry for the latest.' +
        '</p>';
    }

    return (
      '<p class="atlas-sheet__eyebrow" data-kind="' + escapeAttr(kind) + '">' + escapeHtml(kind) + '</p>' +
      '<h2 class="atlas-sheet__name">' + escapeHtml(name) + '</h2>' +
      (role ? '<p class="atlas-sheet__role">' + escapeHtml(role) + '</p>' : '') +
      episodesHTML +
      '<a class="atlas-sheet__cta" href="/places/' + escapeAttr(fallback.slug) + '">View full entry →</a>'
    );
  }

  // ── helpers ─────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function escapeAttr(s) { return escapeHtml(s); }
})();
