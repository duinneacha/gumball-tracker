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
  let lastTouchTapTime = 0;
  const TOUCH_MOVE_THRESHOLD_PX = 15;
  const TOUCH_CLICK_SUPPRESS_MS = 400;

  // GPS "You Are Here" marker (PRD V2.0) – separate layer, no interaction
  const gpsLayer = L.featureGroup();
  let gpsMarker = null;
  let gpsAccuracyCircle = null;
  let lastGpsPosition = null;

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
    const selectedRadius = 10;
    const suggestionRadius = 8;
    const selectedWeight = 3;
    const defaultWeight = 2;
    const visitedFill = "#9ca3af";
    const visitedStroke = "#6b7280";
    const suggestionFill = "#3b82f6";
    const suggestionStroke = "#ffffff";
    const suggestionSet = opts.suggestionLocationIds instanceof Set
      ? opts.suggestionLocationIds
      : new Set(Array.isArray(opts.suggestionLocationIds) ? opts.suggestionLocationIds : []);

    function applyMarkerStyle(l, id, isHovered, isSelected, isVisited, isSuggestion) {
      if (!useCircleMarkers || !l.setStyle) return;
      const radius = isSuggestion ? suggestionRadius : (isSelected ? selectedRadius : (isHovered ? hoverRadius : baseRadius));
      const weight = isSelected ? selectedWeight : (isSuggestion ? 2 : defaultWeight);
      let fillColor, color, fillOpacity;
      if (isSuggestion) {
        fillColor = suggestionFill;
        color = suggestionStroke;
        fillOpacity = 0.9;
      } else if (isSelected && !isVisited) {
        fillColor = "#ffffff";
        color = "#ef4444";
        fillOpacity = 1.0;
      } else {
        fillColor = isVisited ? visitedFill : "#ef4444";
        color = isVisited ? visitedStroke : "#b91c1c";
        fillOpacity = isVisited ? 0.65 : 0.9;
      }
      l.setStyle({ radius, weight, fillColor, color, fillOpacity });
    }

    for (const loc of visible) {
      const isVisited = visitedSet.has(loc.id);
      const isSuggestion = suggestionSet.has(loc.id);
      const radius = isSuggestion ? suggestionRadius : baseRadius;
      const fillColor = isSuggestion ? suggestionFill : (isVisited ? visitedFill : "#ef4444");
      const color = isSuggestion ? suggestionStroke : (isVisited ? visitedStroke : "#b91c1c");
      const layer = useCircleMarkers
        ? L.circleMarker([loc.latitude, loc.longitude], {
            radius,
            weight: isSuggestion ? 2 : defaultWeight,
            fillColor,
            color,
            fillOpacity: isSuggestion ? 0.9 : (isVisited ? 0.65 : 0.9),
          })
        : L.marker([loc.latitude, loc.longitude]);

      if (useCircleMarkers) {
        layer._locationId = loc.id;
        layer._isVisited = isVisited;
        layer._isSuggestion = isSuggestion;
        layer.on("mouseover", () => {
          applyMarkerStyle(layer, loc.id, true, loc.id === selectedLocationId, visitedSet.has(loc.id), isSuggestion);
        });
        layer.on("mouseout", () => {
          applyMarkerStyle(layer, loc.id, false, loc.id === selectedLocationId, visitedSet.has(loc.id), isSuggestion);
        });
      }

      function triggerSelect() {
        if (useCircleMarkers) {
          applyMarkerStyle(layer, loc.id, true, true, visitedSet.has(loc.id), isSuggestion);
          setTimeout(() => {
            applyMarkerStyle(layer, loc.id, false, loc.id === selectedLocationId, visitedSet.has(loc.id), isSuggestion);
          }, 150);
        }
        if (typeof onLocationSelected === "function") {
          onLocationSelected(loc);
        }
      }

      layer.on("click", () => {
        if (Date.now() - lastTouchTapTime < TOUCH_CLICK_SUPPRESS_MS) return;
        triggerSelect();
      });

      let touchStartX = 0;
      let touchStartY = 0;
      layer.on("touchstart", (e) => {
        if (e.originalEvent?.touches?.length === 1) {
          touchStartX = e.originalEvent.touches[0].clientX;
          touchStartY = e.originalEvent.touches[0].clientY;
        }
      }, { passive: true });
      layer.on("touchend", (e) => {
        if (e.originalEvent?.changedTouches?.length !== 1) return;
        const t = e.originalEvent.changedTouches[0];
        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;
        if (dx * dx + dy * dy <= TOUCH_MOVE_THRESHOLD_PX * TOUCH_MOVE_THRESHOLD_PX) {
          lastTouchTapTime = Date.now();
          e.originalEvent?.preventDefault?.();
          triggerSelect();
        }
      }, { passive: false });

      if (useCircleMarkers) {
        layerById[loc.id] = layer;
        applyMarkerStyle(layer, loc.id, false, loc.id === selectedLocationId, visitedSet.has(loc.id), isSuggestion);
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
    const selectedRadius = 10;
    const suggestionRadius = 8;
    const selectedWeight = 3;
    const defaultWeight = 2;
    const updateStyle = (l, selected) => {
      if (!l.setStyle) return;
      const isSuggestion = l._isSuggestion === true;
      const isVisited = l._isVisited === true;
      const radius = selected ? (isSuggestion ? suggestionRadius : selectedRadius) : (isSuggestion ? suggestionRadius : baseRadius);
      const weight = selected ? selectedWeight : (isSuggestion ? 2 : defaultWeight);
      let fillColor, color, fillOpacity;
      if (isSuggestion) {
        fillColor = "#3b82f6";
        color = "#ffffff";
        fillOpacity = 0.9;
      } else if (selected && !isVisited) {
        fillColor = "#ffffff";
        color = "#ef4444";
        fillOpacity = 1.0;
      } else {
        fillColor = isVisited ? "#9ca3af" : "#ef4444";
        color = isVisited ? "#6b7280" : "#b91c1c";
        fillOpacity = isVisited ? 0.65 : 0.9;
      }
      l.setStyle({ radius, weight, fillColor, color, fillOpacity });
    };
    if (prev && layerById[prev]) {
      updateStyle(layerById[prev], false);
    }
    if (selectedLocationId && layerById[selectedLocationId]) {
      updateStyle(layerById[selectedLocationId], true);
    }
  }

  function panToLocation(id) {
    const layer = layerById[id];
    if (layer && layer.getLatLng) {
      map.panTo(layer.getLatLng());
      setSelectedLocationId(id);
    }
  }

  function invalidateSize() {
    map.invalidateSize();
  }

  /**
   * Update or create the GPS "You Are Here" marker and optional accuracy circle (PRD V2.0).
   * @param {{ coords: { latitude: number, longitude: number, accuracy?: number } }} position
   */
  function updateGpsMarker(position) {
    if (!position?.coords) return;
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const accuracy = position.coords.accuracy;
    lastGpsPosition = { lat, lng, accuracy };

    if (!gpsMarker) {
      gpsMarker = L.circleMarker([lat, lng], {
        radius: 8,
        weight: 2,
        fillColor: "#3b82f6",
        color: "#ffffff",
        fillOpacity: 1,
        className: "gps-you-are-here",
      });
      gpsMarker.addTo(gpsLayer);
    } else {
      gpsMarker.setLatLng([lat, lng]);
    }

    if (typeof accuracy === "number" && accuracy > 0) {
      if (!gpsAccuracyCircle) {
        gpsAccuracyCircle = L.circle([lat, lng], {
          radius: accuracy,
          weight: 1,
          fillColor: "#3b82f6",
          color: "#3b82f6",
          fillOpacity: 0.2,
          className: "gps-accuracy-circle",
        });
        gpsAccuracyCircle.addTo(gpsLayer);
      } else {
        gpsAccuracyCircle.setLatLng([lat, lng]);
        gpsAccuracyCircle.setRadius(accuracy);
      }
    } else if (gpsAccuracyCircle) {
      gpsLayer.removeLayer(gpsAccuracyCircle);
      gpsAccuracyCircle = null;
    }

    if (!map.hasLayer(gpsLayer)) {
      gpsLayer.addTo(map);
    }
  }

  function removeGpsMarker() {
    if (map.hasLayer(gpsLayer)) {
      map.removeLayer(gpsLayer);
    }
    gpsLayer.clearLayers();
    gpsMarker = null;
    gpsAccuracyCircle = null;
    lastGpsPosition = null;
  }

  function panToGps() {
    if (!lastGpsPosition) return;
    map.panTo([lastGpsPosition.lat, lastGpsPosition.lng]);
    if (map.getZoom() < 16) {
      map.setZoom(16);
    }
  }

  function getGpsPosition() {
    return lastGpsPosition ? { lat: lastGpsPosition.lat, lng: lastGpsPosition.lng } : null;
  }

  return {
    setMode,
    setRun,
    renderLocations,
    setSelectedLocationId,
    panToLocation,
    invalidateSize,
    updateGpsMarker,
    removeGpsMarker,
    panToGps,
    getGpsPosition,
    getLeafletMap() {
      return map;
    },
  };
}

