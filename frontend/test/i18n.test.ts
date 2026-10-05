import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fr } from '../src/i18n/fr'
import { ar } from '../src/i18n/ar'
import { en } from '../src/i18n/en'
import { translate, translateError, format } from '../src/i18n'

const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')
const walk = (d: string): string[] => readdirSync(d).flatMap(f => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))

describe('translation files', () => {
  it('ar, en and fr define exactly the same keys', () => {
    const k = Object.keys(fr).sort()
    expect(Object.keys(ar).sort()).toEqual(k)
    expect(Object.keys(en).sort()).toEqual(k)
  })
  it('no empty values and identical {placeholders} in every language', () => {
    for (const key of Object.keys(fr) as (keyof typeof fr)[]) {
      for (const d of [fr, ar, en]) expect(String(d[key]).trim().length, key).toBeGreaterThan(0)
      expect(ph(ar[key]), key).toBe(ph(fr[key])); expect(ph(en[key]), key).toBe(ph(fr[key]))
    }
  })
  it('Arabic values are actually Arabic; English values contain no French accents', () => {
    const tech = new Set(['app_name'])
    for (const [k, v] of Object.entries(ar)) if (!tech.has(k)) expect(/[\u0600-\u06FF]/.test(v), k).toBe(true)
    for (const [k, v] of Object.entries(en)) expect(/[éèêàçùûôîïœ]/i.test(v), k).toBe(false)
  })
  it('every dynamic key family used by the UI exists', () => {
    const types = ['accident', 'roadworks', 'closed', 'pothole', 'flood', 'traffic_light', 'stopped', 'danger', 'heavy_traffic', 'damaged_road', 'other']
    const need = [
      ...types.map(t => 'type_' + t), ...['pending', 'confirmed', 'rejected', 'expired'].map(s => 'status_' + s), ...['free', 'moderate', 'heavy', 'blocked'].map(l => 'level_' + l),
      ...['total', 'pending', 'confirmed', 'rejected', 'expired', 'today', 'week', 'users', 'unreadNotifications'].map(s => 'stat_' + s),
      ...['dashboard', 'reports', 'incidents', 'users', 'notifications', 'providers', 'audit'].map(s => 'admin_tab_' + s),
      ...['ok', 'not_configured', 'missing_key', 'unknown_provider'].map(s => 'provider_reason_' + s),
      ...['incident_approve', 'incident_reject', 'incident_expire', 'incident_delete', 'incident_status', 'user_update', 'admin_bootstrap'].map(s => 'audit_' + s),
    ]
    for (const k of need) expect(k in fr, k).toBe(true)
  })
  it('backend incident types match the frontend list', () => {
    const src = readFileSync(join(__dirname, '../../backend/src/logic.ts'), 'utf8')
    const be = [...src.match(/TYPES = \[([^\]]+)\]/)![1].matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort()
    const fe = [...readFileSync(join(__dirname, '../src/lib/constants.ts'), 'utf8').matchAll(/\['([a-z_]+)', '/g)].map(m => m[1]).sort()
    expect(fe).toEqual(be)
  })
})

describe('API error codes are all translated (no raw/hardcoded server text reaches the UI)', () => {
  const be = walk(join(__dirname, '../../backend/src')).filter(f => f.endsWith('.ts')).map(f => readFileSync(f, 'utf8')).join('\n')
  const codes = new Set<string>([
    ...[...be.matchAll(/(?:badRequest|unauthorized|forbidden|notFound|conflict)\('([a-z_]+)'\)/g)].map(m => m[1]),
    ...[...be.matchAll(/new AppError\(\s*[\d\w.? :'=<>]*?,\s*'([a-z_]+)'/g)].map(m => m[1]),
    ...[...be.matchAll(/error: '([a-z_]+)'/g)].map(m => m[1]),
    ...[...be.matchAll(/code: '(file_empty|file_too_large|unsupported_type|type_mismatch)'/g)].map(m => m[1]),
    'unauthorized', 'forbidden', 'not_found', 'bad_request', 'conflict', 'network_error', 'unknown_error',
  ])
  it('collected a sensible set of codes', () => { expect(codes.size).toBeGreaterThan(25) })
  for (const c of [...codes].filter(c => !['ok'].includes(c))) {
    it('err_' + c, () => { expect('err_' + c in fr, 'missing err_' + c).toBe(true) })
  }
  it('unknown codes fall back to the translated generic error in each language', () => {
    expect(translateError('ar', 'totally_new_code')).toBe(ar.err_unknown_error)
    expect(translateError('en', undefined)).toBe(en.err_unknown_error)
    expect(translateError('fr', 'outside_morocco')).toBe(fr.err_outside_morocco)
    expect(translateError('ar', 'outside_morocco')).toBe(ar.err_outside_morocco)
  })
})

describe('no hardcoded user-facing French in the app source', () => {
  // language names are shown in their own language (endonyms) in the switcher: the only allowed literal
  const strip = (s: string) => s.replace(/label: 'Français'/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const files = walk(join(__dirname, '../src')).filter(f => /\.(tsx?|css)$/.test(f) && !f.endsWith('i18n/fr.ts'))
  for (const f of files) it(f.split('/src/')[1], () => { expect(/[éèêàçùûôîï]|\b(Chargement|Signaler|Hors connexion|Erreur)\b/.test(strip(readFileSync(f, 'utf8')))).toBe(false) })
})

describe('translate / format', () => {
  it('interpolates and falls back', () => {
    expect(format('{n} x {n}', { n: 3 })).toBe('3 x 3')
    expect(translate('en', 'queued_banner', { n: 2 })).toBe('2 report(s) waiting to be sent.')
    expect(translate('ar', 'nope_key')).toBe('nope_key')
  })
})
