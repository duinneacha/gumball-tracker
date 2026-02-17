// Active session persistence (PRD V2.6): persist in-progress run for resume after reload.

import { putEntity, getEntity, deleteEntity } from "../storage/indexedDb.js";

const ACTIVE_SESSION_KEY = "current";

/**
 * Save the current active session to IndexedDB.
 * @param {{ runId: string, visitedLocationIds: string[], startedAt: number, visitIdsByLocation?: object }} session
 */
export async function saveActiveSession(session) {
  const visitedArray = Array.from(session.visitedLocationIds ?? []);
  const visitIdsMap = session.visitIdsByLocation instanceof Map
    ? Object.fromEntries(session.visitIdsByLocation)
    : (session.visitIdsByLocation ?? {});
  const startedAt = typeof session.startedAt === "number"
    ? new Date(session.startedAt).toISOString()
    : String(session.startedAt ?? new Date().toISOString());
  const record = {
    id: ACTIVE_SESSION_KEY,
    runId: session.runId,
    visitedLocationIds: visitedArray,
    visitIdsByLocation: visitIdsMap,
    startedAt,
    lastUpdatedAt: new Date().toISOString(),
  };
  await putEntity("activeSessions", record);
}

/**
 * Load the active session from IndexedDB, or null if none.
 * @returns {Promise<{ runId: string, visitedLocationIds: string[], startedAt: string, visitIdsByLocation?: object } | null>}
 */
export async function loadActiveSession() {
  try {
    const record = await getEntity("activeSessions", ACTIVE_SESSION_KEY);
    return record ?? null;
  } catch {
    return null;
  }
}

/**
 * Delete the persisted active session.
 */
export async function clearActiveSession() {
  await deleteEntity("activeSessions", ACTIVE_SESSION_KEY);
}
