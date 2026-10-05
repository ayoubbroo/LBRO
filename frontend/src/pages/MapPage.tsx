import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import MapView from '../components/MapView'
import ReportSheet from '../components/ReportSheet'
import IncidentSheet from '../components/IncidentSheet'
import PlaceSearch from '../components/PlaceSearch'
import { DataKind, Notice } from '../components/ui'
import { INCIDENT_TYPES } from '../lib/constants'
import { api } from '../lib/api'
import { distM, getPosition } from '../lib/geo'
import { useI18n } from '../i18n'
import { useApp } from '../lib/app'
import type { Incident, TrafficInfo } from '../lib/types'

const NEAR_M = 5000

export default function MapPage() {
  const { t, err, num } = useI18n()
  const { flash, online } = useApp()
  const nav = useNavigate()
  const [inc, setInc] = useState<Incident[]>([])
  const [traffic, setTraffic] = useState<TrafficInfo | null>(null)
  const [types, setTypes] = useState<string[]>([])
  const [status, setStatus] = useState<'ALL' | 'CONFIRMED' | 'PENDING'>('ALL')
  const [showFilters, setShowFilters] = useState(false)
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null)
  const [sel, setSel] = useState<Incident | null>(null)
  const [reporting, setReporting] = useState(false)
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null)
  const [fly, setFly] = useState<{ lat: number; lng: number; zoom?: number; nonce: number } | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try { const r = await api<{ items: Incident[] }>('/incidents?take=200'); setInc(r.items); setError('') } catch (e) { setError(err(e)) }
  }, [err])
  useEffect(() => {
    void load()
    api<TrafficInfo>('/traffic').then(setTraffic).catch(() => setTraffic(null))
    const iv = window.setInterval(() => void load(), 60_000)
    const h = () => void load()
    addEventListener('tm-incidents-changed', h)
    return () => { clearInterval(iv); removeEventListener('tm-incidents-changed', h) }
  }, [load])

  const shown = useMemo(() => inc.filter(i =>
    (!types.length || types.includes(i.type)) && (status === 'ALL' || i.status === status) &&
    (!near || distM(i.latitude, i.longitude, near.lat, near.lng) <= NEAR_M)), [inc, types, status, near])

  async function nearMe() {
    if (near) { setNear(null); return }
    try { const p = await getPosition(); setNear(p); setFly({ ...p, zoom: 13, nonce: Date.now() }) } catch { flash(t('err_geolocation')) }
  }
  const toggleType = (k: string) => setTypes(c => (c.includes(k) ? c.filter(x => x !== k) : [...c, k]))
  const activeFilters = types.length + (status !== 'ALL' ? 1 : 0) + (near ? 1 : 0)

  return (
    <div className="mapPage">
      <MapView incidents={shown} onSelect={setSel} onMapClick={p => setPin(p)} pin={pin} onPinDrag={setPin} user={near} flyTo={fly} traffic={traffic} />
      <div className="mapTop">
        <PlaceSearch placeholder={t('search_city_road')} onPick={p => setFly({ lat: p.lat, lng: p.lng, zoom: 14, nonce: Date.now() })} />
        <div className="row wrap chips">
          <button className={'chip' + (showFilters ? ' on' : '')} onClick={() => setShowFilters(s => !s)}>⚙️ {t('filters')}{activeFilters > 0 && ` (${activeFilters})`}</button>
          <button className={'chip' + (near ? ' on' : '')} onClick={nearMe}>🎯 {t('near_me')}</button>
          <Link className="chip" to="/cities">🏙️ {t('nav_cities')}</Link>
        </div>
        {showFilters && (
          <div className="panel">
            <div className="chipset">{INCIDENT_TYPES.map(([k, e]) => <button key={k} className={'chip' + (types.includes(k) ? ' on' : '')} onClick={() => toggleType(k)}>{e} {t(('type_' + k) as any)}</button>)}</div>
            <div className="row wrap">
              {(['ALL', 'CONFIRMED', 'PENDING'] as const).map(s => <button key={s} className={'chip' + (status === s ? ' on' : '')} onClick={() => setStatus(s)}>{s === 'ALL' ? t('all') : t(('status_' + s.toLowerCase()) as any)}</button>)}
              {activeFilters > 0 && <button className="link" onClick={() => { setTypes([]); setStatus('ALL'); setNear(null) }}>{t('clear_filters')}</button>}
            </div>
          </div>
        )}
        <div className="row wrap legend">
          <DataKind kind="reports" />
          {traffic && !traffic.available && <span className="badge muted">📡 {t('traffic_unavailable_short')}</span>}
          {traffic?.available && <DataKind kind="live" />}
          <span className="muted small">{t('shown_count', { n: num(shown.length) })}</span>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {traffic && !traffic.available && <Notice>{t(traffic.message === 'provider_error' ? 'traffic_provider_error' : 'traffic_no_provider')}</Notice>}
      </div>
      {!reporting && <button className="fab" onClick={() => setReporting(true)}>＋ {t('report')}</button>}
      {pin && !reporting && <button className="fab2" onClick={() => setPin(null)}>✕ {t('clear_pin')}</button>}
      {reporting && <ReportSheet pin={pin} onClose={() => setReporting(false)} onDone={() => { setReporting(false); setPin(null); void load() }} />}
      {sel && !reporting && <IncidentSheet incident={sel} onClose={() => setSel(null)} onChanged={() => void load()} onRouteTo={i => nav(`/routes?to=${i.latitude},${i.longitude}&toLabel=${encodeURIComponent(t(('type_' + i.type) as any))}`)} />}
      {!online && <span className="sr-only">{t('offline')}</span>}
    </div>
  )
}
