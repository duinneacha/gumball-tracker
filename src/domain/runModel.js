// Run domain helpers.

import { putEntity, getAllFromStore, deleteEntity } from "../storage/indexedDb.js";

export function createRun({ id, name, active = true }) {
  return { id, name, active };
}

export async function saveRun(run) {
  await putEntity("runs", run);
  return run;
}

export async function getAllRuns() {
  return getAllFromStore("runs");
}

/**
 * Get full location objects for a run (active only). Uses runLocations links.
 * @param {string} runId
 * @returns {Promise<Array<{ id: string, latitude: number, longitude: number, name?: string, status: string }>>}
 */
export async function getLocationsForRun(runId) {
  const [runLocations, allLocations] = await Promise.all([
    getAllFromStore("runLocations"),
    getAllFromStore("locations"),
  ]);
  const locationIds = new Set(
    (runLocations || []).filter((rl) => rl.runId === runId).map((rl) => rl.locationId)
  );
  return (allLocations || []).filter(
    (loc) => locationIds.has(loc.id) && (loc.status === "active" || !loc.status)
  );
}

/**
 * Get run IDs that a location is assigned to (PRD V2.2).
 * @param {string} locationId
 * @returns {Promise<Set<string>>}
 */
export async function getRunsForLocation(locationId) {
  const runLocations = await getAllFromStore("runLocations");
  const ids = new Set(
    (runLocations || []).filter((rl) => rl.locationId === locationId).map((rl) => rl.runId)
  );
  return ids;
}

const runLocationId = (runId, locationId) => `rl-${runId}-${locationId}`;

/**
 * Add a location to a run. Idempotent: if link exists, no-op (PRD V2.2).
 * @param {string} runId
 * @param {string} locationId
 */
export async function addLocationToRun(runId, locationId) {
  const record = {
    id: runLocationId(runId, locationId),
    runId,
    locationId,
  };
  await putEntity("runLocations", record);
}

/**
 * Remove a location from a run (PRD V2.2).
 * @param {string} runId
 * @param {string} locationId
 */
export async function removeLocationFromRun(runId, locationId) {
  await deleteEntity("runLocations", runLocationId(runId, locationId));
}

/**
 * Create a new run with an auto-generated ID (PRD V2.3).
 * @param {string} name - Run name (required)
 * @returns {Promise<{ id: string, name: string, active: boolean }>}
 */
export async function createRunFromName(name) {
  const id = `run-${Date.now()}`;
  const run = createRun({ id, name: String(name).trim(), active: true });
  await saveRun(run);
  return run;
}

/**
 * Update a run's name (PRD V2.3).
 * @param {string} runId
 * @param {string} newName
 */
export async function updateRun(runId, newName) {
  const runs = await getAllFromStore("runs");
  const run = (runs || []).find((r) => r.id === runId);
  if (!run) return;
  const updated = { ...run, name: String(newName).trim() };
  await putEntity("runs", updated);
}

/**
 * Delete a run and all its runLocations links (PRD V2.3).
 * @param {string} runId
 */
export async function deleteRunAndLinks(runId) {
  const runLocations = await getAllFromStore("runLocations");
  const toDelete = (runLocations || []).filter((rl) => rl.runId === runId);
  for (const rl of toDelete) {
    await deleteEntity("runLocations", rl.id);
  }
  await deleteEntity("runs", runId);
}

/**
 * Get all runs with computed location count (PRD V2.3).
 * @returns {Promise<Array<{ id: string, name: string, active: boolean, locationCount: number }>>}
 */
export async function getAllRunsWithLocationCount() {
  const [runs, runLocations] = await Promise.all([
    getAllFromStore("runs"),
    getAllFromStore("runLocations"),
  ]);
  const countByRun = {};
  (runLocations || []).forEach((rl) => {
    countByRun[rl.runId] = (countByRun[rl.runId] || 0) + 1;
  });
  return (runs || []).map((r) => ({
    ...r,
    locationCount: countByRun[r.id] || 0,
  }));
}

