import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, getToken, setToken } from './api'
import type { User } from './types'
import { useI18n } from '../i18n'

interface Ctx {
  user: User | null; loading: boolean
  login(email: string, password: string): Promise<void>
  register(email: string, password: string, name?: string): Promise<void>
  logout(): Promise<void>
  update(patch: { name?: string; locale?: string; currentPassword?: string; newPassword?: string }): Promise<void>
}
const A = createContext<Ctx>(null as any)
export const useAuth = () => useContext(A)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { lang } = useI18n()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!!getToken())

  useEffect(() => {
    if (!getToken()) return
    api<{ user: User }>('/auth/me').then(r => setUser(r.user)).catch(e => { if (e.status === 401 || e.status === 403) setToken(null) }).finally(() => setLoading(false))
  }, [])
  // Expired / revoked token seen by any request.
  useEffect(() => { const h = () => { setToken(null); setUser(null) }; addEventListener('tm-unauthorized', h); return () => removeEventListener('tm-unauthorized', h) }, [])

  const accept = (r: { token: string; user: User }) => { setToken(r.token); setUser(r.user) }
  const login = useCallback(async (email: string, password: string) => accept(await api('/auth/login', { method: 'POST', body: { email, password } })), [])
  const register = useCallback(async (email: string, password: string, name?: string) => accept(await api('/auth/register', { method: 'POST', body: { email, password, name: name || undefined, locale: lang } })), [lang])
  const logout = useCallback(async () => { try { await api('/auth/logout', { method: 'POST' }) } catch { /* token may already be invalid */ } setToken(null); setUser(null) }, [])
  const update = useCallback(async (patch: any) => {
    const r = await api<{ user: User; token?: string }>('/auth/me', { method: 'PATCH', body: patch })
    if (r.token) setToken(r.token)
    setUser(r.user)
  }, [])
  return <A.Provider value={{ user, loading, login, register, logout, update }}>{children}</A.Provider>
}
