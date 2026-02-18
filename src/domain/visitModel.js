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

/**
 * Get count of visits with visitedAt in [startDate, endDate] (inclusive).
 * Dates are in local time (start/end of day as needed by caller).
 * @param {number} startDate - timestamp (ms)
 * @param {number} endDate - timestamp (ms)
 * @returns {Promise<number>}
 */
export async function getVisitsCountInDateRange(startDate, endDate) {
  const all = await getAllFromStore("visits");
  if (!all || all.length === 0) return 0;
  return all.filter((v) => {
    const t = v.visitedAt != null ? Number(v.visitedAt) : 0;
    return t >= startDate && t <= endDate;
  }).length;
}

/**
 * Get visits grouped by location, sorted by count descending.
 * @param {number} [limit] - optional limit (e.g. 100)
 * @returns {Promise<Array<{ locationId: string, count: number }>>}
 */
export async function getVisitsPerLocation(limit) {
  const all = await getAllFromStore("visits");
  if (!all || all.length === 0) return [];
  const byLocation = new Map();
  for (const v of all) {
    const id = v.locationId;
    if (!id) continue;
    byLocation.set(id, (byLocation.get(id) || 0) + 1);
  }
  const arr = Array.from(byLocation.entries()).map(([locationId, count]) => ({ locationId, count }));
  arr.sort((a, b) => b.count - a.count);
  if (typeof limit === "number" && limit > 0) return arr.slice(0, limit);
  return arr;
}

/**
 * Get the most recent visit for a location (by visitedAt).
 * @param {string} locationId
 * @returns {Promise<{ id: string, locationId: string, visitedAt: number } | null>}
 */
export async function getLastVisitForLocation(locationId) {
  const all = await getAllFromStore("visits");
  const forLoc = (all || []).filter((v) => v.locationId === locationId);
  if (forLoc.length === 0) return null;
  forLoc.sort((a, b) => (b.visitedAt || 0) - (a.visitedAt || 0));
  return forLoc[0];
}

