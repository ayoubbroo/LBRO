import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import MapView from '../components/MapView'
import PlaceSearch from '../components/PlaceSearch'
import { Empty, Notice, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../i18n'
import type { Favorite, Place } from '../lib/types'

const KIND_ICON = { HOME: '🏠', WORK: '💼', CUSTOM: '📍' } as const
interface Draft { id?: string; label: string; kind: Favorite['kind']; lat?: number; lng?: number; radiusM: number; notify: boolean }
const blank: Draft = { label: '', kind: 'CUSTOM', radiusM: 1000, notify: true }

export default function FavoritesPage() {
  const { t, err } = useI18n()
  const { user, loading } = useAuth()
  const nav = useNavigate()
  const [items, setItems] = useState<Favorite[] | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [pickMap, setPickMap] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => { if (!user) return; try { setItems(await api<Favorite[]>('/favorites')) } catch (e) { setError(err(e)) } }, [user, err])
  useEffect(() => { void load() }, [load])

  if (loading) return <Spinner />
  if (!user) return <div className="page"><Empty icon="⭐" text={t('login_required_favorites')} /><Link className="btn primary full" to="/profile">{t('login')}</Link></div>

  const start = (kind: Favorite['kind']) => setDraft({ ...blank, kind, label: kind === 'HOME' ? t('fav_home') : kind === 'WORK' ? t('fav_work') : '' })
  const pick = (p: Place) => setDraft(d => d && { ...d, lat: p.lat, lng: p.lng, label: d.label || p.name.split(',')[0] })

  async function save() {
    if (!draft || draft.lat === undefined || draft.lng === undefined || !draft.label.trim()) { setError(t('fav_incomplete')); return }
    setBusy(true); setError('')
    const body = { label: draft.label.trim(), kind: draft.kind, lat: draft.lat, lng: draft.lng, radiusM: draft.radiusM, notify: draft.notify }
    try {
      await api(draft.id ? `/favorites/${draft.id}` : '/favorites', { method: draft.id ? 'PATCH' : 'POST', body })
      setDraft(null); setPickMap(false); await load()
    } catch (e) { setError(err(e)) } finally { setBusy(false) }
  }
  async function remove(f: Favorite) {
    if (!confirm(t('fav_delete_confirm', { name: f.label }))) return
    try { await api(`/favorites/${f.id}`, { method: 'DELETE' }); await load() } catch (e) { setError(err(e)) }
  }
  const has = (k: Favorite['kind']) => items?.some(f => f.kind === k)

  return (
    <div className="page">
      <h2>{t('nav_favorites')}</h2>
      {error && <Notice tone="error">{error}</Notice>}
      {!draft && (
        <div className="row wrap">
          {!has('HOME') && <button className="btn ghost" onClick={() => start('HOME')}>🏠 {t('fav_add_home')}</button>}
          {!has('WORK') && <button className="btn ghost" onClick={() => start('WORK')}>💼 {t('fav_add_work')}</button>}
          <button className="btn ghost" onClick={() => start('CUSTOM')}>📍 {t('fav_add_custom')}</button>
        </div>
      )}
      {draft && (
        <div className="card">
          <b>{draft.id ? t('fav_edit') : t('fav_new')} {KIND_ICON[draft.kind]}</b>
          <input value={draft.label} maxLength={60} onChange={e => setDraft({ ...draft, label: e.target.value })} placeholder={t('fav_label')} aria-label={t('fav_label')} />
          <PlaceSearch placeholder={t('fav_place')} onPick={pick} onPickOnMap={() => setPickMap(m => !m)} picking={pickMap} />
          {pickMap && <MapView className="map mini" pin={draft.lat !== undefined ? { lat: draft.lat, lng: draft.lng! } : null} onMapClick={p => pick({ ...p, name: draft.label || t('fav_new') })} onPinDrag={p => pick({ ...p, name: draft.label })} flyTo={draft.lat !== undefined ? { lat: draft.lat, lng: draft.lng!, zoom: 14, nonce: 1 } : null} />}
          {draft.lat !== undefined && <p className="muted small">📍 {draft.lat.toFixed(5)}, {draft.lng!.toFixed(5)}</p>}
          <label className="lbl">{t('fav_radius')}: {draft.radiusM} m</label>
          <input type="range" min={200} max={5000} step={100} value={draft.radiusM} onChange={e => setDraft({ ...draft, radiusM: +e.target.value })} />
          <label className="check"><input type="checkbox" checked={draft.notify} onChange={e => setDraft({ ...draft, notify: e.target.checked })} /> {t('fav_notify')}</label>
          <div className="row"><button className="btn primary" disabled={busy} onClick={save}>{t('save')}</button><button className="btn ghost" onClick={() => { setDraft(null); setPickMap(false); setError('') }}>{t('cancel')}</button></div>
        </div>
      )}
      {items === null ? <Spinner /> : items.length === 0 && !draft ? <Empty icon="⭐" text={t('fav_empty')} /> : items.map(f => (
        <article className="card" key={f.id}>
          <div className="row between"><b>{KIND_ICON[f.kind]} {f.label}</b><span className="muted small">{f.notify ? '🔔' : '🔕'} {f.radiusM} m</span></div>
          <div className="row wrap">
            <button className="btn ghost" onClick={() => nav(`/routes?to=${f.lat},${f.lng}&toLabel=${encodeURIComponent(f.label)}`)}>➡️ {t('route_to_fav')}</button>
            <button className="btn ghost" onClick={() => nav(`/routes?from=${f.lat},${f.lng}&fromLabel=${encodeURIComponent(f.label)}`)}>⬅️ {t('route_from_fav')}</button>
            <button className="btn ghost" onClick={() => setDraft({ id: f.id, label: f.label, kind: f.kind, lat: f.lat, lng: f.lng, radiusM: f.radiusM, notify: f.notify })}>✏️ {t('edit')}</button>
            <button className="btn warn" onClick={() => remove(f)}>🗑️ {t('delete')}</button>
          </div>
        </article>
      ))}
    </div>
  )
}
