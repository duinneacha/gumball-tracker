// High-level application controller for the Arundel Gumball Tracker.
// Responsible for:
// - Initializing storage
// - Wiring the Leaflet map
// - Managing high-level modes: maintenance, operation, dashboard

import { initStorage, getAllFromStore, putEntity } from "../storage/indexedDb.js";
import { createMapController } from "../map/mapController.js";
import { createShellLayout } from "../ui/layout.js";
import { createBottomSheet } from "../ui/bottomSheet.js";
import { showSnackbar } from "../ui/snackbar.js";
import { exportAllData } from "../storage/backup.js";
import { getAllRuns, getLocationsForRun } from "../domain/runModel.js";
import { createRunSession, markVisited } from "../domain/runSession.js";

const LAST_RUN_KEY = "gumball-lastRunId";

// Simple enum for app modes
const MODES = {
  MAINTENANCE: "maintenance",
  OPERATION: "operation",
  DASHBOARD: "dashboard",
};

export function createApp(rootElement) {
  const state = {
    mode: MODES.OPERATION,
    selectedRunId: null,
    runSession: null,
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
      if (mode === "maintenance" && typeof refreshMaintenanceMapRef.current === "function") {
        await refreshMaintenanceMapRef.current();
      }
      if (mode === "operation" && typeof refreshOperationMapRef.current === "function") {
        await refreshOperationMapRef.current();
      }
      shell.updateHeaderOperation();
      shell.refreshSidePanel();
    },
    onRunChange: (runId) => {
      state.selectedRunId = runId;
      mapController.setRun(runId);
    },
    onImportSuccessRef,
    maintenanceFilterOptionsRef,
    operationOptionsRef,
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
        if (typeof refreshOperationMapRef.current === "function") {
          refreshOperationMapRef.current();
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
      if (state.mode === MODES.OPERATION) {
        mapController.setSelectedLocationId(location.id);
        bottomSheet.open(location, { context: "operation" });
      }
    },
  });

  mapController.setMode(state.mode);

  const refreshOperationMapRef = { current: null };

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
    mapController.renderLocations(locations, {
      forceFitBounds: opts.forceFitBounds !== false,
      useCircleMarkers: true,
      skipMaintenanceFilters: true,
      visitedLocationIds: visitedIds,
    });
    const runs = operationOptionsRef.current.runs || [];
    const run = runs.find((r) => r.id === state.selectedRunId);
    operationOptionsRef.current.runName = run?.name ?? "—";
    operationOptionsRef.current.visitedCount = visitedIds.size;
    operationOptionsRef.current.totalCount = locations.length;
  }

  refreshMaintenanceMapRef.current = refreshMaintenanceMap;
  refreshOperationMapRef.current = refreshOperationMap;
  onImportSuccessRef.current = refreshMaintenanceMap;
}

