import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, ApiError } from './api'
import { enqueue, readQueue, syncQueue, type QueuedReport } from './queue'
import { useAuth } from './auth'
import { useI18n } from '../i18n'
import type { City, Notif } from './types'

interface Ctx {
  online: boolean; queued: number; syncing: boolean
  cities: City[]; unread: number; refreshUnread(): void
  flash(msg: string): void; toast: string
  submitReport(r: { type: string; latitude: number; longitude: number; description: string }): Promise<{ queued: boolean; id?: string; duplicate?: boolean }>
  syncNow(): Promise<void>
  browserNotifs: boolean; setBrowserNotifs(on: boolean): Promise<void>
}
const C = createContext<Ctx>(null as any)
export const useApp = () => useContext(C)

const BN_KEY = 'tm-browser-notifs'
// 4xx (except 408/429) means the server rejected the report for good: retrying can never succeed.
const permanent = (e: unknown) => e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { t } = useI18n()
  const [online, setOnline] = useState(navigator.onLine)
  const [queued, setQueued] = useState(readQueue().length)
  const [syncing, setSyncing] = useState(false)
  const [cities, setCities] = useState<City[]>([])
  const [unread, setUnread] = useState(0)
  const [toast, setToast] = useState('')
  const [browserNotifs, setBN] = useState(() => { try { return localStorage.getItem(BN_KEY) === '1' && 'Notification' in window && Notification.permission === 'granted' } catch { return false } })
  const lastUnread = useRef(0)
  const timer = useRef(0)

  const flash = useCallback((m: string) => { setToast(m); clearTimeout(timer.current); timer.current = window.setTimeout(() => setToast(''), 4000) }, [])

  const syncNow = useCallback(async () => {
    if (!navigator.onLine || !readQueue().length) return
    setSyncing(true)
    try {
      const r = await syncQueue(async (q: QueuedReport) => { await api('/incidents', { method: 'POST', body: { type: q.type, latitude: q.latitude, longitude: q.longitude, description: q.description, clientId: q.clientId } }) }, permanent)
      setQueued(r.left)
      if (r.sent) flash(t('sync_done', { n: r.sent }))
      window.dispatchEvent(new Event('tm-incidents-changed'))
    } finally { setSyncing(false) }
  }, [flash, t])

  useEffect(() => {
    const on = () => { setOnline(true); void syncNow() }, off = () => setOnline(false)
    addEventListener('online', on); addEventListener('offline', off)
    void syncNow()
    const iv = window.setInterval(() => void syncNow(), 30_000) // retry in case the 'online' event was missed
    // The service worker can ask the page to sync (Background Sync).
    const msg = (e: MessageEvent) => { if (e.data?.type === 'tm-sync') void syncNow() }
    navigator.serviceWorker?.addEventListener('message', msg)
    return () => { removeEventListener('online', on); removeEventListener('offline', off); clearInterval(iv); navigator.serviceWorker?.removeEventListener('message', msg) }
  }, [syncNow])

  useEffect(() => { api<City[]>('/cities').then(setCities).catch(() => {}) }, [])

  const refreshUnread = useCallback(async () => {
    if (!user) { setUnread(0); lastUnread.current = 0; return }
    try {
      const r = await api<{ unread: number }>('/notifications/unread-count')
      if (r.unread > lastUnread.current && browserNotifs && 'Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
        const l = await api<{ items: Notif[] }>('/notifications?unread=true&take=1')
        if (l.items[0]) new Notification(t('app_name'), { body: t('notif_new_count', { n: r.unread }), icon: '/icon.svg', tag: 'tm-unread' })
      }
      lastUnread.current = r.unread; setUnread(r.unread)
    } catch { /* offline */ }
  }, [user, browserNotifs, t])
  useEffect(() => { void refreshUnread(); const iv = window.setInterval(() => void refreshUnread(), 60_000); return () => clearInterval(iv) }, [refreshUnread])

  /** Browser notifications only after an explicit click AND the browser's own permission prompt. */
  const setBrowserNotifs = useCallback(async (on: boolean) => {
    if (!on) { try { localStorage.setItem(BN_KEY, '0') } catch { /* */ } setBN(false); return }
    if (!('Notification' in window)) throw new ApiError(0, 'notifications_unsupported')
    const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    if (p !== 'granted') throw new ApiError(0, 'notifications_denied')
    try { localStorage.setItem(BN_KEY, '1') } catch { /* */ }
    setBN(true)
  }, [])

  const submitReport: Ctx['submitReport'] = useCallback(async r => {
    const clientId = crypto.randomUUID()
    try {
      if (!navigator.onLine) throw new ApiError(0, 'network_error')
      const res = await api<{ id?: string; duplicateOf?: string }>('/incidents', { method: 'POST', body: { ...r, clientId } })
      window.dispatchEvent(new Event('tm-incidents-changed'))
      return { queued: false, id: res.id ?? res.duplicateOf, duplicate: !!res.duplicateOf }
    } catch (e) {
      if (e instanceof ApiError && e.network) { enqueue({ ...r, clientId }); setQueued(readQueue().length); void navigator.serviceWorker?.ready.then((reg: any) => reg.sync?.register('tm-sync')).catch(() => {}); return { queued: true } }
      throw e
    }
  }, [])

  return <C.Provider value={{ online, queued, syncing, cities, unread, refreshUnread, flash, toast, submitReport, syncNow, browserNotifs, setBrowserNotifs }}>{children}</C.Provider>
}
