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

  const locationsLayer = L.featureGroup();
  const layerById = {};
  let hasFittedBounds = false;
  let selectedLocationId = null;

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
   * location (active, or deleted when showDeleted is true). Optionally fits
   * map bounds to markers. useCircleMarkers renders L.circleMarker (no icon assets).
   * @param {Array<{ id: string, latitude: number, longitude: number, status: string }>} locations
   * @param {{ showDeleted?: boolean, forceFitBounds?: boolean, useCircleMarkers?: boolean }} [opts]
   */
  function renderLocations(locations, opts = {}) {
    const showDeleted = opts.showDeleted === true;
    const forceFitBounds = opts.forceFitBounds === true;
    const useCircleMarkers = opts.useCircleMarkers === true;

    const inputCount = Array.isArray(locations) ? locations.length : 0;
    if (forceFitBounds) {
      hasFittedBounds = false;
    }

    locationsLayer.clearLayers();
    Object.keys(layerById).forEach((id) => delete layerById[id]);

    const visible = Array.isArray(locations)
      ? locations.filter(
          (loc) => loc.status === "active" || (showDeleted && loc.status === "deleted")
        )
      : [];

    // eslint-disable-next-line no-console
    console.log(`[map] renderLocations input=${inputCount} visible=${visible.length}`);

    const baseRadius = 6;
    const hoverRadius = 7;
    const selectedWeight = 3;
    const defaultWeight = 2;

    function applyMarkerStyle(l, id, isHovered, isSelected) {
      if (!useCircleMarkers || !l.setStyle) return;
      const radius = isHovered || isSelected ? hoverRadius : baseRadius;
      const weight = isSelected ? selectedWeight : defaultWeight;
      const fillColor = isSelected ? "#ea580c" : "#f97316";
      l.setStyle({ radius, weight, fillColor, color: "#c2410c", fillOpacity: 0.9 });
    }

    for (const loc of visible) {
      const layer = useCircleMarkers
        ? L.circleMarker([loc.latitude, loc.longitude], {
            radius: baseRadius,
            weight: defaultWeight,
            fillColor: "#f97316",
            color: "#c2410c",
            fillOpacity: 0.9,
          })
        : L.marker([loc.latitude, loc.longitude]);

      if (useCircleMarkers) {
        layer._locationId = loc.id;
        layer.on("mouseover", () => {
          applyMarkerStyle(layer, loc.id, true, loc.id === selectedLocationId);
        });
        layer.on("mouseout", () => {
          applyMarkerStyle(layer, loc.id, false, loc.id === selectedLocationId);
        });
      }

      layer.on("click", () => {
        if (useCircleMarkers) {
          applyMarkerStyle(layer, loc.id, true, true);
          setTimeout(() => {
            applyMarkerStyle(layer, loc.id, false, loc.id === selectedLocationId);
          }, 150);
        }
        if (typeof onLocationSelected === "function") {
          onLocationSelected(loc);
        }
      });

      if (useCircleMarkers) {
        layerById[loc.id] = layer;
        applyMarkerStyle(layer, loc.id, false, loc.id === selectedLocationId);
      }
      locationsLayer.addLayer(layer);
    }

    if (!map.hasLayer(locationsLayer)) {
      locationsLayer.addTo(map);
    }

    const layerCount = locationsLayer.getLayers().length;
    const layerOnMap = map.hasLayer(locationsLayer);
    // eslint-disable-next-line no-console
    console.log(`[map] layerCount=${layerCount} layerOnMap=${layerOnMap}`);

    const shouldFit = (visible.length > 0 && !hasFittedBounds) || forceFitBounds;
    if (shouldFit && locationsLayer.getLayers().length > 0) {
      map.fitBounds(locationsLayer.getBounds(), { padding: [40, 40], maxZoom: 14 });
      hasFittedBounds = true;
    }
  }

  function setSelectedLocationId(id) {
    if (selectedLocationId === id) return;
    const prev = selectedLocationId;
    selectedLocationId = id ?? null;
    const baseRadius = 6;
    const hoverRadius = 7;
    const selectedWeight = 3;
    const defaultWeight = 2;
    const updateStyle = (l, lid, selected) => {
      if (!l.setStyle) return;
      const radius = selected ? hoverRadius : baseRadius;
      const weight = selected ? selectedWeight : defaultWeight;
      const fillColor = selected ? "#ea580c" : "#f97316";
      l.setStyle({ radius, weight, fillColor, color: "#c2410c", fillOpacity: 0.9 });
    };
    if (prev && layerById[prev]) {
      updateStyle(layerById[prev], prev, false);
    }
    if (selectedLocationId && layerById[selectedLocationId]) {
      updateStyle(layerById[selectedLocationId], selectedLocationId, true);
    }
  }

  return {
    setMode,
    setRun,
    renderLocations,
    setSelectedLocationId,
    getLeafletMap() {
      return map;
    },
  };
}

