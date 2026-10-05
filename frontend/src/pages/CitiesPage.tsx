import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DataKind, Notice, Spinner, StatusBadge, TypeLabel } from '../components/ui'
import { api } from '../lib/api'
import { useApp } from '../lib/app'
import { useI18n } from '../i18n'
import type { City, Incident } from '../lib/types'

export const cityName = (c: City, lang: string) => (lang === 'ar' ? c.nameAr : lang === 'en' ? c.nameEn : null) || c.name
const MAJOR = ['casablanca', 'rabat', 'marrakech', 'fes', 'meknes', 'tanger', 'agadir', 'oujda', 'kenitra', 'tetouan', 'safi']

export function CitiesPage() {
  const { t, lang } = useI18n()
  const { cities } = useApp()
  const list = cities.filter(c => c.slug && MAJOR.includes(c.slug)).sort((a, b) => MAJOR.indexOf(a.slug!) - MAJOR.indexOf(b.slug!))
  return (
    <div className="page">
      <h2>{t('nav_cities')}</h2>
      <p className="muted small">{t('cities_intro')}</p>
      {list.length === 0 ? <Spinner /> : <div className="grid">{list.map(c => <Link key={c.id} className="card tile" to={`/cities/${c.slug}`}>🏙️ <b>{cityName(c, lang)}</b></Link>)}</div>}
    </div>
  )
}

interface Dash {
  city: City
  applicationReports: { active: number; confirmed: number; pending: number; last24h: number; byType: Record<string, number>; recent: Incident[] }
  liveTraffic: { available: boolean; provider: string; message: string; data: { level: string }[] }
}

export function CityPage() {
  const { id } = useParams()
  const { t, err, lang, num, date } = useI18n()
  const [d, setD] = useState<Dash | null>(null)
  const [error, setError] = useState('')
  const [ai, setAi] = useState<{ available: boolean } | null>(null)
  const [summary, setSummary] = useState<{ text: string | null; reason: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setD(null); setSummary(null)
    api<Dash>(`/cities/${id}/dashboard`).then(setD).catch(e => setError(err(e)))
    api<{ available: boolean }>('/ai/status').then(setAi).catch(() => setAi({ available: false }))
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function ask() {
    if (!d) return
    setBusy(true)
    try { const r = await api<{ summary: string | null; reason: string }>('/ai/summary', { method: 'POST', body: { cityId: d.city.id, lang } }); setSummary({ text: r.summary, reason: r.reason }) }
    catch (e) { setError(err(e)) } finally { setBusy(false) }
  }
  if (error && !d) return <div className="page"><Notice tone="error">{error}</Notice></div>
  if (!d) return <Spinner />
  const a = d.applicationReports, l = d.liveTraffic
  return (
    <div className="page">
      <Link className="link" to="/cities">← {t('nav_cities')}</Link>
      <h2>{cityName(d.city, lang)}</h2>

      <section className="card" aria-label={t('kind_reports')}>
        <div className="row between"><b>{t('kind_reports')}</b><DataKind kind="reports" /></div>
        <p className="muted small">{t('reports_explain')}</p>
        <div className="stats four">
          <div><small>{t('active')}</small><b>{num(a.active)}</b></div><div><small>{t('status_confirmed')}</small><b>{num(a.confirmed)}</b></div>
          <div><small>{t('status_pending')}</small><b>{num(a.pending)}</b></div><div><small>{t('last_24h')}</small><b>{num(a.last24h)}</b></div>
        </div>
        {Object.entries(a.byType).length > 0 && <div className="chipset">{Object.entries(a.byType).sort((x, y) => y[1] - x[1]).map(([k, n]) => <span key={k} className="chip static"><TypeLabel type={k} /> · {num(n)}</span>)}</div>}
        {a.recent.length === 0 ? <p className="muted">{t('city_no_reports')}</p> : <ul className="list">{a.recent.map(i => <li key={i.id}><TypeLabel type={i.type} /> <StatusBadge status={i.status} /> <small className="muted">{date(i.createdAt)}</small></li>)}</ul>}
      </section>

      <section className="card" aria-label={t('kind_live')}>
        <div className="row between"><b>{t('kind_live')}</b><DataKind kind="live" /></div>
        {l.available
          ? <><p className="muted small">{t('live_source', { p: l.provider })}</p><div className="chipset">{(['free', 'moderate', 'heavy', 'blocked'] as const).map(k => <span key={k} className="chip static">{t(('level_' + k) as any)} · {num(l.data.filter(x => x.level === k).length)}</span>)}</div>{l.data.length === 0 && <p className="muted">{t('live_no_data')}</p>}</>
          : <Notice tone="warn">{t(l.message === 'provider_error' ? 'traffic_provider_error' : 'traffic_no_provider')}</Notice>}
      </section>

      {ai?.available && (
        <section className="card">
          <b>🤖 {t('ai_title')}</b>
          <p className="muted small">{t('ai_explain')}</p>
          <button className="btn ghost" disabled={busy} onClick={ask}>{busy ? t('loading') : t('ai_ask')}</button>
          {summary && (summary.text ? <p>{summary.text}</p> : <Notice tone="warn">{t(summary.reason === 'no_reliable_data' ? 'ai_no_data' : 'ai_error')}</Notice>)}
        </section>
      )}
    </div>
  )
}
