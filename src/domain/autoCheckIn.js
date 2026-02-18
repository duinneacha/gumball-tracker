/**
 * Auto Check-In logic (PRD V2.10): monitor GPS, dwell timer, single location at a time.
 * Uses haversine for distance; ignores fixes when speed > 5 km/h or accuracy too poor.
 */

import { haversineKm } from "../utils/geo.js";

const SPEED_THRESHOLD_KMH = 5;
const SPEED_MS_TO_KMH = 3.6;
const ACCURACY_WORSE_THAN_M = 100;

/**
 * @param {{
 *   getSettings: () => Promise<{ enabled: boolean, proximityMeters: number, dwellSeconds: number }>,
 *   getLocations: () => Promise<Array<{ id: string, name?: string, latitude: number, longitude: number }>>,
 *   getVisitedIds: () => Set<string>,
 *   onAutoVisit: (locationId: string, locationName: string) => void | Promise<void>,
 * }} options
 */
export function createAutoCheckInController(options) {
  const { getSettings, getLocations, getVisitedIds, onAutoVisit } = options;
  let dwellingLocationId = null;
  let dwellTimerId = null;

  function cancelAll() {
    if (dwellTimerId != null) {
      clearTimeout(dwellTimerId);
      dwellTimerId = null;
    }
    dwellingLocationId = null;
  }

  function cancelForLocation(locationId) {
    if (dwellingLocationId === locationId) {
      if (dwellTimerId != null) {
        clearTimeout(dwellTimerId);
        dwellTimerId = null;
      }
      dwellingLocationId = null;
    }
  }

  /**
   * Call on each GPS position update when in Operation with active run.
   * @param {{ coords: { latitude: number, longitude: number, accuracy?: number, speed?: number | null } }} position
   */
  async function update(position) {
    const settings = await getSettings();
    if (!settings.enabled) {
      cancelAll();
      return;
    }

    const locations = await getLocations();
    const visitedIds = getVisitedIds();
    const unvisited = (locations || []).filter((loc) => !visitedIds.has(loc.id));
    if (unvisited.length === 0) {
      cancelAll();
      return;
    }

    const lat = position?.coords?.latitude;
    const lng = position?.coords?.longitude;
    const accuracy = position?.coords?.accuracy;
    const speedMs = position?.coords?.speed;
    if (lat == null || lng == null) return;

    const proximityKm = (settings.proximityMeters || 50) / 1000;
    const accuracyThreshold = Math.max(settings.proximityMeters || 50, ACCURACY_WORSE_THAN_M);
    if (typeof accuracy === "number" && accuracy > accuracyThreshold) return;
    if (typeof speedMs === "number" && speedMs * SPEED_MS_TO_KMH > SPEED_THRESHOLD_KMH) {
      cancelAll();
      return;
    }

    let closest = null;
    let closestDistKm = proximityKm;
    for (const loc of unvisited) {
      const d = haversineKm(lat, lng, loc.latitude, loc.longitude);
      if (d <= proximityKm && (closest == null || d < closestDistKm)) {
        closest = loc;
        closestDistKm = d;
      }
    }

    if (closest == null) {
      cancelAll();
      return;
    }

    if (dwellingLocationId === closest.id) return;

    cancelAll();
    dwellingLocationId = closest.id;
    dwellTimerId = setTimeout(() => {
      dwellTimerId = null;
      const locId = dwellingLocationId;
      dwellingLocationId = null;
      const loc = locations.find((l) => l.id === locId);
      const name = loc?.name ?? locId;
      if (typeof onAutoVisit === "function") {
        Promise.resolve(onAutoVisit(locId, name)).catch((err) => {
          // eslint-disable-next-line no-console
          console.error("autoCheckIn onAutoVisit failed", err);
        });
      }
    }, (settings.dwellSeconds || 30) * 1000);
  }

  return { update, cancelAll, cancelForLocation };
}
