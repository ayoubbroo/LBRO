import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Notice, Spinner } from '../components/ui'
import { useAuth } from '../lib/auth'
import { LANGS, useI18n, type Lang } from '../i18n'
import { useApp } from '../lib/app'

export default function ProfilePage() {
  const { t, err, lang, setLang } = useI18n()
  const { user, loading, login, register, logout, update } = useAuth()
  const { flash } = useApp()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [name, setName] = useState('')
  const [cur, setCur] = useState(''), [next, setNext] = useState('')
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)

  if (loading) return <Spinner />

  async function submit(e: FormEvent) {
    e.preventDefault(); setMsg(''); setBusy(true)
    try { mode === 'login' ? await login(email.trim(), password) : await register(email.trim(), password, name.trim()); setPassword('') } catch (x) { setMsg(err(x)) } finally { setBusy(false) }
  }
  async function saveProfile(e: FormEvent) {
    e.preventDefault(); setMsg(''); setBusy(true)
    try { await update({ name: name || user?.name || undefined, ...(next ? { currentPassword: cur, newPassword: next } : {}) }); setCur(''); setNext(''); flash(t('saved')) } catch (x) { setMsg(err(x)) } finally { setBusy(false) }
  }

  if (!user) return (
    <div className="page">
      <h2>{mode === 'login' ? t('login') : t('register')}</h2>
      <form className="card" onSubmit={submit}>
        {mode === 'register' && <input value={name} onChange={e => setName(e.target.value)} placeholder={t('name')} aria-label={t('name')} maxLength={80} autoComplete="name" />}
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder={t('email')} aria-label={t('email')} autoComplete="email" dir="ltr" />
        <input type="password" required minLength={mode === 'register' ? 8 : 1} value={password} onChange={e => setPassword(e.target.value)} placeholder={t('password')} aria-label={t('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} dir="ltr" />
        {mode === 'register' && <small className="muted">{t('password_hint')}</small>}
        {msg && <Notice tone="error">{msg}</Notice>}
        <button className="btn primary full" disabled={busy}>{mode === 'login' ? t('login') : t('register')}</button>
        <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setMsg('') }}>{mode === 'login' ? t('no_account') : t('have_account')}</button>
      </form>
      <p className="muted small">{t('anon_note')}</p>
    </div>
  )

  return (
    <div className="page">
      <h2>{t('nav_profile')}</h2>
      <div className="card">
        <div className="row between"><b>{user.name || user.email}</b>{user.role === 'ADMIN' && <span className="badge kind-live">ADMIN</span>}</div>
        <small className="muted" dir="ltr">{user.email}</small>
      </div>
      <form className="card" onSubmit={saveProfile}>
        <label className="lbl">{t('name')}</label>
        <input defaultValue={user.name ?? ''} onChange={e => setName(e.target.value)} maxLength={80} />
        <label className="lbl">{t('change_password')}</label>
        <input type="password" value={cur} onChange={e => setCur(e.target.value)} placeholder={t('current_password')} autoComplete="current-password" dir="ltr" />
        <input type="password" value={next} onChange={e => setNext(e.target.value)} minLength={next ? 8 : undefined} placeholder={t('new_password')} autoComplete="new-password" dir="ltr" />
        {msg && <Notice tone="error">{msg}</Notice>}
        <button className="btn primary" disabled={busy}>{t('save')}</button>
      </form>
      <div className="card">
        <label className="lbl">{t('language')}</label>
        <div className="row wrap">{LANGS.map(l => <button key={l.code} className={'chip' + (lang === l.code ? ' on' : '')} onClick={() => { setLang(l.code as Lang); void update({ locale: l.code }).catch(() => {}) }}>{l.label}</button>)}</div>
      </div>
      <div className="card"><Link className="btn ghost full" to="/cities">🏙️ {t('nav_cities')}</Link>{user.role === 'ADMIN' && <Link className="btn ghost full" to="/admin">🛠️ {t('nav_admin')}</Link>}</div>
      <button className="btn warn full" onClick={() => void logout()}>{t('logout')}</button>
    </div>
  )
}
