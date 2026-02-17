// Run Session: in-memory representation of visited state for a given run
// during the current work session. Persisted visits live in IndexedDB; this
// module focuses on the "visited this session" view. (PRD V1.8, V2.5)

export function createRunSession(runId) {
  return {
    runId,
    visitedLocationIds: new Set(),
    visitIdsByLocation: new Map(), // locationId → visitId (PRD V2.5)
    startedAt: Date.now(),
  };
}

/**
 * Mark a location as visited and store its visit ID for later deletion on unmark.
 * @param {object} session
 * @param {string} locationId
 * @param {string} [visitId] - If provided, stored for unmark; if not, caller manages visit ID separately.
 */
export function markVisited(session, locationId, visitId = null) {
  session.visitedLocationIds.add(locationId);
  if (visitId) session.visitIdsByLocation.set(locationId, visitId);
}

export function markUnvisited(session, locationId) {
  session.visitedLocationIds.delete(locationId);
  session.visitIdsByLocation.delete(locationId);
}

export function isVisited(session, locationId) {
  return session.visitedLocationIds.has(locationId);
}

export function getVisitId(session, locationId) {
  return session.visitIdsByLocation.get(locationId) ?? null;
}

/**
 * Generate a deterministic visit ID for a location in this session.
 */
export function makeVisitId(session, locationId) {
  return `visit-${session.runId}-${locationId}-${session.startedAt}`;
}

/**
 * Reconstruct a session from persisted storage (PRD V2.6).
 * @param {{ runId: string, visitedLocationIds: string[], startedAt: string | number }} data
 * @returns {object} Session with Set and Map
 */
export function sessionFromStorage(data) {
  if (!data?.runId) return null;
  const startedAt = typeof data.startedAt === "string"
    ? new Date(data.startedAt).getTime()
    : Number(data.startedAt) || Date.now();
  const visitedLocationIds = new Set(Array.isArray(data.visitedLocationIds) ? data.visitedLocationIds : []);
  const visitIdsByLocation = new Map();
  if (data.visitIdsByLocation && typeof data.visitIdsByLocation === "object") {
    Object.entries(data.visitIdsByLocation).forEach(([locId, visitId]) => {
      visitIdsByLocation.set(locId, visitId);
    });
  } else {
    visitedLocationIds.forEach((locId) => {
      const sessionLike = { runId: data.runId, startedAt };
      visitIdsByLocation.set(locId, makeVisitId(sessionLike, locId));
    });
  }
  return {
    runId: data.runId,
    visitedLocationIds,
    visitIdsByLocation,
    startedAt,
  };
}

