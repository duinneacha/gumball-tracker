// High-level application controller for the Arundel Gumball Tracker.
// Responsible for:
// - Initializing storage
// - Wiring the Leaflet map
// - Managing high-level modes: maintenance, operation, dashboard

import { initStorage, getAllFromStore } from "../storage/indexedDb.js";
import { createMapController } from "../map/mapController.js";
import { createShellLayout } from "../ui/layout.js";
import { createBottomSheet } from "../ui/bottomSheet.js";

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

  // Ref for import-success callback (set after mapController exists).
  const onImportSuccessRef = { current: null };

  // Build the basic shell layout: header, map container, panels.
  const shell = createShellLayout(rootElement, {
    initialMode: state.mode,
    onModeChange: async (mode) => {
      state.mode = mode;
      mapController.setMode(mode);
      if (mode === "maintenance") {
        const locations = await getAllFromStore("locations");
        mapController.renderLocations(locations, {
          showDeleted: false,
          forceFitBounds: true,
          useCircleMarkers: true,
        });
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
        if (state.mode === MODES.MAINTENANCE) {
          const locations = await getAllFromStore("locations");
          mapController.renderLocations(locations, {
            showDeleted: false,
            forceFitBounds: true,
            useCircleMarkers: true,
          });
        }
      }
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Storage or seed failed", err);
      shell.showError("Storage initialisation failed. App may behave unexpectedly.");
    });

  // Bottom sheet: opens on marker click in Maintenance Mode; read-only details.
  const bottomSheet = createBottomSheet({
    sheetHost: shell.getSheetHost(),
    sidePanel: shell.getSidePanel(),
    onClose: () => shell.refreshSidePanel(),
  });

  // Create map controller bound to the shell's map container.
  const mapController = createMapController(shell.getMapContainer(), {
    mode: state.mode,
    selectedRunId: state.selectedRunId,
    onLocationSelected: (location) => {
      if (state.mode === MODES.MAINTENANCE) {
        bottomSheet.open(location);
      }
    },
  });

  // Initial render for the current mode.
  mapController.setMode(state.mode);

  // After import, refresh map if in Maintenance so markers appear immediately.
  onImportSuccessRef.current = async () => {
    const locations = await getAllFromStore("locations");
    if (state.mode === MODES.MAINTENANCE) {
      mapController.renderLocations(locations, {
        showDeleted: false,
        forceFitBounds: true,
        useCircleMarkers: true,
      });
    }
  };
}

