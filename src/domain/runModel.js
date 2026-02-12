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

