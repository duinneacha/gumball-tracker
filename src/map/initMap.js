// Leaflet map initialisation.
// Kept minimal to respect the PRD's guidance to avoid heavy SDK ecosystems.
// Default marker icons are wired for Vite so L.marker() resolves image URLs.

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export function initMap(container) {
  // Defensive: clear any previous contents.
  container.innerHTML = "";

  const map = L.map(container, {
    center: [53.4, -8], // Centre of Ireland
    zoom: 8,
    tap: false, // custom touch handlers in mapController.js handle tap detection
  });

  // Basic tile layer; can be swapped later if needed.
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  return map;
}

