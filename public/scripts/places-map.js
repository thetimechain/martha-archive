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

  const isTouch = matchMedia("(hover: none) and (pointer: coarse)").matches;
  const placeCache = new Map(); // slug -> { name, kind, role, episodes }

  const map = L.map(mapEl, {
    center: [40.0, -85.0],
    zoom: 4,
    scrollWheelZoom: isTouch,
    tap: true,
    zoomControl: true,
    attributionControl: false,
  });

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 18,
      subdomains: "abcd",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }
  ).addTo(map);

  const markers = [];
  for (const p of points) {
    const icon = L.divIcon({
      className: "atlas-pin",
      html:
        '<span class="atlas-pin__dot" data-kind="' + escapeAttr(p.kind) + '"></span>' +
        '<span class="atlas-pin__label">' + escapeHtml(p.name) + "</span>",
      iconSize: [120, 36],
      iconAnchor: [60, 18],
    });
    const marker = L.marker([p.lat, p.lng], { icon, riseOnHover: true });
    marker._slug = p.slug;
    marker._kind = p.kind;
    marker._name = p.name;
    marker.on("click", function () { openSheet(p); });
    marker.addTo(map);
    markers.push(marker);
  }

  if (markers.length > 0) {
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds(), { padding: [50, 50] });
  }

  // Desktop-only courtesy: enable scroll zoom only when the map has focus.
  if (!isTouch) {
    mapEl.addEventListener("click", function () { map.scrollWheelZoom.enable(); });
    map.on("mouseout", function () { map.scrollWheelZoom.disable(); });
  }

  // ── Filter chips ────────────────────────────────────────────────────────
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
    });
  });

  // ── Bottom sheet (pin tap → drawer) ────────────────────────────────────
  function openSheet(p) {
    sheetEl.setAttribute("aria-hidden", "false");
    sheetEl.classList.add("is-open");
    sheetBody.innerHTML = renderSkeleton(p);

    if (placeCache.has(p.slug)) {
      sheetBody.innerHTML = renderSheet(placeCache.get(p.slug), p);
      return;
    }

    fetch("/api/places/" + encodeURIComponent(p.slug))
      .then(function (r) {
        if (!r.ok) throw new Error("not ok");
        return r.json();
      })
      .then(function (data) {
        placeCache.set(p.slug, data);
        if (sheetEl.classList.contains("is-open")) {
          sheetBody.innerHTML = renderSheet(data, p);
        }
      })
      .catch(function () {
        sheetBody.innerHTML = renderSheet({ ...p, episodes: [] }, p);
      });
  }

  function closeSheet() {
    sheetEl.classList.remove("is-open");
    sheetEl.setAttribute("aria-hidden", "true");
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

    let episodesHTML = "";
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
