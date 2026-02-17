// Run completion domain (PRD V2.1, V2.7): persist completed runs for Dashboard and History.

import { putEntity, getAllFromStore } from "../storage/indexedDb.js";

function generateCompletionId() {
  return `completion-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Add a new run completion record (PRD V2.7). Multiple records accumulate.
 * @param {{ runId: string, runName: string, visitedCount: number, totalCount: number, completedAt: string, durationMinutes?: number }} completion
 */
export async function addRunCompletion(completion) {
  const record = {
    id: generateCompletionId(),
    runId: completion.runId,
    runName: completion.runName,
    visitedCount: completion.visitedCount,
    totalCount: completion.totalCount,
    completedAt: completion.completedAt,
    durationMinutes: completion.durationMinutes ?? null,
  };
  await putEntity("runCompletions", record);
  return record;
}

/**
 * Get all completion records, sorted by completedAt descending (PRD V2.7).
 * @param {number} [limit] - Max records to return
 * @param {number} [offset] - Skip first N
 * @returns {Promise<Array<{ id: string, runId: string, runName: string, visitedCount: number, totalCount: number, completedAt: string, durationMinutes?: number }>>}
 */
export async function getAllCompletions(limit = 500, offset = 0) {
  const all = await getAllFromStore("runCompletions");
  const sorted = (all || []).slice().sort((a, b) => {
    const ta = (a.completedAt || "").toString();
    const tb = (b.completedAt || "").toString();
    return tb.localeCompare(ta);
  });
  return sorted.slice(offset, limit ? offset + limit : undefined);
}

/**
 * Retrieve the most recent completion (for Dashboard Last Run card).
 * @returns {Promise<{ runId: string, runName: string, visitedCount: number, totalCount: number, completedAt: string, durationMinutes?: number } | null>}
 */
export async function getLastRunCompletion() {
  const list = await getAllCompletions(1);
  return list.length > 0 ? list[0] : null;
}
