// High-level application controller for the Arundel Gumball Tracker.
// Responsible for:
// - Initializing storage
// - Wiring the Leaflet map
// - Managing high-level modes: maintenance, operation, dashboard

import { initStorage, getAllFromStore, getEntity, putEntity } from "../storage/indexedDb.js";
import { createMapController } from "../map/mapController.js";
import { createShellLayout } from "../ui/layout.js";
import { createBottomSheet } from "../ui/bottomSheet.js";
import { showSnackbar } from "../ui/snackbar.js";
import { exportAllData } from "../storage/backup.js";
import { getAllRuns, getLocationsForRun } from "../domain/runModel.js";
import { createRunSession, markVisited } from "../domain/runSession.js";
import { getNearestByCardinal } from "../utils/geo.js";
import { createDisruptionPanel } from "../ui/disruptionPanel.js";

const LAST_RUN_KEY = "gumball-lastRunId";

// Simple enum for app modes
const MODES = {
  DASHBOARD: "dashboard",
  MAINTENANCE: "maintenance",
  OPERATION: "operation",
};

function formatLastVisit(visitedAt, locationName) {
  if (!visitedAt) return "No visits yet";
  const name = locationName || "Unknown location";
  const ms = Date.now() - (typeof visitedAt === "number" ? visitedAt : new Date(visitedAt).getTime());
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);
  let ago;
  if (days > 0) ago = `${days} day${days === 1 ? "" : "s"} ago`;
  else if (hours > 0) ago = `${hours} hour${hours === 1 ? "" : "s"} ago`;
  else if (mins > 0) ago = `${mins} min ago`;
  else ago = "Just now";
  return `${name} – ${ago}`;
}

export function createApp(rootElement) {
  const state = {
    mode: MODES.DASHBOARD,
    selectedRunId: null,
    runSession: null,
    isDisruptionMode: false,
    gpsWatchId: null,
    currentPosition: null,
    gpsAvailable: false,
    locationPermissionDeniedThisSession: false,
    maintenanceFilters: {
      active: true,
      archived: false,
      deleted: false,
      unassignedOnly: false,
      searchQuery: "",
    },
  };

  const onImportSuccessRef = { current: null };
  const refreshMaintenanceMapRef = { current: null };
  const refreshDashboardDataRef = { current: null };
  const maintenanceFilterOptionsRef = {
    current: {
      maintenanceFilters: state.maintenanceFilters,
      onMaintenanceFiltersChange: (next) => {
        state.maintenanceFilters = next;
        maintenanceFilterOptionsRef.current.maintenanceFilters = next;
        shell.refreshSidePanel();
        if (typeof refreshMaintenanceMapRef.current === "function") {
          refreshMaintenanceMapRef.current({ forceFitBounds: false });
        }
      },
      onExportBackup: async () => {
        const data = await exportAllData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `gumball-backup-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.json`;
        a.click();
        URL.revokeObjectURL(url);
      },
    },
  };
  maintenanceFilterOptionsRef.current.maintenanceFilters = state.maintenanceFilters;

  const disruptionRef = { current: { isDisruptionMode: false } };
  const onFabClickRef = { current: null };
  let disruptionPanelInstance = null;

  const dashboardDataRef = {
    current: {
      activeCount: 0,
      runsCount: 0,
      lastVisitText: "No visits yet",
      onGoToMaintenance: () => {},
      onGoToOperation: () => {},
    },
  };

  const operationOptionsRef = {
    current: {
      runs: [],
      selectedRunId: null,
      runName: "—",
      visitedCount: 0,
      totalCount: 0,
      resumeRunId: null,
      onRunSelect: (runId) => {
        state.selectedRunId = runId;
        if (runId) {
          state.runSession = createRunSession(runId);
          try {
            localStorage.setItem(LAST_RUN_KEY, runId);
          } catch (_) {}
        } else {
          state.runSession = null;
          try {
            localStorage.setItem(LAST_RUN_KEY, "");
          } catch (_) {}
        }
        mapController.setRun(runId);
        if (!runId) stopWatchingGPS();
        else if (state.mode === MODES.OPERATION) startWatchingGPS();
        if (typeof refreshOperationMapRef.current === "function") {
          refreshOperationMapRef.current();
        }
        shell.updateHeaderOperation();
        shell.refreshSidePanel();
      },
    },
  };

  const shell = createShellLayout(rootElement, {
    initialMode: state.mode,
    onModeChange: async (mode) => {
      state.mode = mode;
      mapController.setMode(mode);
      if (mode !== "maintenance") {
        mapController.setSelectedLocationId(null);
      }
      if (state.isDisruptionMode && mode !== MODES.OPERATION) {
        state.isDisruptionMode = false;
        disruptionRef.current.isDisruptionMode = false;
        if (disruptionPanelInstance) {
          disruptionPanelInstance.destroy();
          disruptionPanelInstance = null;
        }
      }
      if (mode !== MODES.OPERATION) stopWatchingGPS();
      if (mode === MODES.DASHBOARD && typeof refreshDashboardDataRef.current === "function") {
        await refreshDashboardDataRef.current();
      }
      if (mode === "maintenance" && typeof refreshMaintenanceMapRef.current === "function") {
        await refreshMaintenanceMapRef.current();
      }
      if (mode === MODES.OPERATION && typeof refreshOperationMapRef.current === "function") {
        await refreshOperationMapRef.current();
      }
      if (mode === MODES.OPERATION && state.selectedRunId) startWatchingGPS();
      shell.updateHeaderOperation();
      shell.refreshSidePanel();
      if (mode === MODES.MAINTENANCE || mode === MODES.OPERATION) {
        requestAnimationFrame(() => {
          mapController.invalidateSize();
        });
      }
    },
    onRunChange: (runId) => {
      state.selectedRunId = runId;
      mapController.setRun(runId);
    },
    onImportSuccessRef,
    maintenanceFilterOptionsRef,
    operationOptionsRef,
    dashboardDataRef,
    onFabClickRef,
    disruptionRef,
    onMapVisible: () => mapController.invalidateSize(),
  });

  // Initialize storage, then run first-run seed if locations store is empty; load runs for Operation mode.
  initStorage()
    .then(() => import("../storage/seed.js").then((m) => m.runFirstRunSeedIfEmpty()))
    .then(async (result) => {
      if (result.imported > 0) {
        // eslint-disable-next-line no-console
        console.log(`First-run seed: imported ${result.imported} locations.`);
        if (typeof refreshMaintenanceMapRef.current === "function") {
          await refreshMaintenanceMapRef.current();
        }
      }
    })
    .then(() => getAllRuns())
    .then((runs) => {
      operationOptionsRef.current.runs = runs || [];
      try {
        operationOptionsRef.current.resumeRunId = localStorage.getItem(LAST_RUN_KEY) || null;
      } catch (_) {
        operationOptionsRef.current.resumeRunId = null;
      }
      shell.updateHeaderOperation();
      if (state.mode === MODES.OPERATION && typeof refreshOperationMapRef.current === "function") {
        refreshOperationMapRef.current();
      }
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Storage or seed failed", err);
      shell.showError("Storage initialisation failed. App may behave unexpectedly.");
    });

  // Bottom sheet: opens on marker click in Maintenance Mode; editable with Save/Delete.
  const snackbarHost = shell.getSnackbarHost();
  const bottomSheet = createBottomSheet({
    sheetHost: shell.getSheetHost(),
    sidePanel: shell.getSidePanel(),
    onClose: () => {
      mapController.setSelectedLocationId(null);
      if (state.mode === MODES.OPERATION && typeof refreshOperationMapRef.current === "function") {
        refreshOperationMapRef.current({ forceFitBounds: false });
      }
      if (state.isDisruptionMode && disruptionPanelInstance) {
        disruptionPanelInstance.updateSuggestions(state.suggestionsByDirection || {});
      }
      shell.refreshSidePanel();
    },
    onSave: async (updatedLocation) => {
      if (!updatedLocation?.name?.trim()) return;
      const location = {
        id: updatedLocation.id,
        latitude: updatedLocation.latitude,
        longitude: updatedLocation.longitude,
        name: updatedLocation.name.trim(),
        serviceFrequency: updatedLocation.serviceFrequency ?? "adhoc",
        productType: updatedLocation.productType ?? "",
        notes: updatedLocation.notes ?? "",
        status: updatedLocation.status ?? "active",
      };
      await putEntity("locations", location);
      if (typeof refreshMaintenanceMapRef.current === "function") {
        await refreshMaintenanceMapRef.current({ forceFitBounds: false });
      }
      showSnackbar(snackbarHost, "Location updated");
    },
    onArchive: async (location) => {
      const previousStatus = location.status ?? "active";
      const archived = { ...location, status: "archived" };
      await putEntity("locations", archived);
      if (typeof refreshMaintenanceMapRef.current === "function") {
        await refreshMaintenanceMapRef.current({ forceFitBounds: false });
      }
      showSnackbar(snackbarHost, "Location archived", {
        undoLabel: "Undo",
        duration: 5000,
        onUndo: async () => {
          const restored = { ...archived, status: "active" };
          await putEntity("locations", restored);
          if (typeof refreshMaintenanceMapRef.current === "function") {
            await refreshMaintenanceMapRef.current({ forceFitBounds: false });
          }
        },
      });
    },
    onDelete: async (location) => {
      const previousStatus = location.status ?? "active";
      const deleted = { ...location, status: "deleted" };
      await putEntity("locations", deleted);
      if (typeof refreshMaintenanceMapRef.current === "function") {
        await refreshMaintenanceMapRef.current({ forceFitBounds: false });
      }
      showSnackbar(snackbarHost, "Location deleted", {
        undoLabel: "Undo",
        duration: 5000,
        onUndo: async () => {
          const restored = { ...deleted, status: previousStatus };
          await putEntity("locations", restored);
          if (typeof refreshMaintenanceMapRef.current === "function") {
            await refreshMaintenanceMapRef.current({ forceFitBounds: false });
          }
        },
      });
    },
    onMarkVisited: (location) => {
      if (state.runSession && location?.id) {
        markVisited(state.runSession, location.id);
        if (state.isDisruptionMode) {
          const map = mapController.getLeafletMap();
          const gpsPos = mapController.getGpsPosition();
          const center = gpsPos ? { lat: gpsPos.lat, lng: gpsPos.lng } : map.getCenter();
          getLocationsForRun(state.selectedRunId).then((locations) => {
            const visitedIds = state.runSession.visitedLocationIds;
            state.suggestionsByDirection = getNearestByCardinal(center.lat, center.lng, locations, visitedIds);
            if (disruptionPanelInstance) disruptionPanelInstance.updateSuggestions(state.suggestionsByDirection);
            refreshOperationMapRef.current?.();
          });
        } else {
          refreshOperationMapRef.current?.();
        }
        shell.refreshSidePanel();
      }
    },
  });

  // Create map controller bound to the shell's map container.
  const mapController = createMapController(shell.getMapContainer(), {
    mode: state.mode,
    selectedRunId: state.selectedRunId,
    onLocationSelected: (location) => {
      if (state.mode === MODES.MAINTENANCE) {
        mapController.setSelectedLocationId(location.id);
        bottomSheet.open(location);
      }
      if (state.mode === MODES.OPERATION && !state.isDisruptionMode) {
        mapController.setSelectedLocationId(location.id);
        bottomSheet.open(location, { context: "operation" });
      }
      if (state.mode === MODES.OPERATION && state.isDisruptionMode) {
        mapController.setSelectedLocationId(location.id);
        bottomSheet.open(location, { context: "disruption" });
      }
    },
  });

  mapController.setMode(state.mode);

  const refreshOperationMapRef = { current: null };

  const GPS_WATCH_OPTIONS = {
    enableHighAccuracy: false,
    maximumAge: 10000,
    timeout: 10000,
  };

  function startWatchingGPS() {
    if (state.mode !== MODES.OPERATION || !state.selectedRunId) return;
    if (state.gpsWatchId != null) return;
    if (!navigator.geolocation) return;
    state.gpsWatchId = navigator.geolocation.watchPosition(
      (position) => {
        state.currentPosition = position;
        state.gpsAvailable = true;
        mapController.updateGpsMarker(position);
        shell.setGpsActive?.(true);
      },
      (error) => {
        if (error.code === 1) {
          state.gpsAvailable = false;
          mapController.removeGpsMarker();
          shell.setGpsActive?.(false);
          if (!state.locationPermissionDeniedThisSession) {
            state.locationPermissionDeniedThisSession = true;
            showSnackbar(snackbarHost, "Enable location to see your position on the map.");
          }
        } else {
          state.gpsAvailable = false;
          mapController.removeGpsMarker();
          shell.setGpsActive?.(false);
        }
      },
      GPS_WATCH_OPTIONS
    );
  }

  function stopWatchingGPS() {
    if (state.gpsWatchId != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(state.gpsWatchId);
      state.gpsWatchId = null;
    }
    state.currentPosition = null;
    state.gpsAvailable = false;
    mapController.removeGpsMarker();
    shell.setGpsActive?.(false);
  }

  async function refreshMaintenanceMap(opts = {}) {
    if (state.mode !== MODES.MAINTENANCE) return;
    const [locations, runLocations] = await Promise.all([
      getAllFromStore("locations"),
      getAllFromStore("runLocations"),
    ]);
    const assignedLocationIds = new Set((runLocations || []).map((rl) => rl.locationId));
    const filters = state.maintenanceFilters;
    mapController.renderLocations(locations, {
      forceFitBounds: opts.forceFitBounds !== false,
      useCircleMarkers: true,
      statusFilters: {
        active: filters.active,
        archived: filters.archived,
        deleted: filters.deleted,
      },
      unassignedOnly: filters.unassignedOnly,
      searchQuery: filters.searchQuery,
      assignedLocationIds,
    });
  }

  async function refreshOperationMap(opts = {}) {
    if (state.mode !== MODES.OPERATION) return;
    if (!state.selectedRunId) {
      mapController.renderLocations([], { skipMaintenanceFilters: true, useCircleMarkers: true });
      operationOptionsRef.current.runName = "—";
      operationOptionsRef.current.visitedCount = 0;
      operationOptionsRef.current.totalCount = 0;
      shell.refreshSidePanel();
      return;
    }
    const locations = await getLocationsForRun(state.selectedRunId);
    const session = state.runSession;
    const visitedIds = session?.visitedLocationIds ?? new Set();
    let suggestionLocationIds = null;
    if (state.isDisruptionMode && state.suggestionsByDirection) {
      const dirs = state.suggestionsByDirection;
      suggestionLocationIds = new Set([dirs.N?.id, dirs.S?.id, dirs.E?.id, dirs.W?.id].filter(Boolean));
    }
    mapController.renderLocations(locations, {
      forceFitBounds: opts.forceFitBounds !== false,
      useCircleMarkers: true,
      skipMaintenanceFilters: true,
      visitedLocationIds: visitedIds,
      suggestionLocationIds: suggestionLocationIds || undefined,
    });
    const runs = operationOptionsRef.current.runs || [];
    const run = runs.find((r) => r.id === state.selectedRunId);
    operationOptionsRef.current.runName = run?.name ?? "—";
    operationOptionsRef.current.visitedCount = visitedIds.size;
    operationOptionsRef.current.totalCount = locations.length;
  }

  async function refreshDashboardData() {
    const [locations, runs, visits] = await Promise.all([
      getAllFromStore("locations"),
      getAllFromStore("runs"),
      getAllFromStore("visits"),
    ]);
    const activeCount = (locations || []).filter((l) => l.status === "active").length;
    const runsCount = (runs || []).length;
    const sortedVisits = (visits || []).slice().sort((a, b) => (b.visitedAt || 0) - (a.visitedAt || 0));
    let lastVisitText = "No visits yet";
    if (sortedVisits.length > 0) {
      const v = sortedVisits[0];
      const loc = await getEntity("locations", v.locationId);
      lastVisitText = formatLastVisit(v.visitedAt, loc?.name);
    }
    dashboardDataRef.current = {
      ...dashboardDataRef.current,
      activeCount,
      runsCount,
      lastVisitText,
      onGoToMaintenance: () => shell.setMode("maintenance"),
      onGoToOperation: () => shell.setMode("operation"),
    };
  }

  function enterDisruption() {
    if (state.mode !== MODES.OPERATION || !state.selectedRunId || !state.runSession) return;
    state.isDisruptionMode = true;
    disruptionRef.current.isDisruptionMode = true;
    const map = mapController.getLeafletMap();
    const gpsPos = mapController.getGpsPosition();
    const center = gpsPos ? { lat: gpsPos.lat, lng: gpsPos.lng } : map.getCenter();
    getLocationsForRun(state.selectedRunId).then((locations) => {
      const visitedIds = state.runSession.visitedLocationIds;
      state.suggestionsByDirection = getNearestByCardinal(center.lat, center.lng, locations, visitedIds);
      refreshOperationMapRef.current?.();
      const host = shell.getDisruptionPanelHost();
      disruptionPanelInstance = createDisruptionPanel(host, {
        suggestionsByDirection: state.suggestionsByDirection,
        onDirection: (dir) => {
          const loc = state.suggestionsByDirection?.[dir];
          if (loc?.id) mapController.panToLocation(loc.id);
        },
        onClose: exitDisruption,
      });
      shell.refreshSidePanel();
    });
  }

  function exitDisruption() {
    state.isDisruptionMode = false;
    disruptionRef.current.isDisruptionMode = false;
    state.suggestionsByDirection = null;
    if (disruptionPanelInstance) {
      disruptionPanelInstance.destroy();
      disruptionPanelInstance = null;
    }
    refreshOperationMapRef.current?.({ forceFitBounds: false });
    shell.refreshSidePanel();
  }

  onFabClickRef.current = enterDisruption;

  shell.setOnCenterOnMe(() => mapController.panToGps());

  refreshMaintenanceMapRef.current = refreshMaintenanceMap;
  refreshOperationMapRef.current = refreshOperationMap;
  refreshDashboardDataRef.current = refreshDashboardData;
  onImportSuccessRef.current = refreshMaintenanceMap;

  refreshDashboardData().then(() => {
    if (state.mode === MODES.DASHBOARD) shell.refreshSidePanel();
  });
}

