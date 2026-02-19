# Architectural Patterns

Patterns that appear across multiple files in the codebase.

---

## 1. Callback Refs (Observer Without an Event Bus)

**Where:** `src/app/app.js`, `src/ui/layout.js`, `src/ui/bottomSheet.js`, `src/ui/settingsPanel.js`

Parent creates plain objects `{ current: null }` and passes them into child components. Children invoke `ref.current(...)` when something happens; the parent assigns the actual function later. This avoids circular imports and re-mounting while still letting the parent react to child events.

```
// app.js creates the ref
const refreshMaintenanceMapRef = { current: null };

// layout.js stores a callback into it
maintenanceFilterOptionsRef.current = { ..., onFilterChange: () => { ... } };

// app.js assigns the implementation after layout is set up
refreshMaintenanceMapRef.current = refreshMaintenanceMap;
```

Key refs in `app.js`: `onImportSuccessRef`, `refreshMaintenanceMapRef`, `refreshOperationMapRef`, `maintenanceFilterOptionsRef`, `operationOptionsRef`.

---

## 2. Domain Factory Functions

**Where:** `src/domain/locationModel.js`, `src/domain/runModel.js`, `src/domain/visitModel.js`, `src/domain/runCompletion.js`, `src/domain/activeSession.js`

Each domain module exports named `create*` or `save*` functions rather than classes. They return plain objects; persistence is delegated to the storage layer. Business logic (e.g. deriving status, computing duration) lives here, not in UI or storage.

Pattern:
1. `create*(data)` — normalise/validate, return plain object
2. `save*(entity)` — call `putEntity(store, entity)` from the storage wrapper
3. `getAll*()` / `get*For*(id)` — query IndexedDB, return typed results

---

## 3. Thin Storage Wrapper

**Where:** `src/storage/indexedDb.js` consumed by every domain module

A small set of generic helpers (`putEntity`, `getEntity`, `getAllFromStore`, `bulkUpsert`, `countStore`) wraps the raw IndexedDB API. Domain models always go through this wrapper; they never open transactions directly.

This isolates schema details (store names, index names) in one place. Schema migrations are handled by the `onupgradeneeded` callback in `initStorage()`.

---

## 4. Mode-Based Filter Pipeline

**Where:** `src/map/mapController.js` (`renderLocations`), `src/app/app.js` (`refreshMaintenanceMap`, `refreshOperationMap`)

Filtering is applied as a sequential chain of `.filter()` predicates, each narrowing the set:

- **Maintenance path:** `status → unassignedOnly → searchQuery` (case-insensitive name match)
- **Operation path:** `skipMaintenanceFilters: true` skips the above; uses `visitedLocationIds` Set to decide marker style

The caller passes an options object; `renderLocations` branches on `opts.skipMaintenanceFilters` to choose the path. Adding a new filter means inserting one more `.filter()` call in the chain.

---

## 5. View / Edit Mode Toggle (No Re-mount)

**Where:** `src/ui/bottomSheet.js`

The sheet has two render functions (`renderViewMode`, `renderEditMode`). Switching modes replaces `innerHTML` of the content container and re-attaches event listeners. The sheet element itself is never removed from the DOM; only its content changes.

This pattern avoids the cost of destroying and recreating the panel element while keeping the two modes visually and logically separate.

---

## 6. Single Map Instance

**Where:** `src/map/initMap.js`, `src/map/mapController.js`

`initMap(container)` creates one `L.map` and one `L.featureGroup` for the lifetime of the app. Mode changes and run changes never call `map.remove()` or re-create the map. Instead, `featureGroup.clearLayers()` is called and markers are rebuilt from the current data.

`setMode(mode)` and `setRun(runId)` on the map controller store state for future calls; they do not trigger a re-render themselves.

The run detail panel (`src/ui/runDetail.js`) is the only exception — it creates and destroys its own separate mini Leaflet map for the historical view.

---

## 7. Ref-Based State Sharing Between Shell and App

**Where:** `src/ui/layout.js`, `src/app/app.js`

`layout.js` receives `maintenanceFilterOptionsRef` and `operationOptionsRef` on creation. When the app needs to update what the shell displays (e.g. visited count, run name, filter state), it mutates `ref.current` then calls a layout method (`refreshSidePanel`, `updateHeaderOperation`). The shell reads from the ref at render time rather than holding its own copy of the data.

This keeps layout stateless with respect to domain data — it is purely a render function over the ref values the app provides.

---

## 8. Soft Delete with Undo

**Where:** `src/domain/locationModel.js`, `src/ui/bottomSheet.js`, `src/ui/snackbar.js`

Destructive actions (archive, delete) set `location.status` rather than removing the record. The snackbar is shown with an `onUndo` callback that reverts the status and refreshes the map. This pattern requires no transaction log; the record itself holds enough state to reverse the action.

Status lifecycle: `active` ↔ `archived`, `active` → `deleted` (recoverable via filter + undo).
