// /places/map — illustrated atlas of Martha-orbit places.
// Renders Leaflet on top of CARTO Positron tiles, with a heavy sepia/parchment
// CSS filter to give the basemap a vintage-illustrated feel. Markers are
// styled with italic-serif labels matching the rest of the site.

(function () {
  "use strict";

  const dataEl = document.getElementById("atlas-data");
  const mapEl = document.getElementById("atlas-map");
  if (!dataEl || !mapEl || typeof L === "undefined") return;

  let points;
  try {
    points = JSON.parse(dataEl.textContent || "[]");
  } catch (e) {
    return;
  }
  if (!Array.isArray(points) || points.length === 0) return;

  // Touch devices don't have scroll wheels, so the click-to-enable
  // courtesy doesn't apply — let pinch + drag work immediately.
  const isTouch = matchMedia("(hover: none) and (pointer: coarse)").matches;

  // Set up the map. fitBounds() will frame all pins after we add them.
  const map = L.map(mapEl, {
    center: [40.0, -85.0],
    zoom: 4,
    scrollWheelZoom: isTouch ? true : false,
    tap: true,
    zoomControl: true,
    attributionControl: false, // we render our own caption beneath the map
  });

  // CARTO Positron — neutral basemap; the CSS filter on .leaflet-tile-pane
  // re-tints it parchment/sepia for the Martha aesthetic.
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 18,
      subdomains: "abcd",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }
  ).addTo(map);

  // Build markers. Each pin is a small terracotta dot with a label below.
  const markers = [];
  const byKind = {};
  for (const p of points) {
    const icon = L.divIcon({
      className: "atlas-pin",
      html:
        '<span class="atlas-pin__dot" data-kind="' + escapeAttr(p.kind) + '"></span>' +
        '<span class="atlas-pin__label">' + escapeHtml(p.name) + "</span>",
      iconSize: [120, 36],
      iconAnchor: [60, 18], // center horizontally; vertical center on the dot row
    });
    const marker = L.marker([p.lat, p.lng], { icon, riseOnHover: true });
    marker.bindPopup(buildPopup(p), { className: "atlas-popup", closeButton: true, maxWidth: 280 });
    marker.addTo(map);
    marker._kind = p.kind;
    markers.push(marker);
    byKind[p.kind] = (byKind[p.kind] || 0) + 1;
  }

  // Fit to data on first render.
  if (markers.length > 0) {
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds(), { padding: [40, 40] });
  }

  // Kind-filter chips: ".atlas-chip[data-kind]".
  const chips = document.querySelectorAll(".atlas-chip[data-kind]");
  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      const want = chip.getAttribute("data-kind");
      chips.forEach(function (c) { c.classList.toggle("is-active", c === chip); });
      markers.forEach(function (m) {
        const show = want === "all" || m._kind === want;
        if (show) m.addTo(map); else map.removeLayer(m);
      });
    });
  });

  // Desktop courtesy: enable scroll-zoom only when the map is clicked,
  // disable on mouseout so page scroll isn't hijacked.
  if (!isTouch) {
    mapEl.addEventListener("click", function () { map.scrollWheelZoom.enable(); });
    map.on("mouseout", function () { map.scrollWheelZoom.disable(); });
  }

  // ─── helpers ──────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }
  function buildPopup(p) {
    const role = p.role ? '<p class="atlas-popup__role">' + escapeHtml(p.role) + "</p>" : "";
    const mentions = p.mentions
      ? '<span class="atlas-popup__mentions">' + p.mentions + " appearance" + (p.mentions === 1 ? "" : "s") + "</span>"
      : "";
    return (
      '<div class="atlas-popup__inner">' +
        '<p class="atlas-popup__eyebrow">' + escapeHtml(p.kind || "place") + "</p>" +
        '<h3 class="atlas-popup__name">' + escapeHtml(p.name) + "</h3>" +
        role +
        '<p class="atlas-popup__footer">' +
          mentions +
          '<a class="atlas-popup__link" href="/places/' + escapeAttr(p.slug) + '">Full entry →</a>' +
        "</p>" +
      "</div>"
    );
  }
})();
