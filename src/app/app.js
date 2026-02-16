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
  };

  const onImportSuccessRef = { current: null };
  const refreshMaintenanceMapRef = { current: null };

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
    },
    onRunChange: (runId) => {
      state.selectedRunId = runId;
      mapController.setRun(runId);
    },
    onImportSuccessRef,
  });

  // Initialize storage, then run first-run seed if locations store is empty.
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
    },
  });

  mapController.setMode(state.mode);

  async function refreshMaintenanceMap(opts = {}) {
    if (state.mode !== MODES.MAINTENANCE) return;
    const locations = await getAllFromStore("locations");
    mapController.renderLocations(locations, {
      showDeleted: false,
      forceFitBounds: opts.forceFitBounds !== false,
      useCircleMarkers: true,
    });
  }

  refreshMaintenanceMapRef.current = refreshMaintenanceMap;
  onImportSuccessRef.current = refreshMaintenanceMap;
}

