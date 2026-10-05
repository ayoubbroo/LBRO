import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Empty, Notice, Spinner, StatusBadge, TypeLabel } from '../components/ui'
import { api, uploadPhoto } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useApp } from '../lib/app'
import { readQueue } from '../lib/queue'
import { timeLeft } from '../lib/geo'
import { useI18n } from '../i18n'
import type { Incident, Status } from '../lib/types'

export default function ReportsPage() {
  const { t, err, date, num } = useI18n()
  const { user, loading } = useAuth()
  const { cities, queued, flash } = useApp()
  const [items, setItems] = useState<Incident[] | null>(null)
  const [filter, setFilter] = useState<'ALL' | Status>('ALL')
  const [error, setError] = useState('')
  const [up, setUp] = useState<{ id: string; pct: number } | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    try { const r = await api<{ items: Incident[] }>('/me/incidents?take=100' + (filter !== 'ALL' ? '&status=' + filter : '')); setItems(r.items); setError('') } catch (e) { setError(err(e)) }
  }, [user, filter, err])
  useEffect(() => { void load() }, [load])
  useEffect(() => { const h = () => void load(); addEventListener('tm-incidents-changed', h); return () => removeEventListener('tm-incidents-changed', h) }, [load])

  if (loading) return <Spinner />
  if (!user) return <div className="page"><Empty icon="🔒" text={t('login_required_reports')} /><Link className="btn primary full" to="/profile">{t('login')}</Link>{queued > 0 && <Notice tone="warn">{t('queued_banner', { n: queued })}</Notice>}</div>

  const cityName = (id: string | null) => cities.find(c => c.id === id)?.name
  async function addPhoto(id: string, f: File | undefined) {
    if (!f) return
    setUp({ id, pct: 0 })
    try { await uploadPhoto(id, f, pct => setUp({ id, pct })); flash(t('photo_uploaded')); await load() } catch (e) { flash(err(e)) } finally { setUp(null) }
  }
  return (
    <div className="page">
      <h2>{t('nav_reports')}</h2>
      <div className="chipset">{(['ALL', 'PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED'] as const).map(s => <button key={s} className={'chip' + (filter === s ? ' on' : '')} onClick={() => setFilter(s)}>{s === 'ALL' ? t('all') : t(('status_' + s.toLowerCase()) as any)}</button>)}</div>
      {readQueue().length > 0 && <Notice tone="warn">{t('queued_banner', { n: readQueue().length })}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {items === null ? <Spinner /> : items.length === 0 ? <Empty text={t('no_reports')} /> : items.map(i => (
        <article className="card" key={i.id}>
          <div className="row between"><TypeLabel type={i.type} /><StatusBadge status={i.status} /></div>
          {i.description && <p>{i.description}</p>}
          <dl className="facts">
            <dt>{t('location')}</dt><dd>{cityName(i.cityId) ? cityName(i.cityId) + ' · ' : ''}{i.latitude.toFixed(4)}, {i.longitude.toFixed(4)} <Link className="link" to={`/routes?to=${i.latitude},${i.longitude}`}>🧭</Link></dd>
            <dt>{t('confirmations')}</dt><dd>👍 {num(i.confirmCount)} · 👎 {num(i.goneCount)}</dd>
            <dt>{t('reported_at')}</dt><dd>{date(i.createdAt)}</dd>
            <dt>{t('expires_in')}</dt><dd>{i.status === 'PENDING' || i.status === 'CONFIRMED' ? timeLeft(i.expiresAt, t) : date(i.expiresAt)}</dd>
          </dl>
          {i.status === 'REJECTED' && i.rejectionReason && <Notice tone="warn">{t('rejected_reason')}: {i.rejectionReason}</Notice>}
          {i.photos.length > 0 && <div className="thumbs">{i.photos.map(p => <a key={p.id} className="thumb" href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={t('photo')} loading="lazy" /></a>)}</div>}
          {(i.status === 'PENDING' || i.status === 'CONFIRMED') && i.photos.length < 4 && (
            <label className="btn ghost">{up?.id === i.id ? `${up.pct}%` : '📷 ' + t('add_photo')}
              <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden disabled={!!up} onChange={e => { void addPhoto(i.id, e.target.files?.[0]); e.target.value = '' }} /></label>
          )}
        </article>
      ))}
    </div>
  )
}
