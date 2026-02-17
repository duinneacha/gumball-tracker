// Run completion domain (PRD V2.1): persist last completed run for Dashboard display.

import { putEntity, getEntity, getAllFromStore } from "../storage/indexedDb.js";

const LAST_RUN_COMPLETION_ID = "last";

/**
 * Save the last completed run to IndexedDB.
 * @param {{ runId: string, runName: string, visitedCount: number, totalCount: number, completedAt: string }} completion
 */
export async function saveLastRunCompletion(completion) {
  const record = {
    id: LAST_RUN_COMPLETION_ID,
    runId: completion.runId,
    runName: completion.runName,
    visitedCount: completion.visitedCount,
    totalCount: completion.totalCount,
    completedAt: completion.completedAt,
  };
  await putEntity("runCompletions", record);
  return record;
}

/**
 * Retrieve the last completed run, or null if none.
 * @returns {Promise<{ runId: string, runName: string, visitedCount: number, totalCount: number, completedAt: string } | null>}
 */
export async function getLastRunCompletion() {
  try {
    const record = await getEntity("runCompletions", LAST_RUN_COMPLETION_ID);
    return record ?? null;
  } catch {
    return null;
  }
}
