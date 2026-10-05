import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fr, type TKey } from './fr'
import { ar } from './ar'
import { en } from './en'

export type Lang = 'ar' | 'fr' | 'en'
export const LANGS: { code: Lang; label: string }[] = [{ code: 'ar', label: 'العربية' }, { code: 'fr', label: 'Français' }, { code: 'en', label: 'English' }]
export const DICTS: Record<Lang, Record<TKey, string>> = { fr, ar, en }
const LOCALE: Record<Lang, string> = { ar: 'ar-MA', fr: 'fr-MA', en: 'en-GB' }
const KEY = 'tm-lang'

export function format(s: string, vars?: Record<string, string | number>) {
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : s
}
/** Pure translator (also used by tests and non-React code). Falls back to French, then to the key. */
export function translate(lang: Lang, key: string, vars?: Record<string, string | number>) {
  return format((DICTS[lang] as Record<string, string>)[key] ?? (fr as Record<string, string>)[key] ?? key, vars)
}
/** Maps an API error code (or network failure) to a translated message. Unknown codes get a generic translated message. */
export function translateError(lang: Lang, code: string | undefined) {
  const k = 'err_' + (code || 'unknown_error')
  return translate(lang, k in fr ? k : 'err_unknown_error')
}

interface Ctx {
  lang: Lang; dir: 'rtl' | 'ltr'; setLang(l: Lang): void
  t(key: TKey, vars?: Record<string, string | number>): string
  err(e: unknown): string
  date(d: string | Date): string
  num(n: number, o?: Intl.NumberFormatOptions): string
}
const I18n = createContext<Ctx>(null as any)
export const useI18n = () => useContext(I18n)

const initial = (): Lang => {
  try { const s = localStorage.getItem(KEY); if (s === 'ar' || s === 'fr' || s === 'en') return s } catch { /* */ }
  const n = (navigator.language || 'fr').slice(0, 2)
  return n === 'ar' || n === 'en' ? n : 'fr'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial)
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  useEffect(() => { document.documentElement.dir = dir; document.documentElement.lang = lang }, [lang, dir])
  const setLang = useCallback((l: Lang) => { setLangState(l); try { localStorage.setItem(KEY, l) } catch { /* */ } }, [])
  const value = useMemo<Ctx>(() => ({
    lang, dir, setLang,
    t: (key, vars) => translate(lang, key, vars),
    err: (e: unknown) => translateError(lang, (e as any)?.code),
    // latn digits keep numbers readable next to Latin-script place names even in Arabic UI
    date: d => new Date(d).toLocaleString(LOCALE[lang] + '-u-nu-latn', { dateStyle: 'short', timeStyle: 'short' }),
    num: (n, o) => n.toLocaleString(LOCALE[lang] + '-u-nu-latn', o),
  }), [lang, dir, setLang])
  return <I18n.Provider value={value}>{children}</I18n.Provider>
}
