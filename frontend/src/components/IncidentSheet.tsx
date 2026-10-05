import { useState } from 'react'
import { useI18n } from '../i18n'
import { useApp } from '../lib/app'
import { api } from '../lib/api'
import { timeLeft } from '../lib/geo'
import type { Incident } from '../lib/types'
import { DataKind, Notice, Sheet, StatusBadge, TypeLabel } from './ui'

export default function IncidentSheet({ incident, onClose, onChanged, onRouteTo }: { incident: Incident; onClose(): void; onChanged(): void; onRouteTo?(i: Incident): void }) {
  const { t, err, date, num } = useI18n()
  const { flash, online } = useApp()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [zoom, setZoom] = useState<string | null>(null)
  const open = incident.status === 'PENDING' || incident.status === 'CONFIRMED'

  async function vote(k: 'confirm' | 'gone') {
    setBusy(true); setMsg('')
    try { await api(`/incidents/${incident.id}/${k}`, { method: 'POST' }); flash(t('vote_thanks')); onChanged(); onClose() }
    catch (e) { setMsg(err(e)) } finally { setBusy(false) }
  }
  return (
    <Sheet title={t(('type_' + incident.type) as any)} onClose={onClose}>
      <div className="row wrap"><TypeLabel type={incident.type} /><StatusBadge status={incident.status} /><DataKind kind="reports" />{incident.isDemo && <span className="badge demo">{t('demo')}</span>}</div>
      {incident.description && <p>{incident.description}</p>}
      {incident.photos.length > 0 && <div className="thumbs">{incident.photos.map(p => <button key={p.id} className="thumb" onClick={() => setZoom(p.url)}><img src={p.url} alt={t('photo')} loading="lazy" /></button>)}</div>}
      <dl className="facts">
        <dt>{t('confirmations')}</dt><dd>👍 {num(incident.confirmCount)} · 👎 {num(incident.goneCount)}</dd>
        <dt>{t('reported_at')}</dt><dd>{date(incident.createdAt)}</dd>
        <dt>{t('expires_in')}</dt><dd>{timeLeft(incident.expiresAt, t)}</dd>
      </dl>
      <p className="muted small">{t('report_disclaimer')}</p>
      {msg && <Notice tone="error">{msg}</Notice>}
      <div className="row wrap">
        {open && <><button className="btn ok" disabled={busy || !online} onClick={() => vote('confirm')}>👍 {t('confirm')}</button><button className="btn warn" disabled={busy || !online} onClick={() => vote('gone')}>👎 {t('gone')}</button></>}
        {onRouteTo && <button className="btn ghost" onClick={() => onRouteTo(incident)}>🧭 {t('route_here')}</button>}
      </div>
      {zoom && <div className="lightbox" onClick={() => setZoom(null)} role="dialog"><img src={zoom} alt={t('photo')} /></div>}
    </Sheet>
  )
}
