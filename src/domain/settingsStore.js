/**
 * Settings persistence (PRD V2.10). Key-value style in IndexedDB.
 */

import { getEntity, putEntity } from "../storage/indexedDb.js";

const AUTO_CHECK_IN_KEY = "autoCheckIn";

const DEFAULTS = {
  enabled: false,
  proximityMeters: 50,
  dwellSeconds: 30,
};

/**
 * @returns {Promise<{ enabled: boolean, proximityMeters: number, dwellSeconds: number }>}
 */
export async function getAutoCheckInSettings() {
  try {
    const raw = await getEntity("settings", AUTO_CHECK_IN_KEY);
    if (!raw || typeof raw !== "object") return { ...DEFAULTS };
    return {
      enabled: Boolean(raw.enabled),
      proximityMeters: clamp(Number(raw.proximityMeters) || DEFAULTS.proximityMeters, 20, 200),
      dwellSeconds: clamp(Number(raw.dwellSeconds) || DEFAULTS.dwellSeconds, 5, 120),
    };
  } catch (_) {
    // Settings store may not exist if DB was opened at an older version (e.g. cached script).
    return { ...DEFAULTS };
  }
}

/**
 * @param {{ enabled: boolean, proximityMeters: number, dwellSeconds: number }} settings
 */
export async function saveAutoCheckInSettings(settings) {
  const doc = {
    id: AUTO_CHECK_IN_KEY,
    enabled: Boolean(settings.enabled),
    proximityMeters: clamp(Number(settings.proximityMeters) ?? DEFAULTS.proximityMeters, 20, 200),
    dwellSeconds: clamp(Number(settings.dwellSeconds) ?? DEFAULTS.dwellSeconds, 5, 120),
  };
  try {
    await putEntity("settings", doc);
    return doc;
  } catch (_) {
    // Settings store may not exist if DB is still at an older version.
    return doc;
  }
}

function clamp(val, min, max) {
  if (Number.isNaN(val)) return min;
  return Math.max(min, Math.min(max, val));
}
