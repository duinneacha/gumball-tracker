// High-level application controller for the Arundel Gumball Tracker.
// Responsible for:
// - Initializing storage
// - Wiring the Leaflet map
// - Managing high-level modes: maintenance, operation, dashboard

import { initStorage, getAllFromStore } from "../storage/indexedDb.js";
import { createMapController } from "../map/mapController.js";
import { createShellLayout } from "../ui/layout.js";

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

  // Build the basic shell layout: header, map container, panels.
  const shell = createShellLayout(rootElement, {
    initialMode: state.mode,
    onModeChange: async (mode) => {
      state.mode = mode;
      mapController.setMode(mode);
      if (mode === "maintenance") {
        const locations = await getAllFromStore("locations");
        mapController.renderLocations(locations, { showDeleted: false });
      }
    },
    onRunChange: (runId) => {
      state.selectedRunId = runId;
      mapController.setRun(runId);
    },
  });

  // Initialize storage, then run first-run seed if locations store is empty.
  initStorage()
    .then(() => import("../storage/seed.js").then((m) => m.runFirstRunSeedIfEmpty()))
    .then((result) => {
      if (result.imported > 0) {
        // eslint-disable-next-line no-console
        console.log(`First-run seed: imported ${result.imported} locations.`);
      }
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Storage or seed failed", err);
      shell.showError("Storage initialisation failed. App may behave unexpectedly.");
    });

  // Create map controller bound to the shell's map container.
  const mapController = createMapController(shell.getMapContainer(), {
    mode: state.mode,
    selectedRunId: state.selectedRunId,
  });

  // Initial render for the current mode.
  mapController.setMode(state.mode);
}

