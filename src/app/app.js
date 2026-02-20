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
import {
  getAllRuns,
  getLocationsForRun,
  addLocationToRun,
  removeLocationFromRun,
  getAllRunsWithLocationCount,
  createRunFromName,
  updateRun,
  deleteRunAndLinks,
} from "../domain/runModel.js";
import { createRunSession, markVisited, markUnvisited, makeVisitId, getVisitId, sessionFromStorage } from "../domain/runSession.js";
import {
  createVisit,
  saveVisit,
  deleteVisit,
  getVisitsForRun,
  getVisitsCountInDateRange,
  getVisitsPerLocation,
} from "../domain/visitModel.js";
import { getAllActiveLocations } from "../domain/locationModel.js";
import { addRunCompletion, getLastRunCompletion, getAllCompletions } from "../domain/runCompletion.js";
import { saveActiveSession, loadActiveSession, clearActiveSession } from "../domain/activeSession.js";
import { getNearestByCardinal } from "../utils/geo.js";
import { createDisruptionPanel } from "../ui/disruptionPanel.js";
import { createRunManagementPanel } from "../ui/runManagement.js";
import { createResumePrompt } from "../ui/resumePrompt.js";
import { createRunHistoryPanel } from "../ui/runHistory.js";
import { createRunDetailPanel } from "../ui/runDetail.js";
import { getAutoCheckInSettings, saveAutoCheckInSettings } from "../domain/settingsStore.js";
import { createSettingsPanel } from "../ui/settingsPanel.js";
import { createAutoCheckInController } from "../domain/autoCheckIn.js";

const LAST_RUN_KEY = "gumball-lastRunId";

// Simple enum for app modes
const MODES = {
  DASHBOARD: "dashboard",
  MAINTENANCE: "maintenance",
  OPERATION: "operation",
};

function buildLocationRunColours(runLocations, runs) {
  const runColourById = Object.fromEntries((runs || []).map((r) => [r.id, r.colour ?? "#ef4444"]));
  const best = {};
  for (const rl of (runLocations || [])) {
    const t = rl.assignedAt ?? 0;
    if (!best[rl.locationId] || t > best[rl.locationId].assignedAt) {
      best[rl.locationId] = { runId: rl.runId, assignedAt: t };
    }
  }
  const result = {};
  for (const [locId, { runId }] of Object.entries(best)) {
    if (runColourById[runId]) result[locId] = runColourById[runId];
  }
  return result;
}

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
  const onOpenSettingsRef = { current: null };
  const refreshMaintenanceMapRef = { current: null };
  const refreshDashboardDataRef = { current: null };
  const runManagementRunsRef = { current: [] };
  let runManagementPanelInstance = null;
  let runHistoryPanelInstance = null;
  let runDetailPanelInstance = null;
  let settingsPanelInstance = null;

  const autoCheckInSettingsRef = { current: { enabled: false, proximityMeters: 50, dwellSeconds: 30 } };
  const autoCheckInRef = { current: null };
  const maintenanceLocationsRef = { current: [] };

  const maintenanceFilterOptionsRef = {
    current: {
      maintenanceFilters: state.maintenanceFilters,
      onOpenRunManagement: null,
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

  async function openRunManagement() {
    runManagementRunsRef.current = await getAllRunsWithLocationCount();
    const host = shell.getRunManagementHost();
    host.setAttribute("aria-hidden", "false");
    host._onBackdropClick = (e) => { if (e.target === host) closeRunManagement(); };
    host.addEventListener("click", host._onBackdropClick);
    runManagementPanelInstance = createRunManagementPanel(host, {
      runsRef: runManagementRunsRef,
      onClose: closeRunManagement,
      onCreateRun: async (name, colour) => {
        await createRunFromName(name, colour);
        await refreshRunList();
        operationOptionsRef.current.runs = await getAllRuns();
        shell.updateHeaderOperation();
        showSnackbar(snackbarHost, "Run created");
        if (typeof refreshMaintenanceMapRef.current === "function") {
          await refreshMaintenanceMapRef.current({ forceFitBounds: false });
        }
      },
      onUpdateRun: async (runId, newName, newColour) => {
        await updateRun(runId, newName, newColour);
        await refreshRunList();
        operationOptionsRef.current.runs = await getAllRuns();
        shell.updateHeaderOperation();
        showSnackbar(snackbarHost, "Run updated");
        if (typeof refreshMaintenanceMapRef.current === "function") {
          await refreshMaintenanceMapRef.current({ forceFitBounds: false });
        }
        if (typeof refreshOperationMapRef.current === "function") {
          await refreshOperationMapRef.current({ forceFitBounds: false });
        }
      },
      onDeleteRun: async (runId) => {
        await deleteRunAndLinks(runId);
        await refreshRunList();
        operationOptionsRef.current.runs = await getAllRuns();
        shell.updateHeaderOperation();
        showSnackbar(snackbarHost, "Run deleted");
        if (typeof refreshMaintenanceMapRef.current === "function") {
          await refreshMaintenanceMapRef.current({ forceFitBounds: false });
        }
      },
    });
  }

  async function refreshRunList() {
    runManagementRunsRef.current = await getAllRunsWithLocationCount();
    if (runManagementPanelInstance) runManagementPanelInstance.render();
  }

  function closeRunManagement() {
    if (runManagementPanelInstance) {
      runManagementPanelInstance.destroy();
      runManagementPanelInstance = null;
    }
    const host = shell.getRunManagementHost();
    if (host._onBackdropClick) {
      host.removeEventListener("click", host._onBackdropClick);
      host._onBackdropClick = null;
    }
    host.setAttribute("aria-hidden", "true");
    host.innerHTML = "";
  }

  maintenanceFilterOptionsRef.current.onOpenRunManagement = openRunManagement;

  async function checkForActiveSession() {
    try {
      const stored = await loadActiveSession();
      if (!stored?.runId) return;
      const run = await getEntity("runs", stored.runId);
      if (!run) {
        await clearActiveSession();
        showSnackbar(snackbarHost, "Saved run no longer exists. Starting fresh.");
        return;
      }
      const session = sessionFromStorage(stored);
      if (!session) {
        await clearActiveSession();
        showSnackbar(snackbarHost, "Could not restore session. Starting fresh.");
        return;
      }
      const locations = await getLocationsForRun(stored.runId);
      const host = shell.getResumePromptHost();
      createResumePrompt(host, {
        sessionInfo: {
          runName: run.name ?? stored.runId,
          startedAt: stored.startedAt,
          visitedCount: session.visitedLocationIds.size,
          totalCount: locations.length,
        },
        onResume: () => resumeSession(session),
        onStartNew: () => discardSession(),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("checkForActiveSession failed", err);
      await clearActiveSession();
    }
  }

  async function resumeSession(session) {
    state.selectedRunId = session.runId;
    state.runSession = session;
    operationOptionsRef.current.selectedRunId = session.runId;
    try {
      localStorage.setItem(LAST_RUN_KEY, session.runId);
    } catch (_) {}
    mapController.setRun(session.runId);
    shell.setMode("operation");
  }

  async function discardSession() {
    await clearActiveSession();
  }

  const disruptionRef = { current: { isDisruptionMode: false } };
  const onFabClickRef = { current: null };
  let disruptionPanelInstance = null;

  const dashboardDataRef = {
    current: {
      activeCount: 0,
      runsCount: 0,
      lastVisitText: "No visits yet",
      lastRun: null,
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
      onFinishRun: null,
      onRunSelect: async (runId) => {
        if (state.runSession && state.selectedRunId) {
          await clearActiveSession();
        }
        state.selectedRunId = runId;
        operationOptionsRef.current.selectedRunId = runId;
        if (runId) {
          state.runSession = createRunSession(runId);
          await saveActiveSession(state.runSession);
          try {
            localStorage.setItem(LAST_RUN_KEY, runId);
          } catch (_) {}
        } else {
          state.runSession = null;
          await clearActiveSession();
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
      if (mode !== MODES.OPERATION) {
        stopWatchingGPS();
        autoCheckInRef.current?.cancelAll();
      }
      if (mode === MODES.DASHBOARD && typeof refreshDashboardDataRef.current === "function") {
        await refreshDashboardDataRef.current();
      }
      if (mode === MODES.MAINTENANCE || mode === MODES.OPERATION) {
        await new Promise((r) => requestAnimationFrame(r));
        mapController.invalidateSize();
        await new Promise((r) => requestAnimationFrame(r));
        mapController.invalidateSize();
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
        requestAnimationFrame(() => mapController.invalidateSize());
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
    onOpenSettingsRef,
  });

  autoCheckInRef.current = createAutoCheckInController({
    getSettings: () => Promise.resolve(autoCheckInSettingsRef.current),
    getLocations: () => getLocationsForRun(state.selectedRunId),
    getVisitedIds: () => state.runSession?.visitedLocationIds ?? new Set(),
    onAutoVisit: async (locationId, locationName) => {
      if (!state.runSession || !state.selectedRunId) return;
      const visitId = makeVisitId(state.runSession, locationId);
      const visit = createVisit({
        id: visitId,
        locationId,
        runId: state.runSession.runId,
        visitedAt: Date.now(),
        visitMethod: "auto",
      });
      await saveVisit(visit);
      markVisited(state.runSession, locationId, visitId);
      await saveActiveSession(state.runSession);
      if (typeof refreshOperationMapRef.current === "function") {
        refreshOperationMapRef.current();
      }
      showSnackbar(snackbarHost, `Auto-checked: ${locationName}`, { duration: 3000 });
    },
  });

  // Initialize storage, then run first-run seed if locations store is empty; load runs for Operation mode.
  initStorage()
    .then(() => import("../storage/seed.js").then((m) => m.runFirstRunSeedIfEmpty()))
    .then(async (seedResult) => {
      const s = await getAutoCheckInSettings();
      autoCheckInSettingsRef.current = s;
      return seedResult;
    })
    .then(async (result) => {
      if (result?.imported > 0) {
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
    .then(() => checkForActiveSession())
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Storage or seed failed", err);
      shell.showError("Storage initialisation failed. App may behave unexpectedly.");
    });

  // Bottom sheet: opens on marker click in Maintenance Mode; editable with Save/Delete.
  const snackbarHost = shell.getSnackbarHost();

  function closeSettings() {
    if (settingsPanelInstance) {
      settingsPanelInstance.destroy();
      settingsPanelInstance = null;
    }
    const host = shell.getSettingsHost();
    if (host._onBackdropClick) {
      host.removeEventListener("click", host._onBackdropClick);
      host._onBackdropClick = null;
    }
    host.setAttribute("aria-hidden", "true");
    host.innerHTML = "";
  }

  function openSettings() {
    const host = shell.getSettingsHost();
    host.setAttribute("aria-hidden", "false");
    host._onBackdropClick = (e) => {
      if (e.target === host.querySelector(".settings-panel-overlay")) closeSettings();
    };
    host.addEventListener("click", host._onBackdropClick);
    settingsPanelInstance = createSettingsPanel(host, {
      initialSettings: autoCheckInSettingsRef.current,
      onSave: async (s) => {
        await saveAutoCheckInSettings(s);
        autoCheckInSettingsRef.current = { ...s };
      },
      onClose: closeSettings,
      onOpenRunManagement: () => {
        closeSettings();
        openRunManagement();
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
      onImportBackup: async (file) => {
        try {
          const text = await file.text();
          const json = JSON.parse(text);
          const { importFromJson } = await import("../storage/seed.js");
          const result = await importFromJson(json);
          if (typeof onImportSuccessRef.current === "function") {
            await onImportSuccessRef.current();
          }
          showSnackbar(
            snackbarHost,
            result.kind === "full" ? "Full backup restored." : `Imported ${result.count} location(s).`,
            { duration: 4000 }
          );
        } catch (err) {
          showSnackbar(snackbarHost, err instanceof Error ? err.message : "Import failed.", { duration: 5000 });
        }
      },
    });
  }
  onOpenSettingsRef.current = openSettings;

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
    onMarkVisited: async (location) => {
      if (state.runSession && location?.id) {
        autoCheckInRef.current?.cancelForLocation(location.id);
        const visitId = makeVisitId(state.runSession, location.id);
        const visit = createVisit({
          id: visitId,
          locationId: location.id,
          runId: state.runSession.runId,
          visitedAt: Date.now(),
          visitMethod: "manual",
        });
        await saveVisit(visit);
        markVisited(state.runSession, location.id, visitId);
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
        await saveActiveSession(state.runSession);
        shell.refreshSidePanel();
      }
    },
    onMarkUnvisited: async (location) => {
      if (!state.runSession || !location?.id) return;
      const visitId = getVisitId(state.runSession, location.id);
      markUnvisited(state.runSession, location.id);
      if (visitId) await deleteVisit(visitId);
      if (state.isDisruptionMode) {
        const map = mapController.getLeafletMap();
        const gpsPos = mapController.getGpsPosition();
        const center = gpsPos ? { lat: gpsPos.lat, lng: gpsPos.lng } : map.getCenter();
        const locations = await getLocationsForRun(state.selectedRunId);
        state.suggestionsByDirection = getNearestByCardinal(center.lat, center.lng, locations, state.runSession.visitedLocationIds);
        if (disruptionPanelInstance) disruptionPanelInstance.updateSuggestions(state.suggestionsByDirection);
      }
      refreshOperationMapRef.current?.();
      await saveActiveSession(state.runSession);
      shell.refreshSidePanel();
      const locationName = location.name ?? "location";
      showSnackbar(snackbarHost, `Marked ${locationName} as unvisited.`, {
        undoLabel: "Undo",
        duration: 5000,
        onUndo: async () => {
          if (!state.runSession) return;
          const newVisitId = makeVisitId(state.runSession, location.id);
          const visit = createVisit({
            id: newVisitId,
            locationId: location.id,
            runId: state.runSession.runId,
            visitedAt: Date.now(),
            visitMethod: "manual",
          });
          await saveVisit(visit);
          markVisited(state.runSession, location.id, newVisitId);
          if (state.isDisruptionMode) {
            const map = mapController.getLeafletMap();
            const gpsPos = mapController.getGpsPosition();
            const center = gpsPos ? { lat: gpsPos.lat, lng: gpsPos.lng } : map.getCenter();
            const locs = await getLocationsForRun(state.selectedRunId);
            state.suggestionsByDirection = getNearestByCardinal(center.lat, center.lng, locs, state.runSession.visitedLocationIds);
            if (disruptionPanelInstance) disruptionPanelInstance.updateSuggestions(state.suggestionsByDirection);
          }
          refreshOperationMapRef.current?.();
          await saveActiveSession(state.runSession);
          shell.refreshSidePanel();
        },
      });
    },
  });

  // Create map controller bound to the shell's map container.
  const mapController = createMapController(shell.getMapContainer(), {
    mode: state.mode,
    selectedRunId: state.selectedRunId,
    onLocationSelected: async (location) => {
      if (state.mode === MODES.MAINTENANCE) {
        mapController.setSelectedLocationId(location.id);
        const [runs, runLocations] = await Promise.all([
          getAllRuns(),
          getAllFromStore("runLocations"),
        ]);
        const assignedRunIds = new Set(
          (runLocations || []).filter((rl) => rl.locationId === location.id).map((rl) => rl.runId)
        );
        const openMaintenanceSheet = (loc) => {
          mapController.setSelectedLocationId(loc.id);
          const assigned = new Set(
            (runLocations || []).filter((rl) => rl.locationId === loc.id).map((rl) => rl.runId)
          );
          bottomSheet.open(loc, {
            context: "maintenance",
            runs: runs || [],
            selectedRunIds: assigned,
            allLocations: maintenanceLocationsRef.current,
            onNavigateToLocation: (nextLoc) => openMaintenanceSheet(nextLoc),
            onRunToggle: async (runId, checked) => {
              if (checked) {
                await addLocationToRun(runId, loc.id);
                const run = (runs || []).find((r) => r.id === runId);
                showSnackbar(snackbarHost, `Added to ${run?.name ?? runId}`);
              } else {
                await removeLocationFromRun(runId, loc.id);
                const run = (runs || []).find((r) => r.id === runId);
                showSnackbar(snackbarHost, `Removed from ${run?.name ?? runId}`);
              }
              if (typeof refreshMaintenanceMapRef.current === "function") {
                await refreshMaintenanceMapRef.current({ forceFitBounds: false });
              }
            },
          });
        };
        openMaintenanceSheet(location);
      }
      if (state.mode === MODES.OPERATION && !state.isDisruptionMode) {
        mapController.setSelectedLocationId(location.id);
        const [opRuns, opRunLocations] = await Promise.all([
          getAllRuns(),
          getAllFromStore("runLocations"),
        ]);
        const opAssigned = new Set(
          (opRunLocations || []).filter((rl) => rl.locationId === location.id).map((rl) => rl.runId)
        );
        bottomSheet.open(location, {
          context: "operation",
          isVisited: state.runSession?.visitedLocationIds?.has(location.id) ?? false,
          runs: opRuns || [],
          selectedRunIds: opAssigned,
          onRunToggle: async (runId, checked) => {
            if (checked) await addLocationToRun(runId, location.id);
            else await removeLocationFromRun(runId, location.id);
            if (typeof refreshOperationMapRef.current === "function") {
              await refreshOperationMapRef.current({ forceFitBounds: false });
            }
          },
        });
      }
      if (state.mode === MODES.OPERATION && state.isDisruptionMode) {
        mapController.setSelectedLocationId(location.id);
        bottomSheet.open(location, {
          context: "disruption",
          isVisited: state.runSession?.visitedLocationIds?.has(location.id) ?? false,
        });
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
        if (state.runSession && state.selectedRunId && autoCheckInSettingsRef.current?.enabled) {
          autoCheckInRef.current?.update(position);
        }
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

  async function finishRun() {
    if (!state.runSession || !state.selectedRunId) return;
    const session = state.runSession;
    const runId = state.selectedRunId;
    const visitedIds = session.visitedLocationIds;

    if (state.isDisruptionMode) {
      state.isDisruptionMode = false;
      disruptionRef.current.isDisruptionMode = false;
      if (disruptionPanelInstance) {
        disruptionPanelInstance.destroy();
        disruptionPanelInstance = null;
      }
    }
    autoCheckInRef.current?.cancelAll();

    const locations = await getLocationsForRun(runId);
    const totalCount = locations.length;
    const visitedCount = visitedIds.size;
    const runs = operationOptionsRef.current.runs || [];
    const run = runs.find((r) => r.id === runId);
    const runName = run?.name ?? runId;
    const completedAt = new Date().toISOString();
    const durationMinutes = typeof session.startedAt === "number"
      ? Math.round((Date.now() - session.startedAt) / 60000)
      : null;

    for (const locationId of visitedIds) {
      const visitId = getVisitId(session, locationId) ?? `visit-${runId}-${locationId}-${session.startedAt}`;
      const visit = createVisit({
        id: visitId,
        locationId,
        runId,
        visitedAt: Date.now(),
        visitMethod: "manual",
      });
      await saveVisit(visit);
    }

    await addRunCompletion({
      runId,
      runName,
      visitedCount,
      totalCount,
      completedAt,
      durationMinutes,
    });

    state.selectedRunId = null;
    state.runSession = null;
    operationOptionsRef.current.selectedRunId = null;
    operationOptionsRef.current.runName = "—";
    operationOptionsRef.current.visitedCount = 0;
    operationOptionsRef.current.totalCount = 0;
    try {
      localStorage.setItem(LAST_RUN_KEY, "");
    } catch (_) {}
    mapController.setRun(null);
    stopWatchingGPS();
    mapController.renderLocations([], { skipMaintenanceFilters: true, useCircleMarkers: true });

    await clearActiveSession();
    shell.setMode("dashboard");
    await refreshDashboardData();
    shell.refreshSidePanel();

    showSnackbar(snackbarHost, `Run "${runName}" completed – ${visitedCount}/${totalCount} visited`, { duration: 5000 });
  }

  async function refreshMaintenanceMap(opts = {}) {
    if (state.mode !== MODES.MAINTENANCE) return;
    const [locations, runLocations, runs] = await Promise.all([
      getAllFromStore("locations"),
      getAllFromStore("runLocations"),
      getAllRuns(),
    ]);
    const assignedLocationIds = new Set((runLocations || []).map((rl) => rl.locationId));
    const locationRunColours = buildLocationRunColours(runLocations, runs);
    const filters = state.maintenanceFilters;
    const statusFilters = { active: filters.active, archived: filters.archived, deleted: filters.deleted };
    let visible = Array.isArray(locations) ? locations : [];
    visible = visible.filter((loc) => statusFilters[loc.status] === true);
    if (filters.unassignedOnly) {
      visible = visible.filter((loc) => !assignedLocationIds.has(loc.id));
    }
    const searchQuery = (filters.searchQuery ?? "").trim().toLowerCase();
    if (searchQuery) {
      visible = visible.filter((loc) =>
        loc.name != null && String(loc.name).toLowerCase().includes(searchQuery)
      );
    }
    maintenanceLocationsRef.current = visible;
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
      locationRunColours,
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
    const [locations, runLocations, runs] = await Promise.all([
      getLocationsForRun(state.selectedRunId),
      getAllFromStore("runLocations"),
      getAllRuns(),
    ]);
    const locationRunColours = buildLocationRunColours(runLocations, runs);
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
      locationRunColours,
    });
    const run = (runs || []).find((r) => r.id === state.selectedRunId);
    operationOptionsRef.current.runs = runs || [];
    operationOptionsRef.current.runName = run?.name ?? "—";
    operationOptionsRef.current.visitedCount = visitedIds.size;
    operationOptionsRef.current.totalCount = locations.length;
  }

  function getStartOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function getEndOfToday() {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }

  function getStartOfCalendarMonth() {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function getStartOfDayDaysAgo(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function getEndOfDayDaysAgo(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }

  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  async function refreshDashboardData() {
    const [
      locations,
      runs,
      visits,
      lastRunRaw,
      visitsPerLoc,
      activeLocations,
    ] = await Promise.all([
      getAllFromStore("locations"),
      getAllFromStore("runs"),
      getAllFromStore("visits"),
      getLastRunCompletion(),
      getVisitsPerLocation(),
      getAllActiveLocations(),
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
    let lastRun = lastRunRaw;
    let lastRunResumable = false;
    if (lastRun?.runId) {
      const runExists = await getEntity("runs", lastRun.runId);
      if (!runExists) lastRun = null;
      else lastRunResumable = true;
    }

    const now = Date.now();
    const startToday = getStartOfToday();
    const endToday = getEndOfToday();
    const startWeek = getStartOfDayDaysAgo(6);
    const startMonth = getStartOfCalendarMonth();

    const [visitsToday, visitsThisWeek, visitsThisMonth] = await Promise.all([
      getVisitsCountInDateRange(startToday, endToday),
      getVisitsCountInDateRange(startWeek, endToday),
      getVisitsCountInDateRange(startMonth, endToday),
    ]);

    let mostVisited = null;
    let leastVisited = null;
    if (visitsPerLoc.length > 0) {
      const most = visitsPerLoc[0];
      const mostLoc = await getEntity("locations", most.locationId);
      mostVisited = { name: mostLoc?.name ?? most.locationId, count: most.count };
      const withVisits = visitsPerLoc.filter((p) => p.count > 0);
      const leastEntry = withVisits.length > 0 ? withVisits[withVisits.length - 1] : null;
      if (leastEntry) {
        const leastLoc = await getEntity("locations", leastEntry.locationId);
        leastVisited = { name: leastLoc?.name ?? leastEntry.locationId, count: leastEntry.count };
      }
    }

    const DUE_DAYS = 30;
    const dueThreshold = DUE_DAYS * 24 * 60 * 60 * 1000;
    const lastVisitByLocation = new Map();
    for (const v of visits || []) {
      const id = v.locationId;
      const at = v.visitedAt != null ? Number(v.visitedAt) : 0;
      const existing = lastVisitByLocation.get(id);
      if (existing == null || at > existing) lastVisitByLocation.set(id, at);
    }
    let dueForServiceCount = 0;
    for (const loc of activeLocations) {
      const lastAt = lastVisitByLocation.get(loc.id);
      if (lastAt == null || now - lastAt > dueThreshold) dueForServiceCount += 1;
    }

    const visitsPerDayLast7 = [];
    const dayBuckets = new Map();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const startOfDay = d.getTime();
      dayBuckets.set(startOfDay, { dayLabel: DAY_LABELS[d.getDay()], count: 0 });
    }
    const dayStarts = Array.from(dayBuckets.keys()).sort((a, b) => a - b);
    for (const v of visits || []) {
      const t = v.visitedAt != null ? Number(v.visitedAt) : 0;
      const visitDate = new Date(t);
      visitDate.setHours(0, 0, 0, 0);
      const startOfDay = visitDate.getTime();
      if (dayBuckets.has(startOfDay)) {
        dayBuckets.get(startOfDay).count += 1;
      }
    }
    for (const start of dayStarts) {
      visitsPerDayLast7.push(dayBuckets.get(start));
    }

    dashboardDataRef.current = {
      ...dashboardDataRef.current,
      activeCount,
      runsCount,
      lastVisitText,
      lastRun,
      lastRunResumable,
      stats: {
        visitsToday,
        visitsThisWeek,
        visitsThisMonth,
        mostVisited,
        leastVisited,
        dueForServiceCount,
        visitsPerDayLast7,
      },
      onGoToMaintenance: () => shell.setMode("maintenance"),
      onGoToOperation: () => shell.setMode("operation"),
      onResumeLastRun: resumeLastRun,
      onOpenRunManagement: openRunManagement,
      onOpenRunHistory: openRunHistory,
    };
  }

  async function openRunHistory() {
    const completions = await getAllCompletions(500);
    const host = shell.getRunHistoryHost();
    host._onBackdropClick = (e) => { if (e.target === host) closeRunHistory(); };
    host.addEventListener("click", host._onBackdropClick);
    runHistoryPanelInstance = createRunHistoryPanel(host, {
      completions,
      onClose: closeRunHistory,
      onRunClick: openRunDetail,
    });
  }

  function closeRunHistory() {
    const host = shell.getRunHistoryHost();
    if (host._onBackdropClick) {
      host.removeEventListener("click", host._onBackdropClick);
    }
    if (runHistoryPanelInstance) {
      runHistoryPanelInstance.destroy();
      runHistoryPanelInstance = null;
    }
    host.setAttribute("aria-hidden", "true");
  }

  async function openRunDetail(completion) {
    if (!completion?.runId) return;
    const [locations, visits] = await Promise.all([
      getLocationsForRun(completion.runId),
      getVisitsForRun(completion.runId),
    ]);
    const visitedLocationIds = new Set((visits || []).map((v) => v.locationId));
    const host = shell.getRunDetailHost();
    host._onBackdropClick = (e) => { if (e.target === host) closeRunDetail(); };
    host.addEventListener("click", host._onBackdropClick);
    runDetailPanelInstance = createRunDetailPanel(host, {
      completion,
      locations: locations || [],
      visitedLocationIds,
      onClose: closeRunDetail,
    });
  }

  function closeRunDetail() {
    const host = shell.getRunDetailHost();
    if (host._onBackdropClick) {
      host.removeEventListener("click", host._onBackdropClick);
    }
    if (runDetailPanelInstance) {
      runDetailPanelInstance.destroy();
      runDetailPanelInstance = null;
    }
    host.setAttribute("aria-hidden", "true");
  }

  async function resumeLastRun() {
    const lastRun = await getLastRunCompletion();
    if (!lastRun?.runId) {
      showSnackbar(snackbarHost, "No run to resume");
      return;
    }
    const run = await getEntity("runs", lastRun.runId);
    if (!run) {
      showSnackbar(snackbarHost, "Run no longer exists");
      await refreshDashboardData();
      if (state.mode === MODES.DASHBOARD) shell.refreshSidePanel();
      return;
    }
    operationOptionsRef.current.onRunSelect(lastRun.runId);
    shell.setMode("operation");
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
  onImportSuccessRef.current = async () => {
    await refreshMaintenanceMap();
    await refreshDashboardData();
    if (state.mode === MODES.DASHBOARD) shell.refreshSidePanel();
  };
  operationOptionsRef.current.onFinishRun = finishRun;

  refreshDashboardData().then(() => {
    if (state.mode === MODES.DASHBOARD) shell.refreshSidePanel();
  });
}

