export const TYPES = ['accident', 'roadworks', 'closed', 'pothole', 'flood', 'traffic_light', 'stopped', 'danger', 'heavy_traffic', 'damaged_road', 'other'] as const
export type IncidentType = (typeof TYPES)[number]

// Minutes before an unrefreshed report expires.
export const TTL_MIN: Record<string, number> = {
  accident: 90, roadworks: 7 * 24 * 60, closed: 12 * 60, pothole: 14 * 24 * 60, flood: 6 * 60,
  traffic_light: 24 * 60, stopped: 45, danger: 60, heavy_traffic: 30, damaged_road: 14 * 24 * 60, other: 120,
}
export const expiresFrom = (type: string, from = new Date()) => new Date(from.getTime() + (TTL_MIN[type] ?? 120) * 60000)

export function distM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000, r = Math.PI / 180
  const dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
export const inMorocco = (lat: number, lng: number) => lat > 20.5 && lat < 36.2 && lng > -17.5 && lng < -0.8
type P = { type: string; latitude: number; longitude: number }
export const isDuplicate = (a: P, b: P) => a.type === b.type && distM(a.latitude, a.longitude, b.latitude, b.longitude) < 100
export const statusFor = (conf: number) => (conf >= 3 ? 'CONFIRMED' : 'PENDING')

export interface CityRef { id: string; lat: number; lng: number }
/** Nearest city within maxKm, else null (reports in the countryside have no city). */
export function nearestCity<T extends CityRef>(lat: number, lng: number, cities: T[], maxKm = 40): T | null {
  let best: T | null = null, bd = Infinity
  for (const c of cities) {
    const d = distM(lat, lng, c.lat, c.lng)
    if (d < bd) { bd = d; best = c }
  }
  return best && bd <= maxKm * 1000 ? best : null
}

/** Minimum distance (m) from a point to a polyline of [lng,lat] pairs (vertex-based, fine for dense OSRM geometry). */
export function minDistToLine(lat: number, lng: number, coords: [number, number][]) {
  let m = Infinity
  for (const [x, y] of coords) { const d = distM(lat, lng, y, x); if (d < m) m = d }
  return m
}

/** Recompute vote outcome. `yes`/`no` are counts of confirm/gone votes (the reporter counts as 1 yes). */
export function voteOutcome(yes: number, no: number) {
  const conf = 1 + yes - no
  const gone = no >= 3 && no > yes
  return { confidence: Math.max(0, conf), status: (gone ? 'EXPIRED' : statusFor(conf)) as 'EXPIRED' | 'CONFIRMED' | 'PENDING' }
}
