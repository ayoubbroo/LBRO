import { NavLink, Outlet } from 'react-router-dom'
import { LANGS, useI18n, type Lang } from '../i18n'
import { useApp } from '../lib/app'

const NAV = [
  { to: '/', icon: '🗺️', k: 'nav_map', end: true },
  { to: '/reports', icon: '📋', k: 'nav_reports' },
  { to: '/routes', icon: '🧭', k: 'nav_routes' },
  { to: '/favorites', icon: '⭐', k: 'nav_favorites' },
  { to: '/notifications', icon: '🔔', k: 'nav_notifications' },
  { to: '/profile', icon: '👤', k: 'nav_profile' },
] as const

export default function Layout() {
  const { t, lang, setLang } = useI18n()
  const { online, queued, syncing, unread, toast, syncNow } = useApp()
  return (
    <div className="shell">
      <header className="topbar">
        <b className="brand">🇲🇦 {t('app_name')}</b>
        <div className="row">
          <span className={'conn ' + (online ? 'on' : 'off')} role="status">{online ? '● ' + t('online') : '○ ' + t('offline')}</span>
          <select value={lang} onChange={e => setLang(e.target.value as Lang)} aria-label={t('language')}>{LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}</select>
        </div>
      </header>
      {(queued > 0 || syncing) && (
        <div className="banner warn" role="status">
          {syncing ? t('syncing') : t('queued_banner', { n: queued })}
          {online && !syncing && <button className="link" onClick={() => void syncNow()}>{t('sync_now')}</button>}
        </div>
      )}
      {!online && <div className="banner off" role="status">{t('offline_banner')}</div>}
      <main className="content"><Outlet /></main>
      {toast && <div className="toast" role="status">{toast}</div>}
      <nav className="bar" aria-label="main">
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={'end' in n} className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}>
            <span className="ico">{n.icon}{n.to === '/notifications' && unread > 0 && <i className="dot">{unread > 9 ? '9+' : unread}</i>}</span>
            <small>{t(n.k)}</small>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
