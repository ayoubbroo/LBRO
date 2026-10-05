import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Empty, Notice, Spinner, StatusBadge, TypeLabel } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { INCIDENT_TYPES } from '../lib/constants'
import { useNotifText } from './NotificationsPage'
import { useI18n } from '../i18n'
import type { Incident } from '../lib/types'

type Tab = 'dashboard' | 'reports' | 'incidents' | 'users' | 'notifications' | 'providers' | 'audit'
const TABS: Tab[] = ['dashboard', 'reports', 'incidents', 'users', 'notifications', 'providers', 'audit']

export default function AdminPage() {
  const { t } = useI18n()
  const { user, loading } = useAuth()
  const [tab, setTab] = useState<Tab>('dashboard')
  if (loading) return <Spinner />
  if (user?.role !== 'ADMIN') return <div className="page"><Notice tone="error">{t('err_admin_only')}</Notice><Link className="btn ghost" to="/profile">{t('nav_profile')}</Link></div>
  return (
    <div className="page wide">
      <h2>🛠️ {t('nav_admin')}</h2>
      <div className="tabs" role="tablist">{TABS.map(k => <button key={k} role="tab" aria-selected={tab === k} className={'chip' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{t(('admin_tab_' + k) as any)}</button>)}</div>
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'reports' && <Incidents key="r" defaultStatus="PENDING" />}
      {tab === 'incidents' && <Incidents key="i" defaultStatus="" />}
      {tab === 'users' && <Users />}
      {tab === 'notifications' && <AdminNotifs />}
      {tab === 'providers' && <Providers />}
      {tab === 'audit' && <Audit />}
    </div>
  )
}

function useLoad<T>(path: string) {
  const { err } = useI18n()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const reload = useCallback(() => { api<T>(path).then(d => { setData(d); setError('') }).catch(e => setError(err(e))) }, [path, err])
  useEffect(reload, [reload])
  return { data, error, reload }
}

function Dashboard() {
  const { t, num } = useI18n()
  const { data, error } = useLoad<Record<string, number>>('/admin/stats')
  if (error) return <Notice tone="error">{error}</Notice>
  if (!data) return <Spinner />
  const keys = ['total', 'pending', 'confirmed', 'rejected', 'expired', 'today', 'week', 'users', 'unreadNotifications']
  return <div className="stats grid3">{keys.map(k => <div className="card stat" key={k}><small>{t(('stat_' + k) as any)}</small><b>{num(data[k] ?? 0)}</b></div>)}</div>
}

function Incidents({ defaultStatus }: { defaultStatus: string }) {
  const { t, err, date } = useI18n()
  const [status, setStatus] = useState(defaultStatus), [type, setType] = useState('')
  const q = `/admin/incidents?take=100${status ? '&status=' + status : ''}${type ? '&type=' + type : ''}`
  const { data, error, reload } = useLoad<{ items: (Incident & { createdById: string | null })[]; total: number }>(q)
  const [msg, setMsg] = useState('')
  async function act(i: Incident, a: 'approve' | 'reject' | 'expire' | 'delete') {
    setMsg('')
    try {
      if (a === 'delete') { if (!confirm(t('admin_delete_confirm'))) return; await api(`/admin/incidents/${i.id}`, { method: 'DELETE' }) }
      else {
        const reason = a === 'reject' ? prompt(t('admin_reject_reason')) ?? undefined : undefined
        if (a === 'reject' && reason === undefined) return
        await api(`/admin/incidents/${i.id}/${a}`, { method: 'POST', body: reason ? { reason } : {} })
      }
      reload()
    } catch (e) { setMsg(err(e)) }
  }
  return (
    <>
      <div className="row wrap">
        <select value={status} onChange={e => setStatus(e.target.value)} aria-label={t('status')}><option value="">{t('all')}</option>{['PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED'].map(s => <option key={s} value={s}>{t(('status_' + s.toLowerCase()) as any)}</option>)}</select>
        <select value={type} onChange={e => setType(e.target.value)} aria-label={t('report_type')}><option value="">{t('all')}</option>{INCIDENT_TYPES.map(([k]) => <option key={k} value={k}>{t(('type_' + k) as any)}</option>)}</select>
        <span className="muted small">{data ? t('admin_total', { n: data.total }) : ''}</span>
      </div>
      {(error || msg) && <Notice tone="error">{error || msg}</Notice>}
      {!data ? <Spinner /> : data.items.length === 0 ? <Empty text={t('admin_none')} /> : (
        <div className="tablewrap"><table>
          <thead><tr><th>{t('report_type')}</th><th>{t('status')}</th><th>{t('location')}</th><th>{t('confirmations')}</th><th>📷</th><th>{t('reported_at')}</th><th>{t('actions')}</th></tr></thead>
          <tbody>{data.items.map(i => (
            <tr key={i.id}>
              <td><TypeLabel type={i.type} />{i.isDemo && <span className="badge demo">{t('demo')}</span>}</td><td><StatusBadge status={i.status} /></td>
              <td dir="ltr">{i.latitude.toFixed(4)}, {i.longitude.toFixed(4)}</td><td>{i.confirmCount}/{i.goneCount}</td><td>{i.photos.length}</td><td>{date(i.createdAt)}</td>
              <td className="acts">
                {i.status !== 'CONFIRMED' && <button className="mini ok" onClick={() => act(i, 'approve')}>{t('approve')}</button>}
                {i.status !== 'REJECTED' && <button className="mini warn" onClick={() => act(i, 'reject')}>{t('reject')}</button>}
                {(i.status === 'PENDING' || i.status === 'CONFIRMED') && <button className="mini" onClick={() => act(i, 'expire')}>{t('expire')}</button>}
                <button className="mini bad" onClick={() => act(i, 'delete')}>{t('delete')}</button>
              </td>
            </tr>))}</tbody>
        </table></div>
      )}
    </>
  )
}

function Users() {
  const { t, err, date } = useI18n()
  const { user: me } = useAuth()
  const [q, setQ] = useState('')
  const { data, error, reload } = useLoad<{ items: { id: string; email: string; name: string | null; role: 'USER' | 'ADMIN'; isActive: boolean; createdAt: string; lastLoginAt: string | null }[]; total: number }>(`/admin/users?take=100${q ? '&q=' + encodeURIComponent(q) : ''}`)
  const [msg, setMsg] = useState('')
  async function patch(id: string, body: object) { setMsg(''); try { await api(`/admin/users/${id}`, { method: 'PATCH', body }); reload() } catch (e) { setMsg(err(e)) } }
  return (
    <>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('search')} aria-label={t('search')} />
      {(error || msg) && <Notice tone="error">{error || msg}</Notice>}
      {!data ? <Spinner /> : <div className="tablewrap"><table>
        <thead><tr><th>{t('email')}</th><th>{t('name')}</th><th>{t('role')}</th><th>{t('status')}</th><th>{t('last_login')}</th><th>{t('actions')}</th></tr></thead>
        <tbody>{data.items.map(u => (
          <tr key={u.id}><td dir="ltr">{u.email}</td><td>{u.name ?? '—'}</td><td>{u.role}</td><td>{u.isActive ? t('active_user') : t('disabled_user')}</td><td>{u.lastLoginAt ? date(u.lastLoginAt) : '—'}</td>
            <td className="acts">{u.id !== me?.id && <>
              <button className="mini" onClick={() => patch(u.id, { role: u.role === 'ADMIN' ? 'USER' : 'ADMIN' })}>{u.role === 'ADMIN' ? t('make_user') : t('make_admin')}</button>
              <button className="mini warn" onClick={() => patch(u.id, { isActive: !u.isActive })}>{u.isActive ? t('disable') : t('enable')}</button></>}</td></tr>))}</tbody>
      </table></div>}
    </>
  )
}

function AdminNotifs() {
  const { t, date } = useI18n()
  const text = useNotifText()
  const { data, error } = useLoad<{ items: { id: string; type: string; data: any; title: string; body: string; userId: string; readAt: string | null; createdAt: string }[]; total: number }>('/admin/notifications?take=100')
  if (error) return <Notice tone="error">{error}</Notice>
  if (!data) return <Spinner />
  if (!data.items.length) return <Empty icon="🔔" text={t('notif_empty')} />
  return <div className="tablewrap"><table><thead><tr><th>{t('notif_type')}</th><th>{t('notif_message')}</th><th>{t('status')}</th><th>{t('reported_at')}</th></tr></thead>
    <tbody>{data.items.map(n => { const x = text(n); return <tr key={n.id}><td>{x.icon} {x.title}</td><td>{x.body}</td><td>{n.readAt ? t('read') : t('unread')}</td><td>{date(n.createdAt)}</td></tr> })}</tbody></table></div>
}

function Providers() {
  const { t } = useI18n()
  const { data, error } = useLoad<any>('/admin/providers')
  if (error) return <Notice tone="error">{error}</Notice>
  if (!data) return <Spinner />
  const tr = data.traffic
  return (
    <div className="stack">
      <div className="card"><b>📡 {t('provider_traffic')}</b>
        <p>{t('provider_requested')}: <code>{tr.requested}</code> → {t('provider_active')}: <code>{tr.active}</code></p>
        <Notice tone={tr.available ? 'ok' : 'warn'}>{tr.available ? t('provider_live_on') : t(('provider_reason_' + tr.reason) as any)}</Notice></div>
      <div className="card"><b>🤖 {t('provider_ai')}</b><p><code>{data.ai.name}</code> — {data.ai.available ? t('enabled') : t('disabled')}</p></div>
      <div className="card"><b>🗄️ {t('provider_storage')}</b><p><code>{data.storage.name}</code></p></div>
      <div className="card"><b>🧭 {t('provider_geo')}</b><p dir="ltr"><code>{data.geocoding.url}</code><br /><code>{data.routing.url}</code></p></div>
    </div>
  )
}

function Audit() {
  const { t, date } = useI18n()
  const { data, error } = useLoad<{ items: { id: string; action: string; actorId: string | null; entity: string | null; entityId: string | null; meta: any; at: string }[]; total: number }>('/admin/audit?take=100')
  if (error) return <Notice tone="error">{error}</Notice>
  if (!data) return <Spinner />
  if (!data.items.length) return <Empty text={t('admin_none')} />
  const label = (a: string) => { const k = 'audit_' + a.replace('.', '_'); const s = t(k as any); return s === k ? a : s }
  return <div className="tablewrap"><table><thead><tr><th>{t('reported_at')}</th><th>{t('actions')}</th><th>{t('audit_target')}</th><th>{t('audit_details')}</th></tr></thead>
    <tbody>{data.items.map(a => <tr key={a.id}><td>{date(a.at)}</td><td>{label(a.action)}</td><td dir="ltr">{a.entity}{a.entityId ? ' ' + a.entityId.slice(0, 8) : ''}</td><td dir="ltr"><small>{a.meta ? JSON.stringify(a.meta) : ''}</small></td></tr>)}</tbody></table></div>
}
