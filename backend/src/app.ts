import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import { ZodError, z } from 'zod'
import { createHash, randomUUID } from 'node:crypto'
import { TYPES, expiresFrom, isDuplicate, inMorocco, nearestCity, voteOutcome } from './logic.js'
import { AppError, badRequest, conflict, forbidden, notFound, unauthorized } from './errors.js'
import { DUMMY_HASH, hashPassword, publicUser, registerAuth, signToken, verifyPassword } from './auth.js'
import { notifyNearFavorites, notifyOwnerStatus } from './notify.js'
import { adminIncident, adminUser, pubFavorite, pubIncident, pubNotification } from './serialize.js'
import { validateImage, stripJpegMetadata, EXT } from './upload.js'
import { fetchTraffic } from './providers/traffic.js'
import { geocode, reverseGeocode, route } from './providers/geo.js'
import { AI_SYSTEM_PROMPT } from './providers/ai.js'
import { defaultLimits, type Deps } from './deps.js'
import type { Status } from './store/types.js'

const LIVE: Status[] = ['PENDING', 'CONFIRMED']
const deviceHash = (req: FastifyRequest) =>
  createHash('sha256').update((req.ip || '') + (req.headers['user-agent'] || '') + (req.headers['x-device-id'] || '')).digest('hex').slice(0, 32)
const voterKey = (req: FastifyRequest) => (req.auth ? 'u:' + req.auth.id : deviceHash(req))
const page = z.object({ skip: z.coerce.number().int().min(0).default(0), take: z.coerce.number().int().min(1).max(200).default(50) })
const num = z.number().finite()
const lat = num.min(-90).max(90), lng = num.min(-180).max(180)

export async function expireOld(deps: Deps) {
  const due = await deps.store.expireDue(new Date())
  for (const i of due) await notifyOwnerStatus(deps.store, i, 'EXPIRED')
  return due.length
}

export async function build(deps: Deps): Promise<FastifyInstance> {
  const { store, cfg } = deps
  const L = { ...defaultLimits, ...deps.limits }
  const app = Fastify({ logger: cfg.nodeEnv === 'test' ? false : true, bodyLimit: 256 * 1024, trustProxy: cfg.nodeEnv === 'production' })

  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }) // CSP is set by the static host/CDN serving the SPA
  await app.register(cors, { origin: cfg.corsOrigins.length ? cfg.corsOrigins : false, credentials: false, allowedHeaders: ['content-type', 'authorization', 'x-device-id'] })
  await app.register(rateLimit, { max: L.global, timeWindow: '1 minute' })
  await app.register(multipart, { limits: { fileSize: cfg.maxUploadBytes, files: 1, fields: 5, parts: 6 } })
  await registerAuth(app, deps)

  app.setErrorHandler((err: any, _req, rep) => {
    if (err instanceof AppError) return rep.code(err.status).send({ error: err.code })
    if (err instanceof ZodError) return rep.code(400).send({ error: 'validation_error', details: err.issues.map(i => ({ path: i.path.join('.'), code: i.code })) })
    if (err.statusCode === 429) return rep.code(429).send({ error: 'rate_limited' })
    if (err.code === 'FST_REQ_FILE_TOO_LARGE') return rep.code(413).send({ error: 'file_too_large' })
    if (err.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return rep.code(413).send({ error: 'payload_too_large' })
    if (err.statusCode && err.statusCode < 500) return rep.code(err.statusCode).send({ error: 'bad_request' })
    app.log.error(err)
    return rep.code(500).send({ error: 'internal_error' })
  })
  app.setNotFoundHandler((_q, rep) => rep.code(404).send({ error: 'not_found' }))

  const audit = (req: FastifyRequest, action: string, entity?: string, entityId?: string, meta?: Record<string, unknown>) =>
    store.addAudit({ action, actorId: req.auth?.id ?? null, entity, entityId, meta })
  const rl = (max: number, timeWindow = '1 minute') => ({ config: { rateLimit: { max, timeWindow } } })

  app.get('/api/health', async () => ({ ok: true }))

  // ───────────── auth ─────────────
  const creds = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(8).max(128) })
  app.post('/api/auth/register', rl(L.auth, '10 minutes'), async (req, rep) => {
    const b = creds.extend({ name: z.string().trim().min(1).max(80).optional(), locale: z.enum(['ar', 'fr', 'en']).default('fr') }).parse(req.body)
    if (await store.getUserByEmail(b.email)) throw conflict('email_taken')
    let u
    try { u = await store.createUser({ email: b.email, passwordHash: await hashPassword(b.password, deps.bcryptRounds), name: b.name, locale: b.locale }) } // role is never client-controlled
    catch (e: any) { if (e?.code === 'P2002') throw conflict('email_taken'); throw e }
    return rep.code(201).send({ token: signToken(app, u), user: publicUser(u) })
  })
  app.post('/api/auth/login', rl(L.auth, '10 minutes'), async (req) => {
    const b = creds.pick({ email: true }).extend({ password: z.string().min(1).max(128) }).parse(req.body)
    const u = await store.getUserByEmail(b.email)
    const ok = await verifyPassword(b.password, u?.passwordHash ?? DUMMY_HASH)
    if (!u || !ok) throw unauthorized('invalid_credentials')
    if (!u.isActive) throw forbidden('account_disabled')
    const nu = await store.updateUser(u.id, { lastLoginAt: new Date() })
    return { token: signToken(app, nu), user: publicUser(nu) }
  })
  app.post('/api/auth/logout', { preHandler: app.authenticate }, async (req) => {
    await store.updateUser(req.auth!.id, { tokenVersion: req.auth!.tokenVersion + 1 }) // revokes every token issued so far
    return { ok: true }
  })
  app.get('/api/auth/me', { preHandler: app.authenticate }, async (req) => ({ user: publicUser(req.auth!) }))
  app.patch('/api/auth/me', { preHandler: app.authenticate }, async (req) => {
    const b = z.object({ name: z.string().trim().min(1).max(80).optional(), locale: z.enum(['ar', 'fr', 'en']).optional(), currentPassword: z.string().max(128).optional(), newPassword: z.string().min(8).max(128).optional() }).parse(req.body)
    const patch: any = {}
    if (b.name !== undefined) patch.name = b.name
    if (b.locale) patch.locale = b.locale
    let token: string | undefined
    if (b.newPassword) {
      if (!b.currentPassword || !(await verifyPassword(b.currentPassword, req.auth!.passwordHash))) throw unauthorized('invalid_credentials')
      patch.passwordHash = await hashPassword(b.newPassword, deps.bcryptRounds)
      patch.tokenVersion = req.auth!.tokenVersion + 1
    }
    const u = await store.updateUser(req.auth!.id, patch)
    if (patch.tokenVersion !== undefined) token = signToken(app, u)
    return { user: publicUser(u), ...(token ? { token } : {}) }
  })

  // ───────────── cities / traffic ─────────────
  app.get('/api/cities', async () => store.listCities())
  app.get('/api/traffic', async () => {
    const r = await fetchTraffic(deps.traffic, { n: 36, s: 20, e: -1, w: -17 })
    return { ...r, dataKind: 'LIVE_TRAFFIC_PROVIDER' as const, status: deps.trafficStatus }
  })

  // ───────────── incidents ─────────────
  const listQuery = page.extend({
    cityId: z.string().optional(), type: z.enum(TYPES).optional(), includeDemo: z.enum(['true', 'false']).default('true'),
    n: z.coerce.number().optional(), s: z.coerce.number().optional(), e: z.coerce.number().optional(), w: z.coerce.number().optional(),
  })
  app.get('/api/incidents', async (req) => {
    await expireOld(deps)
    const q = listQuery.parse(req.query)
    const bbox = q.n !== undefined && q.s !== undefined && q.e !== undefined && q.w !== undefined ? { n: q.n, s: q.s, e: q.e, w: q.w } : undefined
    const r = await store.listIncidents({ statuses: LIVE, cityId: q.cityId, type: q.type, includeDemo: q.includeDemo === 'true', bbox, skip: q.skip, take: q.take })
    return { items: r.items.map(i => pubIncident(i)), total: r.total }
  })
  app.get('/api/incidents/:id', async (req: any) => {
    const i = await store.getIncident(req.params.id)
    if (!i || !['PENDING', 'CONFIRMED', 'EXPIRED'].includes(i.status)) throw notFound()
    return pubIncident(i)
  })

  app.post('/api/incidents', { ...rl(L.report, '10 minutes'), preHandler: app.optionalAuth }, async (req, rep) => {
    if (!req.auth && !cfg.allowAnonymousReports) throw unauthorized('login_required')
    const b = z.object({ type: z.enum(TYPES), latitude: lat, longitude: lng, description: z.string().trim().max(500).default(''), clientId: z.string().uuid().optional() }).parse(req.body)
    if (!inMorocco(b.latitude, b.longitude)) throw badRequest('outside_morocco')
    // Idempotency: the offline queue may retry the same report; never create it twice.
    if (b.clientId) {
      const ex = await store.getIncidentByClientId(b.clientId)
      if (ex) return rep.code(200).send({ id: ex.id, alreadySynced: true, status: ex.status })
    }
    const key = voterKey(req)
    const dup = (await store.findRecentSimilar(b.type, new Date(Date.now() - 3600e3))).find(r => isDuplicate(r, b))
    if (dup) {
      const v = await store.upsertVote(dup.id, key, true)
      const o = voteOutcome(v.yes, v.no)
      const upd = await store.updateIncident(dup.id, { confidence: o.confidence, status: o.status, expiresAt: expiresFrom(dup.type) })
      if (upd.status !== dup.status) await notifyOwnerStatus(store, upd, upd.status)
      return rep.code(200).send({ duplicateOf: dup.id, status: upd.status })
    }
    const city = nearestCity(b.latitude, b.longitude, await store.listCities())
    const i = await store.createIncident({ ...b, clientId: b.clientId ?? null, deviceHash: deviceHash(req), createdById: req.auth?.id ?? null, cityId: city?.id ?? null, expiresAt: expiresFrom(b.type) })
    await notifyNearFavorites(store, i).catch(err => app.log.error(err))
    return rep.code(201).send({ id: i.id, status: i.status })
  })

  const vote = (stillThere: boolean) => async (req: any) => {
    const i = await store.getIncident(req.params.id)
    if (!i) throw notFound()
    if (!LIVE.includes(i.status)) throw conflict('incident_closed')
    const v = await store.upsertVote(i.id, voterKey(req), stillThere)
    const o = voteOutcome(v.yes, v.no)
    const upd = await store.updateIncident(i.id, { confidence: o.confidence, status: o.status, ...(stillThere ? { expiresAt: expiresFrom(i.type) } : {}) })
    if (upd.status !== i.status) await notifyOwnerStatus(store, upd, upd.status)
    return { id: i.id, confidence: upd.confidence, status: upd.status }
  }
  const votePre = { ...rl(30), preHandler: app.optionalAuth }
  app.post('/api/incidents/:id/confirm', votePre, vote(true))
  app.post('/api/incidents/:id/gone', votePre, vote(false))

  // ───────────── photos ─────────────
  app.post('/api/incidents/:id/photos', { ...rl(L.upload), preHandler: app.authenticate }, async (req: any, rep) => {
    const i = await store.getIncident(req.params.id)
    if (!i) throw notFound()
    if (i.createdById !== req.auth!.id && req.auth!.role !== 'ADMIN') throw forbidden('not_owner')
    if ((await store.countPhotos(i.id)) >= cfg.maxPhotosPerIncident) throw badRequest('too_many_photos')
    const file = await req.file()
    if (!file) throw badRequest('file_required')
    let buf: Buffer
    try { buf = await file.toBuffer() } catch (e: any) { if (e?.code === 'FST_REQ_FILE_TOO_LARGE') throw new AppError(413, 'file_too_large'); throw e }
    if (file.file.truncated) throw new AppError(413, 'file_too_large')
    const chk = validateImage(buf, file.mimetype, cfg.maxUploadBytes)
    if (!chk.ok) throw new AppError(chk.code === 'file_too_large' ? 413 : 400, chk.code)
    const data = stripJpegMetadata(buf) // drop EXIF/GPS from JPEGs
    const key = `incidents/${i.id}/${randomUUID()}.${EXT[chk.mime]}` // server-generated name: client filename is never used
    await deps.storage.put(key, data, chk.mime)
    const p = await store.addPhoto({ incidentId: i.id, storageKey: key, mimeType: chk.mime, sizeBytes: data.length, uploadedById: req.auth!.id })
    return rep.code(201).send({ id: p.id, url: `/api/photos/${p.id}` })
  })
  app.get('/api/photos/:id', async (req: any, rep) => {
    const p = await store.getPhoto(req.params.id)
    if (!p) throw notFound()
    const f = await deps.storage.get(p.storageKey)
    if (!f) throw notFound()
    return rep.header('content-type', p.mimeType).header('cache-control', 'public, max-age=86400').header('x-content-type-options', 'nosniff').send(f.data)
  })

  // ───────────── my reports ─────────────
  app.get('/api/me/incidents', { preHandler: app.authenticate }, async (req) => {
    const q = page.extend({ status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED']).optional() }).parse(req.query)
    const r = await store.listIncidents({ ownerId: req.auth!.id, statuses: q.status ? [q.status] : undefined, skip: q.skip, take: q.take })
    return { items: r.items.map(i => pubIncident(i, { mine: true })), total: r.total }
  })

  // ───────────── favorites ─────────────
  const favBody = z.object({ label: z.string().trim().min(1).max(60), kind: z.enum(['HOME', 'WORK', 'CUSTOM']).default('CUSTOM'), lat, lng, radiusM: z.number().int().min(100).max(5000).default(1000), notify: z.boolean().default(true) })
  const ownFav = async (req: any) => {
    const f = await store.getFavorite(req.params.id)
    if (!f) throw notFound()
    if (f.userId !== req.auth.id) throw forbidden('not_owner')
    return f
  }
  app.get('/api/favorites', { preHandler: app.authenticate }, async (req) => (await store.listFavorites(req.auth!.id)).map(pubFavorite))
  app.post('/api/favorites', { preHandler: app.authenticate }, async (req, rep) => {
    const b = favBody.parse(req.body)
    if (!inMorocco(b.lat, b.lng)) throw badRequest('outside_morocco')
    const all = await store.listFavorites(req.auth!.id)
    if (all.length >= 20) throw badRequest('too_many_favorites')
    if (b.kind !== 'CUSTOM' && all.some(f => f.kind === b.kind)) throw conflict('favorite_kind_exists') // one HOME and one WORK per user
    return rep.code(201).send(pubFavorite(await store.createFavorite({ userId: req.auth!.id, ...b })))
  })
  app.patch('/api/favorites/:id', { preHandler: app.authenticate }, async (req: any) => {
    const f = await ownFav(req)
    const b = favBody.partial().parse(req.body)
    if ((b.lat !== undefined || b.lng !== undefined) && !inMorocco(b.lat ?? f.lat, b.lng ?? f.lng)) throw badRequest('outside_morocco')
    if (b.kind && b.kind !== 'CUSTOM' && b.kind !== f.kind && (await store.listFavorites(req.auth.id)).some(x => x.kind === b.kind)) throw conflict('favorite_kind_exists')
    return pubFavorite(await store.updateFavorite(f.id, b))
  })
  app.delete('/api/favorites/:id', { preHandler: app.authenticate }, async (req: any) => { const f = await ownFav(req); await store.deleteFavorite(f.id); return { ok: true } })

  // ───────────── notifications ─────────────
  app.get('/api/notifications', { preHandler: app.authenticate }, async (req) => {
    const q = page.extend({ unread: z.enum(['true', 'false']).default('false') }).parse(req.query)
    const r = await store.listNotifications({ userId: req.auth!.id, unreadOnly: q.unread === 'true', skip: q.skip, take: q.take })
    return { items: r.items.map(pubNotification), total: r.total, unread: await store.countUnread(req.auth!.id) }
  })
  app.get('/api/notifications/unread-count', { preHandler: app.authenticate }, async (req) => ({ unread: await store.countUnread(req.auth!.id) }))
  app.post('/api/notifications/read-all', { preHandler: app.authenticate }, async (req) => ({ updated: await store.markAllRead(req.auth!.id) }))
  app.post('/api/notifications/:id/read', { preHandler: app.authenticate }, async (req: any) => {
    if (!(await store.markRead(req.auth.id, req.params.id))) throw notFound() // other users' notifications look nonexistent
    return { ok: true }
  })

  // ───────────── hotspots / city dashboard ─────────────
  app.get('/api/hotspots', async () => {
    const r = await store.listIncidents({ statuses: LIVE, createdAfter: new Date(Date.now() - 6 * 3600e3), includeDemo: false, take: 1000 })
    const by = new Map<string, number>()
    for (const i of r.items) if (i.cityId) by.set(i.cityId, (by.get(i.cityId) ?? 0) + 1)
    return { dataKind: 'APPLICATION_REPORT' as const, items: [...by].map(([cityId, reports]) => ({ cityId, reports })).sort((a, b) => b.reports - a.reports).slice(0, 10) }
  })

  async function cityFacts(cityId: string) {
    const all = (await store.listIncidents({ cityId, statuses: LIVE, includeDemo: false, take: 500 })).items
    const day = Date.now() - 864e5
    const byType: Record<string, number> = {}
    for (const i of all) byType[i.type] = (byType[i.type] ?? 0) + 1
    return {
      active: all.length, confirmed: all.filter(i => i.status === 'CONFIRMED').length, pending: all.filter(i => i.status === 'PENDING').length,
      last24h: all.filter(i => i.createdAt.getTime() > day).length, byType, recent: all.slice(0, 10),
    }
  }
  app.get('/api/cities/:id/dashboard', async (req: any) => {
    const c = await store.getCity(req.params.id)
    if (!c) throw notFound()
    await expireOld(deps)
    const f = await cityFacts(c.id)
    const d = 0.12
    const live = await fetchTraffic(deps.traffic, { n: c.lat + d, s: c.lat - d, e: c.lng + d, w: c.lng - d })
    return {
      city: c,
      // Two strictly separate blocks; the UI must never merge them.
      applicationReports: { dataKind: 'APPLICATION_REPORT', active: f.active, confirmed: f.confirmed, pending: f.pending, last24h: f.last24h, byType: f.byType, recent: f.recent.map(i => pubIncident(i)) },
      liveTraffic: { dataKind: 'LIVE_TRAFFIC_PROVIDER', available: live.available, provider: live.provider, message: live.message, data: live.data },
    }
  })

  // ───────────── search / routing ─────────────
  app.get('/api/search', rl(30), async (req: any) => {
    const q = String(req.query.q || '').trim().slice(0, 120)
    if (q.length < 2) return []
    try { return await geocode(cfg, q, deps.fetchImpl) } catch { throw new AppError(502, 'geocoding_unavailable') }
  })
  app.get('/api/reverse', rl(30), async (req: any) => {
    const q = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }).parse(req.query)
    try { return await reverseGeocode(cfg, q.lat, q.lng, deps.fetchImpl) } catch { throw new AppError(502, 'geocoding_unavailable') }
  })
  const pt = z.string().regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/).transform(s => s.split(',').map(Number) as [number, number])
  app.get('/api/routes', rl(30), async (req) => {
    const q = z.object({ from: pt, to: pt }).parse(req.query)
    if (!inMorocco(...q.from) || !inMorocco(...q.to)) throw badRequest('outside_morocco')
    try { return await route(cfg, q.from, q.to, deps.traffic, deps.fetchImpl) } catch { throw new AppError(502, 'routing_unavailable') }
  })

  // ───────────── optional traffic AI ─────────────
  app.get('/api/ai/status', async () => ({ available: deps.ai.available, provider: deps.ai.name }))
  app.post('/api/ai/summary', rl(L.ai), async (req) => {
    const b = z.object({ cityId: z.string(), lang: z.enum(['ar', 'fr', 'en']).default('fr') }).parse(req.body)
    if (!deps.ai.available) return { available: false, summary: null, reason: 'ai_disabled' }
    const c = await store.getCity(b.cityId)
    if (!c) throw notFound()
    const f = await cityFacts(c.id)
    const d = 0.12
    const live = await fetchTraffic(deps.traffic, { n: c.lat + d, s: c.lat - d, e: c.lng + d, w: c.lng - d })
    // No reliable current data at all: refuse to call the model, so it cannot make anything up.
    if (f.active === 0 && !(live.available && live.data.length)) return { available: true, summary: null, reason: 'no_reliable_data' }
    const facts = {
      city: c.name,
      application_reports: { note: 'driver reports from this app, not live traffic', active: f.active, confirmed: f.confirmed, pending: f.pending, last24h: f.last24h, byType: f.byType },
      live_traffic_provider: live.available ? { provider: live.provider, readings: live.data.map(x => ({ level: x.level, currentSpeedKmh: x.currentSpeedKmh ?? null, freeFlowSpeedKmh: x.freeFlowSpeedKmh ?? null })) } : { available: false },
    }
    try {
      const s = await deps.ai.complete(AI_SYSTEM_PROMPT, `Language: ${b.lang}\nFacts:\n${JSON.stringify(facts)}`)
      return { available: true, summary: s, reason: 'ok', facts }
    } catch { return { available: true, summary: null, reason: 'ai_error' } }
  })

  // ───────────── admin ─────────────
  const adm = { preHandler: app.requireAdmin }
  app.get('/api/admin/stats', adm, async () => {
    const d = new Date(); d.setHours(0, 0, 0, 0)
    const w = new Date(Date.now() - 7 * 864e5)
    const c = async (statuses?: Status[], createdAfter?: Date) => (await store.listIncidents({ statuses, createdAfter, take: 1 })).total
    const [total, pending, confirmed, rejected, expired, today, week, users, unread] = await Promise.all([
      c(), c(['PENDING']), c(['CONFIRMED']), c(['REJECTED']), c(['EXPIRED']), c(undefined, d), c(undefined, w),
      store.listUsers({ take: 1 }).then(r => r.total), store.listNotifications({ unreadOnly: true, take: 1 }).then(r => r.total),
    ])
    return { total, pending, confirmed, rejected, expired, today, week, users, unreadNotifications: unread }
  })
  app.get('/api/admin/incidents', adm, async (req) => {
    const q = page.extend({ status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED']).optional(), type: z.enum(TYPES).optional(), cityId: z.string().optional() }).parse(req.query)
    const r = await store.listIncidents({ statuses: q.status ? [q.status] : undefined, type: q.type, cityId: q.cityId, skip: q.skip, take: q.take })
    return { items: r.items.map(adminIncident), total: r.total }
  })
  app.patch('/api/admin/incidents/:id', adm, async (req: any) => {
    const b = z.object({ status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED']), reason: z.string().trim().max(300).optional() }).parse(req.body)
    const i = await store.getIncident(req.params.id)
    if (!i) throw notFound()
    const upd = await store.updateIncident(i.id, { status: b.status, rejectionReason: b.status === 'REJECTED' ? b.reason ?? null : null })
    await notifyOwnerStatus(store, upd, b.status, b.reason)
    await audit(req, 'incident.status', 'Incident', i.id, { from: i.status, to: b.status, ...(b.reason ? { reason: b.reason } : {}) })
    return pubIncident((await store.getIncident(i.id))!, { mine: true })
  })
  app.post('/api/admin/incidents/:id/:action(approve|reject|expire)', adm, async (req: any) => {
    const map: Record<string, Status> = { approve: 'CONFIRMED', reject: 'REJECTED', expire: 'EXPIRED' }
    const status = map[req.params.action]
    const reason = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body ?? {}).reason
    const i = await store.getIncident(req.params.id)
    if (!i) throw notFound()
    const upd = await store.updateIncident(i.id, { status, rejectionReason: status === 'REJECTED' ? reason ?? null : null })
    await notifyOwnerStatus(store, upd, status, reason)
    await audit(req, 'incident.' + req.params.action, 'Incident', i.id, { from: i.status, ...(reason ? { reason } : {}) })
    return { id: i.id, status }
  })
  // legacy path kept from the prototype
  app.post('/api/incidents/:id/expire', adm, async (req: any) => {
    const i = await store.getIncident(req.params.id); if (!i) throw notFound()
    const upd = await store.updateIncident(i.id, { status: 'EXPIRED' })
    await notifyOwnerStatus(store, upd, 'EXPIRED'); await audit(req, 'incident.expire', 'Incident', i.id, { from: i.status })
    return { id: i.id, status: 'EXPIRED' }
  })
  app.delete('/api/admin/incidents/:id', adm, async (req: any) => {
    const i = await store.getIncident(req.params.id)
    if (!i) throw notFound()
    const photos = await store.deleteIncident(i.id)
    for (const p of photos) await deps.storage.delete(p.storageKey).catch(() => {})
    await audit(req, 'incident.delete', 'Incident', i.id, { type: i.type, status: i.status })
    return { ok: true }
  })
  app.get('/api/admin/users', adm, async (req) => {
    const q = page.extend({ q: z.string().max(80).optional() }).parse(req.query)
    const r = await store.listUsers({ q: q.q, skip: q.skip, take: q.take })
    return { items: r.items.map(adminUser), total: r.total }
  })
  app.patch('/api/admin/users/:id', adm, async (req: any) => {
    const b = z.object({ role: z.enum(['USER', 'ADMIN']).optional(), isActive: z.boolean().optional() }).parse(req.body)
    const u = await store.getUserById(req.params.id)
    if (!u) throw notFound()
    if (u.id === req.auth.id && (b.role === 'USER' || b.isActive === false)) throw badRequest('cannot_demote_self')
    const patch: any = { ...b }
    if (b.isActive === false || (b.role && b.role !== u.role)) patch.tokenVersion = u.tokenVersion + 1 // force re-login
    const upd = await store.updateUser(u.id, patch)
    await audit(req, 'user.update', 'User', u.id, b as any)
    return adminUser(upd)
  })
  app.get('/api/admin/notifications', adm, async (req) => {
    const q = page.parse(req.query)
    const r = await store.listNotifications({ skip: q.skip, take: q.take })
    return { items: r.items.map(n => ({ ...pubNotification(n), userId: n.userId })), total: r.total }
  })
  app.get('/api/admin/providers', adm, async () => ({
    traffic: { ...deps.trafficStatus, dataKind: 'LIVE_TRAFFIC_PROVIDER' },
    ai: { name: deps.ai.name, available: deps.ai.available },
    storage: { name: deps.storage.name },
    geocoding: { url: new URL(cfg.geocodingUrl).host }, routing: { url: new URL(cfg.routingUrl).host }, // hosts only; no keys
  }))
  app.get('/api/admin/audit', adm, async (req) => {
    const q = page.parse(req.query)
    return store.listAudit({ skip: q.skip, take: q.take })
  })

  return app
}
