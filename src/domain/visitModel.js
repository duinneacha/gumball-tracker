// Visit domain helpers and utilities for computing daily/session statistics.

import { putEntity, getAllFromStore } from "../storage/indexedDb.js";

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

