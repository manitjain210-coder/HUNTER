/** Straight-line (haversine) distance in km. Not a road distance. */
export function distanceKm(a: { lat?: number | null; lng?: number | null }, b: { lat?: number | null; lng?: number | null }) {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** Estimated travel minutes from straight-line distance plus a buffer. An estimate, never a guarantee. */
export function estTravelMin(km: number, speedKmh: number, bufferMin: number) {
  return Math.ceil((km * 1.4 / speedKmh) * 60 + bufferMin); // 1.4 = rough detour factor
}
