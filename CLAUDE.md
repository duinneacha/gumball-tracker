# Gumball Tracker

A mobile-first PWA for field technicians to manage service locations, organise them into named routes ("runs"), and track which stops have been visited during a servicing session. Offline-first; no backend.

## Tech Stack

- **Build:** Vite 7, ES modules throughout
- **Map:** Leaflet 1.9.x — single instance, no clustering
- **Storage:** IndexedDB (browser-native, no sync) via thin wrapper at `src/storage/indexedDb.js`
- **PWA:** vite-plugin-pwa (service worker, precache)
- **JS:** Vanilla ES6+ — no framework

## Key Directories

| Path | Purpose |
|------|---------|
| `src/app/app.js` | Root controller: storage init, mode switching, session management, all cross-cutting callbacks |
| `src/domain/` | Business logic and domain factories (location, run, visit, session, completion) |
| `src/map/` | Leaflet initialisation and map controller (marker rendering, filtering, selection) |
| `src/ui/` | View components: layout shell, bottom sheet, dashboard, panels, snackbar |
| `src/storage/` | IndexedDB wrapper, first-run seed, backup export/import |
| `src/utils/geo.js` | Haversine distance, bearing, and cardinal direction calculations |

## Application Modes

Three modes switched via header tabs (state lives in `app.js`):

- **Dashboard** — Stats, resume last run, run history/detail panels
- **Maintenance** — Manage locations: filter, assign to runs, edit, archive, import/export
- **Operation** — Fieldwork: select a run, tap markers to mark visited, finish run

## Data Model (IndexedDB `gumball-tracker`)

Stores: `locations`, `runs`, `runLocations` (many-to-many), `visits`, `runCompletions`, `activeSessions`, `settings`

Location status: `active` | `archived` | `deleted` (soft delete throughout; Undo on archive/delete).

Active run session persisted to `activeSessions` on every change; resume prompt shown on app load.

## Build Commands

```bash
npm run dev       # Vite dev server with HMR
npm run build     # Production build → dist/
npm run preview   # Preview the production build
```

No test framework is configured.

## Entry Point Flow

`index.html` → `src/main.js` → `createApp(#app)` → `initStorage()` → seed if empty → load runs → render shell → default to Dashboard mode.

## Key File References

- App state and mode orchestration: `src/app/app.js:1`
- Shell layout (header, tabs, side panel): `src/ui/layout.js:1`
- Map marker rendering and filtering: `src/map/mapController.js:1`
- Bottom sheet (view/edit, maintenance vs operation context): `src/ui/bottomSheet.js:1`
- IndexedDB CRUD wrapper: `src/storage/indexedDb.js:1`
- Run session (in-memory): `src/domain/runSession.js:1`
- Auto check-in (GPS proximity + dwell timer): `src/domain/autoCheckIn.js:1`
- Existing system documentation: `SYSTEM_SUMMARY.md`

## Additional Documentation

- `.claude/docs/architectural_patterns.md` — Patterns repeated across the codebase: callback refs, domain factories, filter pipeline, view/edit toggle, single map instance, ref-based state sharing
