// Import/export helpers for full data backup and restore.
// The implementation starts minimal and can be extended as UI hooks are added.

import { getAllFromStore, putEntity } from "./indexedDb.js";

export async function exportAllData() {
  const [locations, runs, runLocations, visits] = await Promise.all([
    getAllFromStore("locations"),
    getAllFromStore("runs"),
    getAllFromStore("runLocations"),
    getAllFromStore("visits"),
  ]);

  return {
    locations,
    runs,
    runLocations,
    visits,
  };
}

export async function importData(json) {
  const { locations = [], runs = [], runLocations = [], visits = [] } = json || {};

  const all = [
    ...locations.map((l) => putEntity("locations", l)),
    ...runs.map((r) => putEntity("runs", r)),
    ...runLocations.map((rl) => putEntity("runLocations", rl)),
    ...visits.map((v) => putEntity("visits", v)),
  ];

  await Promise.all(all);
}

