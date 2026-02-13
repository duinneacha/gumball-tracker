// Map controller wraps Leaflet initialisation and basic marker handling.
// For V1 scaffolding we focus on initialising the map and keeping a clean API
// for later location/run wiring.

import L from "leaflet";
import { initMap } from "./initMap.js";

export function createMapController(container, initialState) {
  const map = initMap(container);
  const onLocationSelected = initialState.onLocationSelected;

  const state = {
    mode: initialState.mode,
    selectedRunId: initialState.selectedRunId,
  };

  const locationsLayer = L.layerGroup();
  let hasFittedBounds = false;

  function setMode(mode) {
    state.mode = mode;
    // In future, adjust visible layers/interaction based on mode.
  }

  function setRun(runId) {
    state.selectedRunId = runId;
    // In future, filter markers by run here.
  }

  /**
   * Render location markers. Clears existing markers, then adds one marker per
   * location (active, or deleted when showDeleted is true). Fits map bounds
   * to markers on first render.
   * @param {Array<{ id: string, latitude: number, longitude: number, status: string }>} locations
   * @param {{ showDeleted?: boolean }} [opts]
   */
  function renderLocations(locations, opts = {}) {
    const showDeleted = opts.showDeleted === true;

    locationsLayer.clearLayers();

    const visible = Array.isArray(locations)
      ? locations.filter(
          (loc) => loc.status === "active" || (showDeleted && loc.status === "deleted")
        )
      : [];

    for (const loc of visible) {
      const marker = L.marker([loc.latitude, loc.longitude]);
      marker.on("click", () => {
        if (typeof onLocationSelected === "function") {
          onLocationSelected(loc);
        }
      });
      locationsLayer.addLayer(marker);
    }

    if (!map.hasLayer(locationsLayer)) {
      locationsLayer.addTo(map);
    }

    if (visible.length > 0 && !hasFittedBounds) {
      map.fitBounds(locationsLayer.getBounds(), { padding: [24, 24], maxZoom: 14 });
      hasFittedBounds = true;
    }
  }

  return {
    setMode,
    setRun,
    renderLocations,
    getLeafletMap() {
      return map;
    },
  };
}

