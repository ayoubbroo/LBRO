import type { Incident } from './types'
export function distM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000, r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
/** Incidents within `maxM` of a polyline of [lng,lat]. Used to list driver reports along a route. */
export function incidentsAlong(coords: [number, number][], incidents: Incident[], maxM = 150) {
  // Sample long geometries so the check stays cheap on phones.
  const step = Math.max(1, Math.floor(coords.length / 400))
  const pts = coords.filter((_, i) => i % step === 0)
  return incidents.filter(i => pts.some(([x, y]) => distM(i.latitude, i.longitude, y, x) <= maxM))
}
export function getPosition(timeout = 8000): Promise<{ lat: number; lng: number }> {
  return new Promise((ok, no) => {
    if (!navigator.geolocation) return no(new Error('unsupported'))
    navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lng: p.coords.longitude }), e => no(e), { timeout, enableHighAccuracy: true, maximumAge: 30_000 })
  })
}
export const fmtDistance = (m: number, num: (n: number, o?: Intl.NumberFormatOptions) => string) => (m < 1000 ? `${num(Math.round(m))} m` : `${num(m / 1000, { maximumFractionDigits: 1 })} km`)
export function fmtDuration(s: number, t: (k: any, v?: any) => string) {
  const min = Math.max(1, Math.round(s / 60))
  return min < 60 ? t('dur_min', { m: min }) : t('dur_hm', { h: Math.floor(min / 60), m: min % 60 })
}
export const timeLeft = (iso: string, t: (k: any, v?: any) => string) => {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return t('expired_now')
  const m = Math.round(ms / 60000)
  return m < 60 ? t('dur_min', { m }) : m < 1440 ? t('dur_hm', { h: Math.floor(m / 60), m: m % 60 }) : t('dur_days', { d: Math.round(m / 1440) })
}
