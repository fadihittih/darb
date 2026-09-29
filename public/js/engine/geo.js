// Geometry helpers. Pure functions, no DOM.

export const ROAD_FACTOR = 1.35;   // straight line → road km
export const FALLBACK_KMH = 70;

const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in km between two {lat, lng}. */
export function haversine(a, b) {
  const R = 6371;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const roadKm = (a, b) => haversine(a, b) * ROAD_FACTOR;
export const driveMinutes = (km) => Math.round((km / FALLBACK_KMH) * 60);

/** Initial bearing from a to b in degrees (0 = north, clockwise). */
export function bearing(a, b) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Smallest angle between two bearings (0–180). */
export function bearingDiff(b1, b2) {
  const d = Math.abs(b1 - b2) % 360;
  return d > 180 ? 360 - d : d;
}
