import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Empty, Notice, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useApp } from '../lib/app'
import { useI18n } from '../i18n'
import type { Notif } from '../lib/types'

export function useNotifText() {
  const { t } = useI18n()
  return (n: { type: string; data: Record<string, any> | null; title: string; body: string }) => {
    const d = n.data ?? {}
    const type = d.incidentType ? t(('type_' + d.incidentType) as any) : ''
    switch (n.type) {
      case 'INCIDENT_NEAR_FAVORITE': return { icon: '📍', title: t('notif_near_title'), body: t('notif_near_body', { type, place: d.favoriteLabel ?? '' }) }
      case 'REPORT_CONFIRMED': return { icon: '✅', title: t('notif_confirmed_title'), body: t('notif_confirmed_body', { type }) }
      case 'REPORT_REJECTED': return { icon: '⛔', title: t('notif_rejected_title'), body: t('notif_rejected_body', { type }) + (d.reason ? ` — ${d.reason}` : '') }
      case 'REPORT_EXPIRED': return { icon: '⏱️', title: t('notif_expired_title'), body: t('notif_expired_body', { type }) }
      default: return { icon: 'ℹ️', title: n.title, body: n.body }
    }
  }
}

export default function NotificationsPage() {
  const { t, err, date } = useI18n()
  const { user, loading } = useAuth()
  const { refreshUnread, browserNotifs, setBrowserNotifs, flash } = useApp()
  const text = useNotifText()
  const nav = useNavigate()
  const [items, setItems] = useState<Notif[] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!user) return
    try { setItems((await api<{ items: Notif[] }>('/notifications?take=100')).items); setError('') } catch (e) { setError(err(e)) }
  }, [user, err])
  useEffect(() => { void load() }, [load])

  if (loading) return <Spinner />
  if (!user) return <div className="page"><Empty icon="🔔" text={t('login_required_notifications')} /><Link className="btn primary full" to="/profile">{t('login')}</Link></div>

  async function open(n: Notif) {
    if (!n.readAt) { try { await api(`/notifications/${n.id}/read`, { method: 'POST' }); setItems(c => c && c.map(x => x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)); void refreshUnread() } catch { /* */ } }
    if (n.data?.lat != null) nav(`/routes?to=${n.data.lat},${n.data.lng}`)
  }
  async function readAll() { try { await api('/notifications/read-all', { method: 'POST' }); await load(); void refreshUnread() } catch (e) { setError(err(e)) } }
  async function toggleBrowser(on: boolean) { try { await setBrowserNotifs(on); flash(on ? t('browser_notifs_on') : t('browser_notifs_off')) } catch (e) { setError(err(e)) } }
  const supported = 'Notification' in window

  return (
    <div className="page">
      <div className="row between"><h2>{t('nav_notifications')}</h2><button className="btn ghost" onClick={readAll} disabled={!items?.some(n => !n.readAt)}>{t('mark_all_read')}</button></div>
      {supported && (
        <label className="check card"><input type="checkbox" checked={browserNotifs} onChange={e => void toggleBrowser(e.target.checked)} /> <span>{t('browser_notifs')}<br /><small className="muted">{t('browser_notifs_hint')}</small></span></label>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {items === null ? <Spinner /> : items.length === 0 ? <Empty icon="🔔" text={t('notif_empty')} /> : items.map(n => {
        const x = text(n)
        return (
          <button key={n.id} className={'notif' + (n.readAt ? '' : ' unread')} onClick={() => void open(n)}>
            <span className="ico">{x.icon}</span><span><b>{x.title}</b><br />{x.body}<br /><small className="muted">{date(n.createdAt)}</small></span>
            {!n.readAt && <i className="dot sm" aria-label={t('unread')} />}
          </button>
        )
      })}
    </div>
  )
}
