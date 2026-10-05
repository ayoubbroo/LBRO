import type { Config } from '../config.js'

export type TrafficLevel = 'free' | 'moderate' | 'heavy' | 'blocked'
export interface BBox { n: number; s: number; e: number; w: number }
export interface TrafficReading { level: TrafficLevel; lat: number; lng: number; currentSpeedKmh?: number; freeFlowSpeedKmh?: number }

/**
 * A live traffic provider. Only a REAL provider may return `available = true`.
 * Application (user) reports are never routed through this interface.
 */
export interface TrafficProvider {
  readonly name: string
  readonly available: boolean
  getTraffic(b: BBox): Promise<TrafficReading[]>
  /** Optional: provider-computed traffic-aware duration for a route. Absent => ETA stays "unavailable". */
  getRouteEta?(a: [number, number], b: [number, number]): Promise<{ durationS: number } | null>
}

export class NoTrafficProvider implements TrafficProvider {
  readonly name = 'none'
  readonly available = false
  async getTraffic() { return [] }
}

type FetchLike = (url: string) => Promise<{ ok: boolean; json(): Promise<any> }>

/** TomTom Traffic Flow (flowSegmentData) sampled on a 3x3 grid. Written against TomTom's public docs; not exercised live in this repo. */
export class TomTomProvider implements TrafficProvider {
  readonly name = 'tomtom'
  readonly available = true
  constructor(private key: string, private baseUrl = 'https://api.tomtom.com', private f: FetchLike = fetch as any) {}
  async getTraffic(b: BBox) {
    const pts: [number, number][] = []
    for (const fy of [0.25, 0.5, 0.75]) for (const fx of [0.25, 0.5, 0.75]) pts.push([b.s + (b.n - b.s) * fy, b.w + (b.e - b.w) * fx])
    const out: TrafficReading[] = []
    for (const [lat, lng] of pts) {
      const r = await this.f(`${this.baseUrl}/traffic/services/4/flowSegmentData/absolute/10/json?point=${lat},${lng}&key=${encodeURIComponent(this.key)}`)
      if (!r.ok) throw new Error('traffic provider http error')
      const d = (await r.json())?.flowSegmentData
      if (!d || typeof d.currentSpeed !== 'number' || typeof d.freeFlowSpeed !== 'number' || d.freeFlowSpeed <= 0) continue
      out.push({ lat, lng, currentSpeedKmh: d.currentSpeed, freeFlowSpeedKmh: d.freeFlowSpeed, level: levelFromRatio(d.currentSpeed / d.freeFlowSpeed) })
    }
    return out
  }
}

export const levelFromRatio = (r: number): TrafficLevel => (r >= 0.8 ? 'free' : r >= 0.5 ? 'moderate' : r >= 0.2 ? 'heavy' : 'blocked')

export interface ProviderStatus { requested: string; active: string; available: boolean; reason: 'ok' | 'not_configured' | 'missing_key' | 'unknown_provider' }

/** Builds the provider from config. Misconfiguration falls back to `none` — never to fake data. */
export function createTrafficProvider(cfg: Pick<Config, 'trafficProvider' | 'trafficApiKey' | 'trafficApiUrl'>): { provider: TrafficProvider; status: ProviderStatus } {
  const req = cfg.trafficProvider || 'none'
  const none = (reason: ProviderStatus['reason']) => ({ provider: new NoTrafficProvider(), status: { requested: req, active: 'none', available: false, reason } as ProviderStatus })
  if (req === 'none') return none('not_configured')
  if (req === 'tomtom') {
    if (!cfg.trafficApiKey) return none('missing_key')
    return { provider: new TomTomProvider(cfg.trafficApiKey, cfg.trafficApiUrl || undefined), status: { requested: req, active: 'tomtom', available: true, reason: 'ok' } }
  }
  // Add HERE / Google / Mapbox adapters here: implement TrafficProvider and register by name.
  return none('unknown_provider')
}

export type TrafficResult =
  | { available: true; provider: string; data: TrafficReading[]; message: '' }
  | { available: false; provider: string; data: []; message: 'no_provider' | 'provider_error' }

/** Safe wrapper: a failing provider degrades to "unavailable" instead of throwing or inventing values. */
export async function fetchTraffic(p: TrafficProvider, b: BBox): Promise<TrafficResult> {
  if (!p.available) return { available: false, provider: p.name, data: [], message: 'no_provider' }
  try { return { available: true, provider: p.name, data: await p.getTraffic(b), message: '' } }
  catch { return { available: false, provider: p.name, data: [], message: 'provider_error' } }
}
