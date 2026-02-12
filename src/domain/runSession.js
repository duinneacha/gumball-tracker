// Run Session: in-memory representation of visited state for a given run
// during the current work session. Persisted visits live in IndexedDB; this
// module focuses on the \"visited this session\" view.

export function createRunSession(runId) {
  return {
    runId,
    visitedLocationIds: new Set(),
  };
}

export function markVisited(session, locationId) {
  session.visitedLocationIds.add(locationId);
}

export function markUnvisited(session, locationId) {
  session.visitedLocationIds.delete(locationId);
}

export function isVisited(session, locationId) {
  return session.visitedLocationIds.has(locationId);
}

