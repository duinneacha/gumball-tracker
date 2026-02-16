// Run domain helpers.

import { putEntity, getAllFromStore } from "../storage/indexedDb.js";

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

