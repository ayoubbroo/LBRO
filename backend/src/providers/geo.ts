import type { Config } from '../config.js'
import type { TrafficProvider } from './traffic.js'

const UA = { 'User-Agent': 'traffic-maroc/1.0' }
type Fetch = typeof fetch

export async function geocode(cfg: Pick<Config, 'geocodingUrl'>, q: string, f: Fetch = fetch) {
  const r = await f(cfg.geocodingUrl + '/search?format=jsonv2&countrycodes=ma&limit=8&q=' + encodeURIComponent(q), { headers: UA })
  if (!r.ok) throw new Error('geocoding failed')
  return ((await r.json()) as any[]).map(x => ({ name: x.display_name as string, lat: +x.lat, lng: +x.lon }))
}

export async function reverseGeocode(cfg: Pick<Config, 'geocodingUrl'>, lat: number, lng: number, f: Fetch = fetch) {
  const r = await f(`${cfg.geocodingUrl}/reverse?format=jsonv2&lat=${lat}&lon=${lng}`, { headers: UA })
  if (!r.ok) throw new Error('geocoding failed')
  const j: any = await r.json()
  return j?.display_name ? { name: j.display_name as string, lat, lng } : null
}

export interface RouteResult {
  trafficAwareEta: boolean
  /** Why the traffic-aware ETA is missing (frontend translates the code). */
  etaNote: 'unavailable_no_provider' | 'unavailable_provider_error' | ''
  routes: { distanceM: number; baseDurationS: number; trafficDurationS: number | null; geometry: { type: 'LineString'; coordinates: [number, number][] } }[]
}

export async function route(cfg: Pick<Config, 'routingUrl'>, a: [number, number], b: [number, number], traffic?: TrafficProvider, f: Fetch = fetch): Promise<RouteResult> {
  const r = await f(`${cfg.routingUrl}/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson&alternatives=true`, { headers: UA })
  if (!r.ok) throw new Error('routing failed')
  const j: any = await r.json()
  const routes = (j.routes || []).map((x: any) => ({ distanceM: x.distance as number, baseDurationS: x.duration as number, trafficDurationS: null as number | null, geometry: x.geometry }))
  let aware = false
  let etaNote: RouteResult['etaNote'] = 'unavailable_no_provider'
  if (traffic?.available && traffic.getRouteEta) {
    try {
      const eta = await traffic.getRouteEta(a, b)
      if (eta && routes[0]) { routes[0].trafficDurationS = eta.durationS; aware = true; etaNote = '' } else etaNote = 'unavailable_provider_error'
    } catch { etaNote = 'unavailable_provider_error' }
  }
  return { trafficAwareEta: aware, etaNote, routes }
}
