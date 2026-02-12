/**
 * Garmin waypoints seed: deterministic IDs, waypoint → Location mapping,
 * first-run import, and import-from-JSON for Maintenance UI.
 * PRD Addendum: Initial Garmin Waypoints Seed.
 */

import { getDb, putEntity, getAllFromStore } from "./indexedDb.js";

/** Default seed URL (bundled in public/). */
export const DEFAULT_SEED_URL = "/garmin_waypoints_locations_seed.json";

/**
 * Generate deterministic location id from (name + lat + lon).
 * Uses SHA-1 truncated to 12 hex chars so repeated imports don't create new IDs.
 * @param {string} name
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<string>}
 */
export async function generateLocationId(name, lat, lon) {
  const str = `${String(name)}|${Number(lat)}|${Number(lon)}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hash = await crypto.subtle.digest("SHA-1", data);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
  return hex;
}

/**
 * Normalize a seed/waypoint entry into a Location model object.
 * Accepts:
 * - Pre-normalized: { id, name, latitude, longitude, serviceFrequency?, productType?, notes?, status? }
 * - Garmin waypoint: { name, lat, lon, popup? } → id generated, notes from popup optional
 * @param {object} entry
 * @returns {Promise<object>} Location
 */
export async function waypointToLocation(entry) {
  const hasLatLon = "latitude" in entry && "longitude" in entry;
  const hasLatLonAlt = "lat" in entry && "lon" in entry;

  let id, latitude, longitude, name, serviceFrequency, productType, notes, status;

  if (hasLatLon && entry.name != null) {
    id = entry.id != null ? String(entry.id) : await generateLocationId(entry.name, entry.latitude, entry.longitude);
    latitude = Number(entry.latitude);
    longitude = Number(entry.longitude);
    name = String(entry.name);
    serviceFrequency = entry.serviceFrequency != null && ["weekly", "fortnightly", "monthly", "adhoc"].includes(entry.serviceFrequency)
      ? entry.serviceFrequency
      : "adhoc";
    productType = entry.productType != null ? String(entry.productType) : "";
    notes = entry.notes != null ? String(entry.notes) : "";
    status = entry.status === "deleted" ? "deleted" : "active";
  } else if (hasLatLonAlt && entry.name != null) {
    const lat = Number(entry.lat);
    const lon = Number(entry.lon);
    id = await generateLocationId(entry.name, lat, lon);
    latitude = lat;
    longitude = lon;
    name = String(entry.name);
    serviceFrequency = "adhoc";
    productType = "";
    notes = entry.popup != null ? String(entry.popup) : "";
    status = "active";
  } else {
    throw new Error("Invalid seed entry: needs (name, latitude, longitude) or (name, lat, lon)");
  }

  return {
    id,
    latitude,
    longitude,
    name,
    serviceFrequency,
    productType,
    notes,
    status,
  };
}

/**
 * Import an array of seed/waypoint entries into the locations store.
 * Upserts by id; does not crash on duplicates (existing ids overwritten).
 * Does not create runs; all locations remain unassigned.
 * @param {object[]} entries
 * @returns {Promise<number>} number of locations written
 */
export async function importLocationsFromSeed(entries) {
  if (!Array.isArray(entries)) {
    throw new Error("Seed data must be an array");
  }
  let count = 0;
  for (const entry of entries) {
    const location = await waypointToLocation(entry);
    await putEntity("locations", location);
    count += 1;
  }
  return count;
}

/**
 * If locations store is empty, fetch the default seed URL and import.
 * Does not create runs. Safe to call on every startup.
 * @param {string} [seedUrl]
 * @returns {Promise<{ imported: number } | { imported: 0 }>}
 */
export async function runFirstRunSeedIfEmpty(seedUrl = DEFAULT_SEED_URL) {
  const locations = await getAllFromStore("locations");
  if (locations.length > 0) {
    return { imported: 0 };
  }
  const res = await fetch(seedUrl);
  if (!res.ok) {
    throw new Error(`Seed fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const array = Array.isArray(data) ? data : data.locations;
  if (!Array.isArray(array)) {
    throw new Error("Seed JSON must be an array or { locations: [] }");
  }
  const imported = await importLocationsFromSeed(array);
  return { imported };
}

/**
 * Import from JSON for Maintenance "Import seed/backup" UI.
 * Accepts: same structure as exportAllData() (full backup), or locations[] only, or raw array of waypoints.
 * Upserts; does not crash on id collisions.
 * @param {object} json - Parsed JSON (array or object with locations / runs / runLocations / visits)
 * @returns {Promise<{ kind: 'full' } | { kind: 'locations'; count: number }>}
 */
export async function importFromJson(json) {
  if (json == null || typeof json !== "object") {
    throw new Error("Invalid import: expected JSON object or array");
  }
  const hasOtherStores =
    (json.runs != null && Array.isArray(json.runs)) ||
    (json.runLocations != null && Array.isArray(json.runLocations)) ||
    (json.visits != null && Array.isArray(json.visits));
  const isFullBackup = Array.isArray(json.locations) && hasOtherStores;
  if (isFullBackup) {
    const { importData } = await import("./backup.js");
    await importData(json);
    return { kind: "full" };
  }
  const entries = Array.isArray(json) ? json : json.locations;
  if (!Array.isArray(entries)) {
    throw new Error("Invalid import: expected array or { locations: [] } or full backup");
  }
  const count = await importLocationsFromSeed(entries);
  return { kind: "locations", count };
}
