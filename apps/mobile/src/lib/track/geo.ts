// Pure geo math for the GPS tracker. Zero RN/Expo imports so it is unit-testable.

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy: number; // horizontal accuracy in meters (lower is better)
  t: number; // epoch ms
}

export interface SessionSummary {
  distanceM: number;
  movingMs: number;
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function accumulateDistance(
  points: GeoPoint[],
  opts: { minAccuracyM?: number; minMoveM?: number } = {},
): number {
  const minAccuracyM = opts.minAccuracyM ?? 30;
  const minMoveM = opts.minMoveM ?? 3;
  const good = points.filter((p) => p.accuracy <= minAccuracyM);
  let total = 0;
  for (let i = 1; i < good.length; i += 1) {
    const seg = haversineMeters(good[i - 1], good[i]);
    if (seg >= minMoveM) total += seg;
  }
  return total;
}

export function summarize(points: GeoPoint[], pausedMs: number): SessionSummary {
  if (points.length === 0) return { distanceM: 0, movingMs: 0 };
  const elapsed = points[points.length - 1].t - points[0].t;
  return {
    distanceM: accumulateDistance(points),
    movingMs: Math.max(0, elapsed - pausedMs),
  };
}

export function derivePaceSpeed(
  activitySlug: string,
  distanceM: number,
  movingMs: number,
): { value: number; intensityInputs?: Record<string, number> } {
  const km = distanceM / 1000;
  const minutes = movingMs / 60_000;
  const hours = movingMs / 3_600_000;
  const seconds = movingMs / 1000;

  if (activitySlug === "swimming") {
    const value = distanceM; // unit: meters
    if (distanceM <= 0 || movingMs <= 0) return { value };
    return { value, intensityInputs: { pace_per_100m_sec: seconds / (distanceM / 100) } };
  }

  const value = km; // running / cycling / walking unit: km
  if (distanceM <= 0 || movingMs <= 0) return { value };

  if (activitySlug === "running") {
    return { value, intensityInputs: { pace_min_per_km: minutes / km } };
  }
  if (activitySlug === "cycling") {
    return { value, intensityInputs: { avg_speed_kmh: km / hours } };
  }
  // walking: distance only, no intensity config
  return { value };
}
