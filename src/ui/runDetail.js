/**
 * Run Detail panel (PRD V2.8): summary of a past run with mini map and missed locations.
 * Renders into a host container; creates a Leaflet map that is destroyed on close.
 */

import L from "leaflet";
import "leaflet/dist/leaflet.css";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatDateLong(isoString) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDuration(minutes) {
  if (minutes == null || typeof minutes !== "number") return "";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const VISITED_COLOR = "#10b981";
const MISSED_COLOR = "#ef4444";

/**
 * Create the Run Detail panel.
 * @param {HTMLElement} host - Container to render into
 * @param {object} options
 * @param {{ runId: string, runName: string, completedAt: string, visitedCount: number, totalCount: number, durationMinutes?: number }} options.completion - Run completion record
 * @param {Array<{ id: string, latitude: number, longitude: number, name?: string }>} options.locations - All locations in the run
 * @param {Set<string>} options.visitedLocationIds - IDs of visited locations
 * @param {() => void} options.onClose - Close panel, return to history
 * @returns {{ destroy: () => void }}
 */
export function createRunDetailPanel(host, options) {
  const { completion, locations = [], visitedLocationIds = new Set(), onClose } = options;
  let panelEl = null;
  let map = null;

  const visitedSet =
    visitedLocationIds instanceof Set
      ? visitedLocationIds
      : new Set(Array.isArray(visitedLocationIds) ? visitedLocationIds : []);

  const missedLocations = locations.filter((loc) => !visitedSet.has(loc.id));
  const durationStr = formatDuration(completion?.durationMinutes);

  function initMap(container) {
    if (!container) return null;
    container.innerHTML = "";
    const m = L.map(container, {
      center: [53.4, -8],
      zoom: 8,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(m);

    const group = L.featureGroup();
    for (const loc of locations) {
      const isVisited = visitedSet.has(loc.id);
      const color = isVisited ? VISITED_COLOR : MISSED_COLOR;
      const marker = L.circleMarker([loc.latitude, loc.longitude], {
        radius: 6,
        weight: 2,
        fillColor: color,
        color: isVisited ? "#059669" : "#dc2626",
        fillOpacity: 0.9,
      });
      group.addLayer(marker);
    }
    group.addTo(m);
    if (group.getLayers().length > 0) {
      m.fitBounds(group.getBounds(), { padding: [20, 20], maxZoom: 14 });
    }
    return m;
  }

  function init() {
    panelEl = document.createElement("div");
    panelEl.className = "run-detail-panel";
    panelEl.innerHTML = `
      <div class="run-detail-header">
        <h2 class="run-detail-title">Run Detail</h2>
        <button type="button" class="run-detail-close" aria-label="Close">×</button>
      </div>
      <div class="run-detail-content">
        <h3 class="run-detail-run-name">${escapeHtml(completion?.runName ?? completion?.runId ?? "—")}</h3>
        <p class="run-detail-date">${escapeHtml(formatDateLong(completion?.completedAt))}</p>
        ${durationStr ? `<p class="run-detail-duration">${escapeHtml(durationStr)}</p>` : ""}
        <p class="run-detail-count">${completion?.visitedCount ?? 0} / ${completion?.totalCount ?? 0} visited</p>
        <div class="run-detail-map-wrap" role="img" aria-label="Map of run locations"></div>
        ${
          missedLocations.length > 0
            ? `
          <h4 class="run-detail-missed-title">Missed locations</h4>
          <ul class="run-detail-missed-list"></ul>
        `
            : ""
        }
      </div>
    `;

    panelEl.querySelector(".run-detail-close").addEventListener("click", () => {
      if (typeof onClose === "function") onClose();
    });

    if (missedLocations.length > 0) {
      const ul = panelEl.querySelector(".run-detail-missed-list");
      missedLocations.forEach((loc) => {
        const li = document.createElement("li");
        li.className = "run-detail-missed-item";
        li.textContent = loc.name ?? loc.id ?? "—";
        ul.appendChild(li);
      });
    }

    host.innerHTML = "";
    host.appendChild(panelEl);
    host.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => panelEl.classList.add("open"));

    const mapWrap = panelEl.querySelector(".run-detail-map-wrap");
    if (mapWrap && locations.length > 0) {
      requestAnimationFrame(() => {
        map = initMap(mapWrap);
      });
    }
  }

  function destroy() {
    if (map) {
      map.remove();
      map = null;
    }
    if (host) host.setAttribute("aria-hidden", "true");
    if (panelEl?.parentNode) {
      panelEl.classList.remove("open");
      panelEl.addEventListener("transitionend", () => panelEl?.remove(), { once: true });
    }
    host.innerHTML = "";
  }

  init();

  return {
    destroy,
  };
}
