/**
 * Geo utilities for Disruption Mode: haversine distance and bearing.
 * Used to compute nearest unvisited location in each cardinal direction from map center.
 */

const EARTH_RADIUS_KM = 6371;

/**
 * Haversine distance in km between two points.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number}
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Bearing in degrees from point 1 to point 2 (0 = North, 90 = East, 180 = South, 270 = West).
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} 0–360
 */
export function bearing(lat1, lon1, lat2, lon2) {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  let b = (Math.atan2(y, x) * 180) / Math.PI;
  if (b < 0) b += 360;
  return b;
}

/** Cardinal ranges (degrees): N 337.5–22.5, E 22.5–112.5, S 112.5–202.5, W 202.5–337.5 */
const CARDINALS = {
  N: { min: 337.5, max: 22.5 },
  E: { min: 22.5, max: 112.5 },
  S: { min: 112.5, max: 202.5 },
  W: { min: 202.5, max: 337.5 },
};

function bearingInCardinal(b, card) {
  const r = CARDINALS[card];
  if (r.max > r.min) return b >= r.min && b < r.max;
  return b >= r.min || b < r.max;
}

/**
 * From a center point, for each cardinal direction, select the nearest candidate location in that direction.
 * Candidates are filtered to those not in visitedIds.
 * @param {number} centerLat
 * @param {number} centerLon
 * @param {Array<{ id: string, latitude: number, longitude: number }>} locations
 * @param {Set<string>} visitedIds
 * @returns {{ N: object|null, S: object|null, E: object|null, W: object|null }}
 */
export function getNearestByCardinal(centerLat, centerLon, locations, visitedIds) {
  const result = { N: null, S: null, E: null, W: null };
  const candidates = (locations || []).filter((loc) => !visitedIds.has(loc.id));
  for (const loc of candidates) {
    const b = bearing(centerLat, centerLon, loc.latitude, loc.longitude);
    const dist = haversineKm(centerLat, centerLon, loc.latitude, loc.longitude);
    for (const card of ["N", "E", "S", "W"]) {
      if (!bearingInCardinal(b, card)) continue;
      const current = result[card];
      if (!current || dist < current.dist) {
        result[card] = { ...loc, dist };
      }
    }
  }
  return {
    N: result.N ? { id: result.N.id, latitude: result.N.latitude, longitude: result.N.longitude, name: result.N.name } : null,
    S: result.S ? { id: result.S.id, latitude: result.S.latitude, longitude: result.S.longitude, name: result.S.name } : null,
    E: result.E ? { id: result.E.id, latitude: result.E.latitude, longitude: result.E.longitude, name: result.E.name } : null,
    W: result.W ? { id: result.W.id, latitude: result.W.latitude, longitude: result.W.longitude, name: result.W.name } : null,
  };
}
