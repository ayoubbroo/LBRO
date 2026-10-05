import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { getPosition } from '../lib/geo'
import { useI18n } from '../i18n'
import { useApp } from '../lib/app'
import type { Place } from '../lib/types'

/** Place input: free-text search (geocoding), "my location", and an optional "pick on map" action. */
export default function PlaceSearch({ value, onPick, onPickOnMap, placeholder, picking }: { value?: string; onPick(p: Place): void; onPickOnMap?(): void; placeholder?: string; picking?: boolean }) {
  const { t, err } = useI18n()
  const { online } = useApp()
  const [q, setQ] = useState(value ?? '')
  const [res, setRes] = useState<Place[]>([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const timer = useRef(0)
  useEffect(() => { setQ(value ?? '') }, [value])

  function type(v: string) {
    setQ(v); setMsg(''); clearTimeout(timer.current)
    if (v.trim().length < 3) { setRes([]); return }
    timer.current = window.setTimeout(async () => {
      if (!navigator.onLine) { setMsg(t('err_network_error')); return }
      setBusy(true)
      try { const r = await api<Place[]>('/search?q=' + encodeURIComponent(v.trim())); setRes(r); if (!r.length) setMsg(t('no_results')) }
      catch (e) { setRes([]); setMsg(err(e)) } finally { setBusy(false) }
    }, 500)
  }
  async function locate() {
    setMsg('')
    try { const p = await getPosition(); onPick({ name: t('my_location'), lat: p.lat, lng: p.lng }); setRes([]) } catch { setMsg(t('err_geolocation')) }
  }
  return (
    <div className="place">
      <div className="row">
        <input value={q} onChange={e => type(e.target.value)} placeholder={placeholder ?? t('search_place')} aria-label={placeholder ?? t('search_place')} disabled={!online && false} />
        <button type="button" className="icon-btn" onClick={locate} title={t('my_location')} aria-label={t('my_location')}>🎯</button>
        {onPickOnMap && <button type="button" className={'icon-btn' + (picking ? ' on' : '')} onClick={onPickOnMap} title={t('pick_on_map')} aria-label={t('pick_on_map')}>🗺️</button>}
      </div>
      {busy && <small>{t('loading')}</small>}
      {msg && <small className="err">{msg}</small>}
      {res.length > 0 && <ul className="results">{res.map((p, i) => <li key={i}><button type="button" onClick={() => { onPick(p); setQ(p.name.split(',').slice(0, 2).join(',')); setRes([]) }}>{p.name}</button></li>)}</ul>}
    </div>
  )
}
