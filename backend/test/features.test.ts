import { describe, it, expect } from 'vitest'
import { makeApp, MEKNES } from './helpers.js'
import { createTrafficProvider, fetchTraffic, TomTomProvider, NoTrafficProvider, levelFromRatio, type TrafficProvider } from '../src/providers/traffic.js'
import { createAiProvider, AnthropicProvider, type AiProvider } from '../src/providers/ai.js'
import { route } from '../src/providers/geo.js'

const fav = (o: any = {}) => ({ label: 'Maison', kind: 'HOME', lat: MEKNES.latitude, lng: MEKNES.longitude, ...o })

describe('favorites', () => {
  it('requires auth; creates, lists, updates and deletes', async () => {
    const { j, register } = await makeApp()
    expect((await j('GET', '/api/favorites')).statusCode).toBe(401)
    const { token } = await register()
    const c = await j('POST', '/api/favorites', fav(), token)
    expect(c.statusCode).toBe(201)
    const id = c.json().id
    expect((await j('GET', '/api/favorites', undefined, token)).json()).toHaveLength(1)
    const u = await j('PATCH', `/api/favorites/${id}`, { label: 'Home 2', radiusM: 500 }, token)
    expect(u.json()).toMatchObject({ label: 'Home 2', radiusM: 500 })
    expect((await j('DELETE', `/api/favorites/${id}`, undefined, token)).statusCode).toBe(200)
    expect((await j('GET', '/api/favorites', undefined, token)).json()).toHaveLength(0)
  })
  it('one HOME and one WORK per user; unlimited CUSTOM up to 20', async () => {
    const { j, register } = await makeApp()
    const { token } = await register()
    await j('POST', '/api/favorites', fav(), token)
    expect((await j('POST', '/api/favorites', fav(), token)).statusCode).toBe(409)
    expect((await j('POST', '/api/favorites', fav({ kind: 'WORK', label: 'Bureau' }), token)).statusCode).toBe(201)
    for (let n = 0; n < 18; n++) expect((await j('POST', '/api/favorites', fav({ kind: 'CUSTOM', label: 'c' + n }), token)).statusCode).toBe(201)
    expect((await j('POST', '/api/favorites', fav({ kind: 'CUSTOM' }), token)).statusCode).toBe(400)
  })
  it('users cannot read, edit or delete other users’ favorites', async () => {
    const { j, register } = await makeApp()
    const a = await register('a@test.ma'), b = await register('b@test.ma')
    const id = (await j('POST', '/api/favorites', fav(), a.token)).json().id
    expect((await j('GET', '/api/favorites', undefined, b.token)).json()).toHaveLength(0)
    expect((await j('PATCH', `/api/favorites/${id}`, { label: 'x' }, b.token)).statusCode).toBe(403)
    expect((await j('DELETE', `/api/favorites/${id}`, undefined, b.token)).statusCode).toBe(403)
  })
  it('validates coordinates and Morocco bounds', async () => {
    const { j, register } = await makeApp()
    const { token } = await register()
    expect((await j('POST', '/api/favorites', fav({ lat: 200 }), token)).statusCode).toBe(400)
    expect((await j('POST', '/api/favorites', fav({ lat: 48.8, lng: 2.3 }), token)).statusCode).toBe(400)
  })
})

describe('notifications', () => {
  it('notifies a user when an incident is reported near their favorite, not when far, not the reporter', async () => {
    const { j, register, store } = await makeApp()
    const fan = await register('fan@test.ma'), far = await register('far@test.ma'), rep = await register('rep@test.ma')
    await j('POST', '/api/favorites', fav(), fan.token)
    await j('POST', '/api/favorites', fav({ lat: 33.5731, lng: -7.5898 }), far.token)
    await j('POST', '/api/favorites', fav(), rep.token)
    await j('POST', '/api/incidents', { type: 'accident', latitude: MEKNES.latitude + 0.002, longitude: MEKNES.longitude }, rep.token)
    const n = (await j('GET', '/api/notifications', undefined, fan.token)).json()
    expect(n.total).toBe(1); expect(n.unread).toBe(1)
    expect(n.items[0]).toMatchObject({ type: 'INCIDENT_NEAR_FAVORITE', data: { incidentType: 'accident', favoriteLabel: 'Maison' } })
    expect((await j('GET', '/api/notifications', undefined, far.token)).json().total).toBe(0)
    expect(store.notifications.some(x => x.userId === rep.user.id)).toBe(false)
  })
  it('respects the per-favorite notify flag and radius', async () => {
    const { j, register } = await makeApp()
    const a = await register('a@test.ma'), b = await register('b@test.ma')
    await j('POST', '/api/favorites', fav({ notify: false }), a.token)
    await j('POST', '/api/favorites', fav({ radiusM: 100 }), b.token)
    await j('POST', '/api/incidents', { type: 'flood', latitude: MEKNES.latitude + 0.01, longitude: MEKNES.longitude })
    expect((await j('GET', '/api/notifications', undefined, a.token)).json().total).toBe(0)
    expect((await j('GET', '/api/notifications', undefined, b.token)).json().total).toBe(0)
  })
  it('notifies the report owner on confirmed / rejected (admin) outcomes', async () => {
    const { j, register, admin } = await makeApp()
    const o = await register('o@test.ma'), ad = await admin()
    const id = (await j('POST', '/api/incidents', { type: 'accident', ...MEKNES }, o.token)).json().id
    await j('POST', `/api/admin/incidents/${id}/approve`, undefined, ad.token)
    await j('POST', `/api/admin/incidents/${id}/reject`, { reason: 'duplicate' }, ad.token)
    const types = (await j('GET', '/api/notifications', undefined, o.token)).json().items.map((x: any) => x.type).sort()
    expect(types).toEqual(['REPORT_CONFIRMED', 'REPORT_REJECTED'])
  })
  it('mark one read, mark all read, unread counter; users cannot touch others’ notifications', async () => {
    const { j, register, store } = await makeApp()
    const a = await register('a@test.ma'), b = await register('b@test.ma')
    for (let n = 0; n < 3; n++) await store.createNotification({ userId: a.user.id, type: 'SYSTEM', title: 't', body: 'b' })
    const items = (await j('GET', '/api/notifications', undefined, a.token)).json().items
    expect((await j('POST', `/api/notifications/${items[0].id}/read`, undefined, b.token)).statusCode).toBe(404)
    expect((await j('POST', `/api/notifications/${items[0].id}/read`, undefined, a.token)).statusCode).toBe(200)
    expect((await j('GET', '/api/notifications/unread-count', undefined, a.token)).json().unread).toBe(2)
    expect((await j('POST', '/api/notifications/read-all', undefined, a.token)).json().updated).toBe(2)
    expect((await j('GET', '/api/notifications/unread-count', undefined, a.token)).json().unread).toBe(0)
    expect((await j('GET', '/api/notifications')).statusCode).toBe(401)
  })
})

describe('admin authorization & audit', () => {
  it('every admin route rejects anonymous (401) and regular users (403)', async () => {
    const { j, register } = await makeApp()
    const u = await register()
    const routes: [string, string][] = [['GET', '/api/admin/stats'], ['GET', '/api/admin/incidents'], ['PATCH', '/api/admin/incidents/x'], ['POST', '/api/admin/incidents/x/approve'], ['DELETE', '/api/admin/incidents/x'], ['GET', '/api/admin/users'], ['PATCH', '/api/admin/users/x'], ['GET', '/api/admin/notifications'], ['GET', '/api/admin/providers'], ['GET', '/api/admin/audit'], ['POST', '/api/incidents/x/expire']]
    for (const [m, url] of routes) {
      expect((await j(m, url, {})).statusCode, m + url).toBe(401)
      const r = await j(m, url, {}, u.token)
      expect(r.statusCode, m + url).toBe(403); expect(r.json().error).toBe('admin_only')
    }
  })
  it('the old x-admin-token header grants nothing', async () => {
    const { j } = await makeApp({ env: { ADMIN_TOKEN: 'secret' } })
    expect((await j('GET', '/api/admin/stats', undefined, undefined, { 'x-admin-token': 'secret' })).statusCode).toBe(401)
  })
  it('admin approves / rejects / expires / deletes and each action is audited', async () => {
    const { j, admin, store } = await makeApp()
    const ad = await admin()
    const mk = async (type: string) => (await j('POST', '/api/incidents', { type, ...MEKNES, latitude: MEKNES.latitude + Math.random() * 0.2 })).json().id
    const [a, b, c, d] = [await mk('accident'), await mk('flood'), await mk('danger'), await mk('closed')]
    expect((await j('POST', `/api/admin/incidents/${a}/approve`, undefined, ad.token)).json().status).toBe('CONFIRMED')
    expect((await j('POST', `/api/admin/incidents/${b}/reject`, { reason: 'spam' }, ad.token)).json().status).toBe('REJECTED')
    expect((await j('POST', `/api/admin/incidents/${c}/expire`, undefined, ad.token)).json().status).toBe('EXPIRED')
    expect((await j('DELETE', `/api/admin/incidents/${d}`, undefined, ad.token)).statusCode).toBe(200)
    expect(store.audit.map(x => x.action).sort()).toEqual(['incident.approve', 'incident.delete', 'incident.expire', 'incident.reject'])
    expect(store.audit.every(x => x.actorId === ad.user.id)).toBe(true)
    const log = (await j('GET', '/api/admin/audit', undefined, ad.token)).json()
    expect(log.total).toBe(4)
    expect((await j('GET', '/api/admin/stats', undefined, ad.token)).json()).toMatchObject({ rejected: 1, confirmed: 1, expired: 1 })
  })
  it('admin user management: role/disable are audited, tokens revoked, cannot demote self', async () => {
    const { j, admin, register, store } = await makeApp()
    const ad = await admin(), u = await register('u@test.ma')
    expect((await j('PATCH', `/api/admin/users/${ad.user.id}`, { role: 'USER' }, ad.token)).statusCode).toBe(400)
    expect((await j('PATCH', `/api/admin/users/${u.user.id}`, { isActive: false }, ad.token)).json().isActive).toBe(false)
    expect((await j('GET', '/api/auth/me', undefined, u.token)).statusCode).toBe(401)
    expect(store.audit.some(a => a.action === 'user.update')).toBe(true)
    const list = (await j('GET', '/api/admin/users', undefined, ad.token)).json()
    expect(JSON.stringify(list)).not.toContain('passwordHash')
  })
  it('admin providers endpoint exposes no secrets', async () => {
    const { j, admin } = await makeApp({ env: { TRAFFIC_PROVIDER: 'tomtom', TRAFFIC_API_KEY: 'SUPER-SECRET-KEY', STORAGE_SECRET_KEY: 'S3SECRET' } })
    const ad = await admin()
    const r = (await j('GET', '/api/admin/providers', undefined, ad.token)).body
    expect(r).not.toContain('SUPER-SECRET-KEY'); expect(r).not.toContain('S3SECRET')
  })
})

describe('traffic provider fallback', () => {
  it('TRAFFIC_PROVIDER=none (and unset): no live data, honest message', async () => {
    for (const env of [{ TRAFFIC_PROVIDER: 'none' }, {}]) {
      const { j } = await makeApp({ env })
      const r = (await j('GET', '/api/traffic')).json()
      expect(r).toMatchObject({ available: false, data: [], message: 'no_provider', dataKind: 'LIVE_TRAFFIC_PROVIDER' })
    }
  })
  it('unknown provider or missing key falls back to none, never to fake data', () => {
    expect(createTrafficProvider({ trafficProvider: 'nope', trafficApiKey: 'k', trafficApiUrl: '' }).status).toMatchObject({ active: 'none', reason: 'unknown_provider' })
    expect(createTrafficProvider({ trafficProvider: 'tomtom', trafficApiKey: '', trafficApiUrl: '' }).status).toMatchObject({ active: 'none', reason: 'missing_key' })
    expect(createTrafficProvider({ trafficProvider: 'tomtom', trafficApiKey: 'k', trafficApiUrl: '' }).status).toMatchObject({ active: 'tomtom', available: true })
  })
  it('a failing provider degrades to unavailable instead of throwing', async () => {
    const bad: TrafficProvider = { name: 'x', available: true, getTraffic: async () => { throw new Error('boom') } }
    expect(await fetchTraffic(bad, { n: 1, s: 0, e: 1, w: 0 })).toMatchObject({ available: false, message: 'provider_error', data: [] })
    const { j } = await makeApp({ traffic: bad })
    expect((await j('GET', '/api/traffic')).json().available).toBe(false)
  })
  it('a working provider is surfaced as live data', async () => {
    const ok: TrafficProvider = { name: 'mock', available: true, getTraffic: async () => [{ level: 'heavy', lat: 1, lng: 2 }] }
    const { j } = await makeApp({ traffic: ok })
    expect((await j('GET', '/api/traffic')).json()).toMatchObject({ available: true, provider: 'mock', data: [{ level: 'heavy' }] })
  })
  it('TomTom adapter maps speed ratio to levels and skips malformed segments (mocked HTTP)', async () => {
    let n = 0
    const f = async () => ({ ok: true, json: async () => ({ flowSegmentData: n++ === 0 ? { currentSpeed: 10, freeFlowSpeed: 50 } : { currentSpeed: 'x' } }) })
    const r = await new TomTomProvider('k', 'https://example.test', f as any).getTraffic({ n: 34, s: 33, e: -5, w: -6 })
    expect(r).toHaveLength(1); expect(r[0].level).toBe('heavy')
    expect([levelFromRatio(0.9), levelFromRatio(0.6), levelFromRatio(0.3), levelFromRatio(0.05)]).toEqual(['free', 'moderate', 'heavy', 'blocked'])
    expect(new NoTrafficProvider().available).toBe(false)
  })
})

describe('routing & geocoding (mocked HTTP)', () => {
  const osrm = async () => ({ ok: true, json: async () => ({ routes: [{ distance: 12000, duration: 900, geometry: { type: 'LineString', coordinates: [[-5.5, 33.9], [-5.6, 33.8]] } }] }) }) as any
  it('flags traffic-aware ETA as unavailable without a provider', async () => {
    const r = await route({ routingUrl: 'http://x' }, [33.9, -5.5], [33.8, -5.6], undefined, osrm)
    expect(r).toMatchObject({ trafficAwareEta: false, etaNote: 'unavailable_no_provider' })
    expect(r.routes[0]).toMatchObject({ distanceM: 12000, baseDurationS: 900, trafficDurationS: null })
  })
  it('only reports a traffic-aware ETA when the provider returns one', async () => {
    const p: TrafficProvider = { name: 'mock', available: true, getTraffic: async () => [], getRouteEta: async () => ({ durationS: 1500 }) }
    expect(await route({ routingUrl: 'http://x' }, [33.9, -5.5], [33.8, -5.6], p, osrm)).toMatchObject({ trafficAwareEta: true, etaNote: '', routes: [{ trafficDurationS: 1500 }] })
    const bad: TrafficProvider = { ...p, getRouteEta: async () => { throw new Error('x') } }
    expect(await route({ routingUrl: 'http://x' }, [33.9, -5.5], [33.8, -5.6], bad, osrm)).toMatchObject({ trafficAwareEta: false, etaNote: 'unavailable_provider_error' })
  })
  it('API validates route params and Morocco bounds; upstream failure => 502 code', async () => {
    const { j } = await makeApp({ env: { ROUTING_API_URL: 'http://127.0.0.1:1', GEOCODING_API_URL: 'http://127.0.0.1:1' } })
    expect((await j('GET', '/api/routes?from=abc&to=1,2')).statusCode).toBe(400)
    expect((await j('GET', '/api/routes?from=48.8,2.3&to=33.9,-5.5')).json().error).toBe('outside_morocco')
    const r = await j('GET', '/api/routes?from=33.9,-5.5&to=33.8,-5.6')
    expect(r.statusCode).toBe(502); expect(r.json().error).toBe('routing_unavailable')
    expect((await j('GET', '/api/search?q=meknes')).json().error).toBe('geocoding_unavailable')
  })
})

describe('city dashboard keeps application reports and live traffic separate', () => {
  it('provider none: reports shown, liveTraffic explicitly unavailable', async () => {
    const { j, store } = await makeApp()
    await j('POST', '/api/incidents', { type: 'accident', ...MEKNES })
    const id = (await store.getCity('meknes'))!.id
    const d = (await j('GET', `/api/cities/${id}/dashboard`)).json()
    expect(d.applicationReports).toMatchObject({ dataKind: 'APPLICATION_REPORT', active: 1, pending: 1 })
    expect(d.liveTraffic).toMatchObject({ dataKind: 'LIVE_TRAFFIC_PROVIDER', available: false, data: [], message: 'no_provider' })
    expect((await j('GET', '/api/cities/nope/dashboard')).statusCode).toBe(404)
  })
  it('works by slug and lists all cities', async () => {
    const { j } = await makeApp()
    expect((await j('GET', '/api/cities/meknes/dashboard')).statusCode).toBe(200)
    expect((await j('GET', '/api/cities')).json()).toHaveLength(2)
  })
})

describe('traffic AI', () => {
  it('AI_PROVIDER=none: app works and AI endpoint reports disabled', async () => {
    const { j } = await makeApp()
    expect((await j('GET', '/api/ai/status')).json()).toEqual({ available: false, provider: 'none' })
    const r = (await j('POST', '/api/ai/summary', { cityId: 'meknes' })).json()
    expect(r).toMatchObject({ available: false, summary: null, reason: 'ai_disabled' })
    expect((await j('GET', '/api/incidents')).statusCode).toBe(200)
  })
  it('createAiProvider only enables with provider + key + model', () => {
    expect(createAiProvider({ aiProvider: 'anthropic', aiApiKey: '', aiModel: 'm' }).available).toBe(false)
    expect(createAiProvider({ aiProvider: 'anthropic', aiApiKey: 'k', aiModel: '' }).available).toBe(false)
    expect(createAiProvider({ aiProvider: 'x', aiApiKey: 'k', aiModel: 'm' }).available).toBe(false)
    expect(createAiProvider({ aiProvider: 'anthropic', aiApiKey: 'k', aiModel: 'm' }).available).toBe(true)
  })
  it('without reliable data the model is NOT called and the answer says so', async () => {
    let called = 0
    const ai: AiProvider = { name: 'mock', available: true, complete: async () => { called++; return 'invented jam' } }
    const { j } = await makeApp({ ai })
    const r = (await j('POST', '/api/ai/summary', { cityId: 'meknes' })).json()
    expect(r).toMatchObject({ available: true, summary: null, reason: 'no_reliable_data' }); expect(called).toBe(0)
  })
  it('with reports it sends only application facts, labelled, and a strict system prompt', async () => {
    let sys = '', usr = ''
    const ai: AiProvider = { name: 'mock', available: true, complete: async (s, u) => { sys = s; usr = u; return 'ok' } }
    const { j } = await makeApp({ ai })
    await j('POST', '/api/incidents', { type: 'accident', ...MEKNES })
    const r = (await j('POST', '/api/ai/summary', { cityId: 'meknes', lang: 'en' })).json()
    expect(r.summary).toBe('ok')
    expect(sys).toMatch(/Never add, estimate or guess/)
    const facts = JSON.parse(usr.split('Facts:\n')[1])
    expect(facts.application_reports.active).toBe(1)
    expect(facts.live_traffic_provider).toEqual({ available: false })
    expect(usr).not.toMatch(/deviceHash|email/)
  })
  it('AI failure is reported, not hidden or faked', async () => {
    const ai: AiProvider = { name: 'mock', available: true, complete: async () => { throw new Error('down') } }
    const { j } = await makeApp({ ai })
    await j('POST', '/api/incidents', { type: 'accident', ...MEKNES })
    expect((await j('POST', '/api/ai/summary', { cityId: 'meknes' })).json()).toMatchObject({ summary: null, reason: 'ai_error' })
  })
  it('Anthropic adapter builds a correct request (mocked HTTP)', async () => {
    let seen: any
    const f = (async (_u: string, init: any) => { seen = init; return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'hello' }] }) } }) as any
    expect(await new AnthropicProvider('KEY', 'some-model', f).complete('sys', 'usr')).toBe('hello')
    expect(seen.headers['x-api-key']).toBe('KEY'); expect(JSON.parse(seen.body).model).toBe('some-model')
  })
})

describe('security headers & errors', () => {
  it('sends secure headers and hides internals', async () => {
    const { j } = await makeApp()
    const r = await j('GET', '/api/health')
    expect(r.headers['x-content-type-options']).toBe('nosniff')
    expect(r.headers['x-powered-by']).toBeUndefined()
    const nf = await j('GET', '/api/nope')
    expect(nf.statusCode).toBe(404); expect(nf.json()).toEqual({ error: 'not_found' })
  })
  it('CORS only allows configured origins', async () => {
    const { app } = await makeApp({ env: { CORS_ORIGINS: 'https://app.example' } })
    const ok = await app.inject({ method: 'GET', url: '/api/health', headers: { origin: 'https://app.example' } })
    const no = await app.inject({ method: 'GET', url: '/api/health', headers: { origin: 'https://evil.example' } })
    expect(ok.headers['access-control-allow-origin']).toBe('https://app.example')
    expect(no.headers['access-control-allow-origin']).toBeUndefined()
  })
  it('rejects oversized JSON bodies', async () => {
    const { j } = await makeApp()
    const r = await j('POST', '/api/incidents', { type: 'accident', ...MEKNES, description: 'x'.repeat(300_000) })
    expect(r.statusCode).toBe(413)
  })
})
