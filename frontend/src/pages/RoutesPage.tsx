import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import MapView, { type MapMarker } from '../components/MapView'
import PlaceSearch from '../components/PlaceSearch'
import { DataKind, Notice, TypeLabel } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { fmtDistance, fmtDuration, incidentsAlong } from '../lib/geo'
import { useI18n } from '../i18n'
import type { Favorite, Incident, Place, RouteInfo } from '../lib/types'

const parse = (v: string | null, label: string | null): Place | null => {
  if (!v) return null
  const [lat, lng] = v.split(',').map(Number)
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, name: label || `${lat.toFixed(4)}, ${lng.toFixed(4)}` } : null
}

export default function RoutesPage() {
  const { t, err, num } = useI18n()
  const { user } = useAuth()
  const [sp] = useSearchParams()
  const [from, setFrom] = useState<Place | null>(() => parse(sp.get('from'), sp.get('fromLabel')))
  const [to, setTo] = useState<Place | null>(() => parse(sp.get('to'), sp.get('toLabel')))
  const [picking, setPicking] = useState<'from' | 'to' | null>(null)
  const [favs, setFavs] = useState<Favorite[]>([])
  const [res, setRes] = useState<RouteInfo | null>(null)
  const [alt, setAlt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [inc, setInc] = useState<Incident[]>([])

  useEffect(() => { if (user) api<Favorite[]>('/favorites').then(setFavs).catch(() => {}) }, [user])
  useEffect(() => { api<{ items: Incident[] }>('/incidents?take=200').then(r => setInc(r.items)).catch(() => {}) }, [])

  useEffect(() => {
    setRes(null); setAlt(0); setError('')
    if (!from || !to) return
    let dead = false
    setBusy(true)
    api<RouteInfo>(`/routes?from=${from.lat},${from.lng}&to=${to.lat},${to.lng}`)
      .then(r => { if (!dead) { setRes(r); if (!r.routes.length) setError(t('route_none')) } })
      .catch(e => { if (!dead) setError(err(e)) })
      .finally(() => { if (!dead) setBusy(false) })
    return () => { dead = true }
  }, [from?.lat, from?.lng, to?.lat, to?.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  const r = res?.routes[alt]
  const along = useMemo(() => (r ? incidentsAlong(r.geometry.coordinates, inc) : []), [r, inc])
  const markers: MapMarker[] = [from && { id: 'f', lat: from.lat, lng: from.lng, emoji: '🟢', label: from.name }, to && { id: 't', lat: to.lat, lng: to.lng, emoji: '🏁', label: to.name }].filter(Boolean) as MapMarker[]
  const lines = res ? [res.routes[alt], ...res.routes.filter((_, i) => i !== alt)].filter(Boolean).map(x => x.geometry.coordinates) : []

  function onMap(p: { lat: number; lng: number }) {
    if (!picking) return
    const place = { ...p, name: `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}` }
    picking === 'from' ? setFrom(place) : setTo(place)
    setPicking(null)
  }
  const favPlace = (f: Favorite): Place => ({ name: f.label, lat: f.lat, lng: f.lng })

  return (
    <div className="routePage">
      <MapView className="map half" route={lines} markers={markers} onMapClick={onMap} fitRoute={!!res} incidents={along} />
      <div className="panelBottom">
        {picking && <Notice>{t('pick_hint')}</Notice>}
        <label className="lbl">{t('route_from')}</label>
        <PlaceSearch value={from?.name} onPick={setFrom} onPickOnMap={() => setPicking(p => (p === 'from' ? null : 'from'))} picking={picking === 'from'} placeholder={t('route_from')} />
        <div className="row between"><label className="lbl">{t('route_to')}</label><button className="link" onClick={() => { setFrom(to); setTo(from) }} disabled={!from && !to}>⇅ {t('swap')}</button></div>
        <PlaceSearch value={to?.name} onPick={setTo} onPickOnMap={() => setPicking(p => (p === 'to' ? null : 'to'))} picking={picking === 'to'} placeholder={t('route_to')} />
        {favs.length > 0 && (
          <div className="chipset">{favs.map(f => <span key={f.id} className="chip static">{f.kind === 'HOME' ? '🏠' : f.kind === 'WORK' ? '💼' : '📍'} {f.label}
            <button className="link" onClick={() => setFrom(favPlace(f))}>{t('as_from')}</button><button className="link" onClick={() => setTo(favPlace(f))}>{t('as_to')}</button></span>)}</div>
        )}
        {busy && <p className="muted">{t('route_computing')}</p>}
        {error && <Notice tone="error">{error}</Notice>}
        {res && r && (
          <div className="card">
            {res.routes.length > 1 && <div className="row wrap">{res.routes.map((x, i) => <button key={i} className={'chip' + (alt === i ? ' on' : '')} onClick={() => setAlt(i)}>{t('route_option', { n: i + 1 })} · {fmtDistance(x.distanceM, num)}</button>)}</div>}
            <div className="stats">
              <div><small>{t('distance')}</small><b>{fmtDistance(r.distanceM, num)}</b></div>
              <div><small>{res.trafficAwareEta ? t('eta_traffic') : t('eta_base')}</small><b>{fmtDuration(res.trafficAwareEta && r.trafficDurationS ? r.trafficDurationS : r.baseDurationS, t)}</b></div>
            </div>
            {res.trafficAwareEta
              ? <Notice tone="ok">{t('eta_traffic_ok')}</Notice>
              : <Notice tone="warn">{t(res.etaNote === 'unavailable_provider_error' ? 'eta_unavailable_error' : 'eta_unavailable')}</Notice>}
            <div className="row wrap"><b>{t('route_reports')}</b><DataKind kind="reports" /></div>
            {along.length === 0 ? <p className="muted small">{t('route_no_reports')}</p> : (
              <ul className="list">{along.map(i => <li key={i.id}><TypeLabel type={i.type} /> <span className="muted small">· {t(('status_' + i.status.toLowerCase()) as any)}</span></li>)}</ul>
            )}
            <p className="muted small">{t('route_disclaimer')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
