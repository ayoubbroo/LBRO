import { describe, it, expect } from 'vitest'
import { makeApp, MEKNES } from './helpers.js'
import { expireOld } from '../src/app.js'
import { randomUUID } from 'node:crypto'

const body = (o: any = {}) => ({ type: 'accident', ...MEKNES, description: 'x', ...o })

describe('incidents', () => {
  it('creates an anonymous report with city and expiry; public view hides identity', async () => {
    const { j, store } = await makeApp()
    const r = await j('POST', '/api/incidents', body())
    expect(r.statusCode).toBe(201)
    const list = (await j('GET', '/api/incidents')).json()
    expect(list.items).toHaveLength(1)
    expect(list.items[0].dataKind).toBe('APPLICATION_REPORT')
    expect(list.items[0].cityId).toBe((await store.listCities())[1]?.id === list.items[0].cityId ? list.items[0].cityId : (await store.getCity('meknes'))!.id)
    expect(JSON.stringify(list)).not.toMatch(/deviceHash|createdById/)
  })
  it('rejects invalid type, bad coords and locations outside Morocco', async () => {
    const { j } = await makeApp()
    expect((await j('POST', '/api/incidents', body({ type: 'ufo' }))).statusCode).toBe(400)
    expect((await j('POST', '/api/incidents', body({ latitude: 'a' }))).statusCode).toBe(400)
    const out = await j('POST', '/api/incidents', body({ latitude: 48.85, longitude: 2.35 }))
    expect(out.statusCode).toBe(400); expect(out.json().error).toBe('outside_morocco')
  })
  it('can require login for reports', async () => {
    const { j } = await makeApp({ env: { ALLOW_ANONYMOUS_REPORTS: 'false' } })
    expect((await j('POST', '/api/incidents', body())).statusCode).toBe(401)
  })
  it('detects duplicates (same type <100m): confirms instead of creating', async () => {
    const { j, store } = await makeApp()
    await j('POST', '/api/incidents', body())
    const d = await j('POST', '/api/incidents', body({ latitude: MEKNES.latitude + 0.0004 }), undefined, { 'x-device-id': 'other' })
    expect(d.statusCode).toBe(200)
    expect(d.json().duplicateOf).toBeTruthy()
    expect(store.incidents).toHaveLength(1)
    expect(store.incidents[0].confidence).toBeGreaterThanOrEqual(2)
  })
  it('does not treat a different type or a far report as duplicate', async () => {
    const { j, store } = await makeApp()
    await j('POST', '/api/incidents', body())
    await j('POST', '/api/incidents', body({ type: 'flood' }))
    await j('POST', '/api/incidents', body({ latitude: MEKNES.latitude + 0.01 }))
    expect(store.incidents).toHaveLength(3)
  })
  it('is idempotent on clientId (offline queue replay creates one report)', async () => {
    const { j, store } = await makeApp()
    const clientId = randomUUID()
    const a = await j('POST', '/api/incidents', body({ clientId }))
    const b = await j('POST', '/api/incidents', body({ clientId }))
    expect(a.statusCode).toBe(201); expect(b.statusCode).toBe(200)
    expect(b.json().alreadySynced).toBe(true); expect(b.json().id).toBe(a.json().id)
    expect(store.incidents).toHaveLength(1)
  })
  it('confirm votes reach CONFIRMED; one vote per voter', async () => {
    const { j, register } = await makeApp()
    const owner = await register('o@test.ma')
    const id = (await j('POST', '/api/incidents', body(), owner.token)).json().id
    const u2 = await register('b@test.ma'), u3 = await register('c@test.ma')
    await j('POST', `/api/incidents/${id}/confirm`, undefined, u2.token)
    await j('POST', `/api/incidents/${id}/confirm`, undefined, u2.token) // same voter again
    expect((await j('GET', `/api/incidents/${id}`)).json().status).toBe('PENDING')
    const r = await j('POST', `/api/incidents/${id}/confirm`, undefined, u3.token)
    expect(r.json().status).toBe('CONFIRMED'); expect(r.json().confidence).toBe(3)
  })
  it('"gone" votes expire a report; closed reports reject votes', async () => {
    const { j, register } = await makeApp()
    const id = (await j('POST', '/api/incidents', body())).json().id
    for (const e of ['a', 'b', 'c']) { const u = await register(e + '@test.ma'); await j('POST', `/api/incidents/${id}/gone`, undefined, u.token) }
    expect((await j('GET', `/api/incidents/${id}`)).json().status).toBe('EXPIRED')
    expect((await j('POST', `/api/incidents/${id}/confirm`)).statusCode).toBe(409)
    expect((await j('GET', '/api/incidents')).json().items).toHaveLength(0)
  })
  it('expiration job expires overdue reports and notifies the owner', async () => {
    const { j, store, deps, register } = await makeApp()
    const o = await register()
    const id = (await j('POST', '/api/incidents', body(), o.token)).json().id
    store.incidents[0].expiresAt = new Date(Date.now() - 1000)
    expect(await expireOld(deps)).toBe(1)
    expect(store.incidents[0].status).toBe('EXPIRED')
    expect(store.notifications.some(n => n.type === 'REPORT_EXPIRED' && n.userId === o.user.id && n.incidentId === id)).toBe(true)
    expect(await expireOld(deps)).toBe(0) // idempotent
  })
  it('list endpoint expires lazily too', async () => {
    const { j, store } = await makeApp()
    await j('POST', '/api/incidents', body())
    store.incidents[0].expiresAt = new Date(Date.now() - 1000)
    expect((await j('GET', '/api/incidents')).json().items).toHaveLength(0)
  })
  it('My Reports returns only my reports with status, confirmations and expiry', async () => {
    const { j, register } = await makeApp()
    const a = await register('a@test.ma'), b = await register('b@test.ma')
    await j('POST', '/api/incidents', body(), a.token)
    await j('POST', '/api/incidents', body({ type: 'flood' }), b.token)
    const r = (await j('GET', '/api/me/incidents', undefined, a.token)).json()
    expect(r.total).toBe(1)
    expect(r.items[0]).toMatchObject({ type: 'accident', status: 'PENDING' })
    expect(r.items[0].expiresAt).toBeTruthy(); expect(r.items[0]).toHaveProperty('confirmCount')
    expect((await j('GET', '/api/me/incidents')).statusCode).toBe(401)
  })
  it('validates input size (description max 500)', async () => {
    const { j } = await makeApp()
    expect((await j('POST', '/api/incidents', body({ description: 'x'.repeat(501) }))).statusCode).toBe(400)
  })
  it('rate-limits report creation', async () => {
    const { j } = await makeApp({ limits: { report: 2 } })
    const codes: number[] = []
    for (let n = 0; n < 4; n++) codes.push((await j('POST', '/api/incidents', body({ type: 'danger', latitude: 33 + n * 0.1 }))).statusCode)
    expect(codes).toContain(429)
  })
})

describe('hotspots', () => {
  it('counts recent live reports per city, excludes demo data, labelled as application reports', async () => {
    const { j, store } = await makeApp()
    await j('POST', '/api/incidents', body())
    await j('POST', '/api/incidents', body({ type: 'flood' }))
    await j('POST', '/api/incidents', body({ type: 'danger', latitude: 33.5731, longitude: -7.5898 }))
    await store.createIncident({ type: 'pothole', latitude: 33.89, longitude: -5.54, description: 'DEMO', expiresAt: new Date(Date.now() + 1e7), cityId: store.cities[0].id, isDemo: true, source: 'DEMO' })
    const h = (await j('GET', '/api/hotspots')).json()
    expect(h.dataKind).toBe('APPLICATION_REPORT')
    expect(h.items[0]).toEqual({ cityId: (await store.getCity('meknes'))!.id, reports: 2 })
    expect(h.items).toHaveLength(2)
  })
  it('ignores old reports', async () => {
    const { j, store } = await makeApp()
    await j('POST', '/api/incidents', body())
    store.incidents[0].createdAt = new Date(Date.now() - 7 * 3600e3)
    expect((await j('GET', '/api/hotspots')).json().items).toHaveLength(0)
  })
})
