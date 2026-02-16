// Location domain helpers.
// Mirrors the PRD attributes and provides small utilities for creation and updates.

import { putEntity, getAllFromStore } from "../storage/indexedDb.js";

export const SERVICE_FREQUENCIES = ["weekly", "fortnightly", "monthly", "adhoc"];

export function createLocation({
  id,
  latitude,
  longitude,
  name,
  serviceFrequency,
  productType = "",
  notes = "",
}) {
  if (!SERVICE_FREQUENCIES.includes(serviceFrequency)) {
    throw new Error(`Invalid serviceFrequency: ${serviceFrequency}`);
  }

  return {
    id,
    latitude,
    longitude,
    name,
    serviceFrequency,
    productType,
    notes,
    // Status enum (PRD V1.7): "active" | "archived" | "deleted"
    status: "active",
  };
}

export function softDeleteLocation(location) {
  return { ...location, status: "deleted" };
}

export function restoreLocation(location) {
  return { ...location, status: "active" };
}

export function archiveLocation(location) {
  return { ...location, status: "archived" };
}

export function restoreFromArchive(location) {
  return { ...location, status: "active" };
}

export async function saveLocation(location) {
  await putEntity("locations", location);
  return location;
}

export async function getAllLocations() {
  return getAllFromStore("locations");
}

