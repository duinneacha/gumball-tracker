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

