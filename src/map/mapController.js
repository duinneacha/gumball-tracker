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
   * Render location markers. Applies filters in order (PRD V1.7): status → unassigned → search.
   * When skipMaintenanceFilters (Operation mode), uses locations as-is and supports visitedLocationIds styling (PRD V1.8).
   * @param {Array<{ id: string, latitude: number, longitude: number, status?: string, name?: string }>} locations
   * @param {{ forceFitBounds?: boolean, useCircleMarkers?: boolean, statusFilters?: object, unassignedOnly?: boolean, searchQuery?: string, assignedLocationIds?: Set<string>|string[], skipMaintenanceFilters?: boolean, visitedLocationIds?: Set<string> }} [opts]
   */
  function renderLocations(locations, opts = {}) {
    const forceFitBounds = opts.forceFitBounds === true;
    const useCircleMarkers = opts.useCircleMarkers === true;
    const skipMaintenanceFilters = opts.skipMaintenanceFilters === true;
    const visitedSet = opts.visitedLocationIds instanceof Set
      ? opts.visitedLocationIds
      : new Set(Array.isArray(opts.visitedLocationIds) ? opts.visitedLocationIds : []);

    const inputCount = Array.isArray(locations) ? locations.length : 0;
    if (forceFitBounds) {
      hasFittedBounds = false;
    }

    locationsLayer.clearLayers();
    Object.keys(layerById).forEach((id) => delete layerById[id]);

    let visible = Array.isArray(locations) ? locations : [];
    if (!skipMaintenanceFilters) {
      const statusFilters = opts.statusFilters ?? { active: true, archived: false, deleted: false };
      const unassignedOnly = opts.unassignedOnly === true;
      const searchQuery = (opts.searchQuery ?? "").trim().toLowerCase();
      const assignedSet = opts.assignedLocationIds instanceof Set
        ? opts.assignedLocationIds
        : new Set(Array.isArray(opts.assignedLocationIds) ? opts.assignedLocationIds : []);
      visible = visible.filter((loc) => statusFilters[loc.status] === true);
      if (unassignedOnly) {
        visible = visible.filter((loc) => !assignedSet.has(loc.id));
      }
      if (searchQuery) {
        visible = visible.filter((loc) =>
          (loc.name != null && String(loc.name).toLowerCase().includes(searchQuery))
        );
      }
    }

    // eslint-disable-next-line no-console
    console.log(`[map] renderLocations input=${inputCount} visible=${visible.length}`);

    const baseRadius = 6;
    const hoverRadius = 7;
    const selectedWeight = 3;
    const defaultWeight = 2;
    const visitedFill = "#9ca3af";
    const visitedStroke = "#6b7280";

    function applyMarkerStyle(l, id, isHovered, isSelected, isVisited) {
      if (!useCircleMarkers || !l.setStyle) return;
      const radius = isHovered || isSelected ? hoverRadius : baseRadius;
      const weight = isSelected ? selectedWeight : defaultWeight;
      const fillColor = isVisited ? visitedFill : (isSelected ? "#ea580c" : "#f97316");
      const color = isVisited ? visitedStroke : "#c2410c";
      const fillOpacity = isVisited ? 0.65 : 0.9;
      l.setStyle({ radius, weight, fillColor, color, fillOpacity });
    }

    for (const loc of visible) {
      const isVisited = visitedSet.has(loc.id);
      const layer = useCircleMarkers
        ? L.circleMarker([loc.latitude, loc.longitude], {
            radius: baseRadius,
            weight: defaultWeight,
            fillColor: isVisited ? visitedFill : "#f97316",
            color: isVisited ? visitedStroke : "#c2410c",
            fillOpacity: isVisited ? 0.65 : 0.9,
          })
        : L.marker([loc.latitude, loc.longitude]);

      if (useCircleMarkers) {
        layer._locationId = loc.id;
        layer._isVisited = isVisited;
        layer.on("mouseover", () => {
          applyMarkerStyle(layer, loc.id, true, loc.id === selectedLocationId, visitedSet.has(loc.id));
        });
        layer.on("mouseout", () => {
          applyMarkerStyle(layer, loc.id, false, loc.id === selectedLocationId, visitedSet.has(loc.id));
        });
      }

      layer.on("click", () => {
        if (useCircleMarkers) {
          applyMarkerStyle(layer, loc.id, true, true, visitedSet.has(loc.id));
          setTimeout(() => {
            applyMarkerStyle(layer, loc.id, false, loc.id === selectedLocationId, visitedSet.has(loc.id));
          }, 150);
        }
        if (typeof onLocationSelected === "function") {
          onLocationSelected(loc);
        }
      });

      if (useCircleMarkers) {
        layerById[loc.id] = layer;
        applyMarkerStyle(layer, loc.id, false, loc.id === selectedLocationId, visitedSet.has(loc.id));
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

