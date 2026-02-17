// Import/export helpers for full data backup and restore.
// The implementation starts minimal and can be extended as UI hooks are added.

import { getAllFromStore, putEntity } from "./indexedDb.js";

export async function exportAllData() {
  const [locations, runs, runLocations, visits, runCompletions, activeSessions] = await Promise.all([
    getAllFromStore("locations"),
    getAllFromStore("runs"),
    getAllFromStore("runLocations"),
    getAllFromStore("visits"),
    getAllFromStore("runCompletions"),
    getAllFromStore("activeSessions"),
  ]);

  return {
    locations,
    runs,
    runLocations,
    visits,
    runCompletions: runCompletions ?? [],
    activeSessions: activeSessions ?? [],
  };
}

export async function importData(json) {
  const { locations = [], runs = [], runLocations = [], visits = [], runCompletions = [], activeSessions = [] } = json || {};

  const all = [
    ...locations.map((l) => putEntity("locations", l)),
    ...runs.map((r) => putEntity("runs", r)),
    ...runLocations.map((rl) => putEntity("runLocations", rl)),
    ...visits.map((v) => putEntity("visits", v)),
    ...(Array.isArray(runCompletions) ? runCompletions : []).map((rc) => putEntity("runCompletions", rc)),
    ...(Array.isArray(activeSessions) ? activeSessions : []).map((as) => putEntity("activeSessions", as)),
  ];

  await Promise.all(all);
}

