// Visit domain helpers and utilities for computing daily/session statistics.

import { putEntity, getAllFromStore, deleteEntity } from "../storage/indexedDb.js";

export function createVisit({ id, locationId, runId = null, visitedAt, visitMethod }) {
  return {
    id,
    locationId,
    runId,
    visitedAt,
    visitMethod, // "auto" | "manual"
  };
}

export async function saveVisit(visit) {
  await putEntity("visits", visit);
  return visit;
}

export async function getAllVisits() {
  return getAllFromStore("visits");
}

/**
 * Get all visits for a run (PRD V2.8). Used for run detail view to determine visited locations.
 * @param {string} runId
 * @returns {Promise<Array<{ id: string, locationId: string, runId: string, visitedAt: number }>>}
 */
export async function getVisitsForRun(runId) {
  const all = await getAllFromStore("visits");
  return (all || []).filter((v) => v.runId === runId);
}

/**
 * Delete a visit record by ID (PRD V2.5). Idempotent – no-op if visit doesn't exist.
 * @param {string} visitId
 */
export async function deleteVisit(visitId) {
  await deleteEntity("visits", visitId);
}

