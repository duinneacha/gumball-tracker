# Gumball Tracker — System Summary

**Purpose:** A single-page web app for Arundel to manage service locations (e.g. from Garmin waypoints), organise them into runs, and track which stops have been visited during a servicing session. Built for field/van use; mobile-first with tablet support. Supports run completion and session lifecycle (PRD V2.1).

**Audience:** For AI (e.g. DeepSeek) or new developers needing a full picture of the codebase, data model, modes, and implemented features.

---

## 1. Tech Stack & Structure

- **Runtime:** Browser only; no Node server.
- **Build:** Vite 7, ES modules throughout.
- **Map:** Leaflet 1.9.x; single map instance; no clustering.
- **Storage:** IndexedDB via a thin wrapper (`src/storage/indexedDb.js`). No backend or sync.
- **PWA:** vite-plugin-pwa (optional; precache, service worker).

**Directory layout:**

```
src/
  main.js              # Entry: DOMContentLoaded → createApp(#app)
  style.css            # Global + component styles
  app/
    app.js             # Root controller: storage init, shell, map, bottom sheet, modes
  map/
    initMap.js         # L.map init, tile layer, default icon URLs
    mapController.js   # featureGroup, renderLocations, marker styling, setMode/setRun
  ui/
    layout.js          # Shell: header, mode tabs, map container, side panel, run selector, maintenance filter bar
    bottomSheet.js     # Sliding panel (mobile) / side panel (tablet): view/edit, Maintenance vs Operation actions
    snackbar.js        # Toast with optional undo
    shared/
      fab.js           # Floating action button (e.g. Disruption — placeholder)
  domain/
    locationModel.js   # createLocation, softDelete, restore, archive, restoreFromArchive, saveLocation, getAllLocations
    runModel.js        # createRun, saveRun, getAllRuns, getLocationsForRun(runId)
    runSession.js      # In-memory session: createRunSession(runId), markVisited, markUnvisited, isVisited; startedAt
    visitModel.js      # createVisit, saveVisit, getAllVisits (visitMethod: auto | manual)
  storage/
    indexedDb.js       # initStorage, getDb, putEntity, getEntity, getAllFromStore, bulkUpsert, countStore
    seed.js            # First-run seed, waypointToLocation, generateLocationId, importFromJson
    backup.js          # exportAllData, importData (locations, runs, runLocations, visits)
```

No router; one shell. State is in `app.js` and refs passed into layout/UI.

---

## 2. Data Model & IndexedDB

**Database:** `gumball-tracker`, version 3.

| Store          | Key   | Purpose |
|----------------|-------|--------|
| **locations**  | `id`  | One per physical stop. Fields: id, latitude, longitude, name, serviceFrequency, productType, notes, **status** (`"active"` \| `"archived"` \| `"deleted"`). Index: `status`. |
| **runs**       | `id`  | Named routes. Fields: id, name, active. |
| **runLocations** | `id` | Many-to-many run ↔ location. Fields: id, runId, locationId. Indexes: runId, locationId. |
| **visits**     | `id`  | Historical visit records. Fields: id, locationId, runId, visitedAt, visitMethod. Indexes: locationId, runId, visitedAt. |
| **runCompletions** | `id` | Last completed run (PRD V2.1). Fields: id ("last"), runId, runName, visitedCount, totalCount, completedAt. |

**Location status (PRD V1.7):**

- **active** — Shown in Operation (when in a run) and in Maintenance by default.
- **archived** — Hidden from default views; can be shown via Maintenance filter; editable.
- **deleted** — Soft delete; can be shown via Maintenance filter; recoverable.

**Run session (in-memory only, PRD V1.8):**

- Created when user selects a run in Operation mode.
- Holds: `runId`, `visitedLocationIds: Set<string>`, `startedAt`.
- Not persisted; reset when switching runs. Visits store is for future persistence of visits.

---

## 3. Application Modes

Three modes, selected by header tabs (and in Maintenance, a floating ⚙️ button):

1. **Maintenance** — Manage locations: filter (Active/Archived/Deleted, unassigned only, search), open marker → bottom sheet (Edit / Archive / Delete), import seed or backup JSON, export backup JSON. Map shows circle markers; filters apply (status → unassigned → search).
2. **Operation** — Run-based fieldwork: select run from header dropdown, map shows only that run’s (active) locations. Tap marker → sheet with “Mark Visited”. Visited markers styled grey; progress “Run: {name} | {visited} / {total} visited” in side panel. Last selected run id in `localStorage` (`gumball-lastRunId`); placeholder “Resume last run” when set.
3. **Dashboard** — Placeholder; no behaviour yet.

Mode is stored in app state; switching modes updates map and side panel (and in Operation, run selector). Map instance is never re-created; only the feature group is cleared/refilled.

---

## 4. Map Controller (`src/map/mapController.js`)

- **Single Leaflet map** created in `initMap(container)`; one **feature group** for location markers.
- **renderLocations(locations, opts)**:
  - **Maintenance path:** Uses `opts.statusFilters`, `opts.unassignedOnly`, `opts.searchQuery`, `opts.assignedLocationIds`. Filters in that order; only locations passing all filters are rendered.
  - **Operation path:** Uses `opts.skipMaintenanceFilters: true` and `opts.visitedLocationIds` (Set). No status/unassigned/search filters; markers for ids in `visitedLocationIds` are styled as visited (grey fill, lower opacity).
- Markers are **circle markers** (L.circleMarker) in both modes: radius 6 (hover 7), orange default; visited = grey (#9ca3af), fillOpacity 0.65. Selected (sheet open) = heavier stroke/orange.
- **setSelectedLocationId(id)** — Updates style of the marker currently “selected” (bottom sheet open); used for highlight only.
- **setMode(mode)** / **setRun(runId)** — Stored for future use; map does not re-create on change.

No GPS, no clustering, no new dependencies.

---

## 5. Layout & UI (`src/ui/layout.js`)

- **Shell:** Header (title + run selector when Operation + mode tabs), main (map container + side panel), snackbar host, bottom-sheet host. FAB appended to root (Disruption placeholder).
- **Run selector (Operation only):** `<select class="run-select">` built from `operationOptionsRef.current` (runs, selectedRunId, resumeRunId, onRunSelect). Shown/hidden via `updateHeaderOperation()` when mode is Operation.
- **Maintenance panel:** Filter bar (status chips Active/Archived/Deleted, “Unassigned only” checkbox, search input), Import seed/backup, Export Backup JSON, status message. Content driven by `maintenanceFilterOptionsRef.current`.
- **Operation panel:** Single line: “Run: {runName} | {visitedCount} / {totalCount} visited” from `operationOptionsRef.current`.
- **Floating Maintenance button:** Top-right over map; toggles between Operation and Maintenance; syncs with header tabs.

Refs (`maintenanceFilterOptionsRef`, `operationOptionsRef`) are passed in so the shell can read current state without the app re-mounting the layout.

---

## 6. Bottom Sheet (`src/ui/bottomSheet.js`)

- **Mobile:** Sliding panel from bottom (max-height 70%); **tablet (≥768px):** content in side panel.
- **open(location, openOptions):**
  - **context: 'maintenance'** (default): View mode shows Location details, Runs (checkbox list to assign/unassign), Edit/Archive/Delete. Edit mode: form (name, serviceFrequency, productType, notes) → Save/Cancel. (PRD V2.2)
  - **context: 'operation'**: View mode shows only **Mark Visited**; no Edit/Archive/Delete.
- Callbacks: `onClose`, `onSave`, `onArchive`, `onDelete`, `onMarkVisited`. Archive/Delete trigger snackbar with Undo; Mark Visited updates run session and refreshes Operation map.

---

## 7. App Flow (`src/app/app.js`)

- **createApp(rootElement):**
  - State: `mode`, `selectedRunId`, `runSession`, `maintenanceFilters` (active, archived, deleted, unassignedOnly, searchQuery).
  - Refs: `onImportSuccessRef`, `refreshMaintenanceMapRef`, `refreshOperationMapRef`, `maintenanceFilterOptionsRef`, `operationOptionsRef`.
  - **initStorage()** → first-run seed (if locations empty) → **getAllRuns()** → fill `operationOptionsRef` (runs, resumeRunId from localStorage) → **updateHeaderOperation()**; if mode is Operation, **refreshOperationMap()**.
  - **refreshMaintenanceMap():** Loads locations + runLocations, applies filters, calls `mapController.renderLocations(..., { statusFilters, unassignedOnly, searchQuery, assignedLocationIds })`.
  - **refreshOperationMap():** If no run selected: clear map, set progress 0/0. If run selected: **getLocationsForRun(runId)** → `renderLocations(locations, { skipMaintenanceFilters: true, visitedLocationIds })`; then update `operationOptionsRef` (runName, visitedCount, totalCount).
  - **onRunSelect(runId):** Set `selectedRunId`, `runSession = runId ? createRunSession(runId) : null`, persist to localStorage, then refreshOperationMap, updateHeaderOperation, refreshSidePanel.
  - **onMarkVisited(location):** `markVisited(state.runSession, location.id)`, refreshOperationMap, refreshSidePanel; sheet closes in callback.
  - **onClose (sheet):** Clear selected marker; in Operation, call refreshOperationMap so visited styling is correct.

**getLocationsForRun(runId)** (in runModel): Reads runLocations + locations from IndexedDB; returns locations linked to the run with status `"active"` (or missing status).

---

## 8. Implemented PRD Addenda (Summary)

- **V1.6 — UX: Marker feedback & mobile Maintenance**
  - Marker hover: pointer cursor, scale/outline; tap brief highlight; selected state when sheet open.
  - Floating Maintenance button (top-right) for mobile; header tabs kept for desktop.
  - `.leaflet-interactive { cursor: pointer }`; marker styles in mapController.

- **V1.7 — Archive, filters, backup export**
  - Location status: `active` | `archived` | `deleted`. Archive in sheet (primary); Delete secondary; Undo for both.
  - Maintenance filter bar: status chips, Unassigned only, search (name, case-insensitive).
  - Map filters applied in order: status → unassigned → search.
  - Export Backup JSON → `gumball-backup-YYYYMMDD.json` (exportAllData: locations, runs, runLocations, visits).

- **V1.8 — Operation mode foundations**
  - Run selector in header (Operation only); last run in localStorage; “Resume last run” placeholder.
  - Run session in memory (createRunSession, markVisited); no IndexedDB for session.
  - Map shows only run’s locations (getLocationsForRun); visited markers grey/low opacity.
  - Sheet in Operation: “Mark Visited” only; progress “Run: name | visited / total” in side panel.

---

## 9. Conventions & Constraints

- **No new dependencies** beyond Leaflet and build tooling; no GPS in this version.
- **Single map instance;** only the feature group is cleared/refilled on refresh.
- **IndexedDB** is the only persistence for locations, runs, runLocations, visits; run session is in-memory only.
- **No router;** all state in app and refs. Side panel and header areas are updated via `refreshSidePanel()` and `updateHeaderOperation()`.
- **Tablet breakpoint:** 768px (bottom sheet content in side panel; layout row).
- **Ids:** Locations use deterministic ids from seed (e.g. SHA-1 of name|lat|lon) or explicit id on import.

---

## 10. File Quick Reference

| File | Role |
|------|------|
| `main.js` | Entry; createApp(#app) on DOMContentLoaded |
| `app/app.js` | State, refs, shell, mapController, bottomSheet, refreshMaintenanceMap, refreshOperationMap, onRunSelect, onMarkVisited, init chain |
| `map/initMap.js` | L.map, tiles, L.Icon.Default |
| `map/mapController.js` | renderLocations (Maintenance + Operation), setSelectedLocationId, setMode, setRun |
| `ui/layout.js` | Shell, header (run selector when Operation), filter bar + import/export when Maintenance, side panel, updateHeaderOperation |
| `ui/bottomSheet.js` | open(location, { context }), view/edit, Maintenance vs Operation actions |
| `ui/snackbar.js` | showSnackbar(host, text, { undoLabel, duration, onUndo }) |
| `domain/locationModel.js` | createLocation, softDelete, restore, archive, restoreFromArchive, saveLocation, getAllLocations |
| `domain/runModel.js` | createRun, saveRun, getAllRuns, getLocationsForRun, addLocationToRun, removeLocationFromRun, getRunsForLocation |
| `domain/runSession.js` | createRunSession, markVisited, markUnvisited, isVisited (in-memory) |
| `domain/visitModel.js` | createVisit, saveVisit, getAllVisits |
| `domain/runCompletion.js` | saveLastRunCompletion, getLastRunCompletion |
| `storage/indexedDb.js` | initStorage, putEntity, getEntity, getAllFromStore, bulkUpsert |
| `storage/seed.js` | First-run seed, waypointToLocation, importFromJson |
| `storage/backup.js` | exportAllData, importData |

This document is the single source of truth for high-level architecture and behaviour for onboarding or AI-assisted work (e.g. DeepSeek).
