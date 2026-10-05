import { distM } from '../logic.js'
import type * as T from './types.js'

/**
 * PostgreSQL implementation through Prisma.
 * `db` is typed loosely on purpose: the generated client (`prisma generate`) is the
 * source of truth for model types, and this keeps the file compiling before generation.
 */
const incidentWhere = (f: T.IncidentFilter) => ({
  ...(f.statuses ? { status: { in: f.statuses } } : {}),
  ...(f.cityId ? { cityId: f.cityId } : {}),
  ...(f.type ? { type: f.type } : {}),
  ...(f.ownerId ? { createdById: f.ownerId } : {}),
  ...(f.includeDemo === false ? { isDemo: false } : {}),
  ...(f.createdAfter ? { createdAt: { gt: f.createdAfter } } : {}),
  ...(f.bbox ? { latitude: { gte: f.bbox.s, lte: f.bbox.n }, longitude: { gte: f.bbox.w, lte: f.bbox.e } } : {}),
})

export class PrismaStore implements T.Store {
  constructor(private db: any) {}

  createUser(d: Parameters<T.Store['createUser']>[0]) { return this.db.user.create({ data: d }) }
  getUserByEmail(email: string) { return this.db.user.findUnique({ where: { email } }) }
  getUserById(id: string) { return this.db.user.findUnique({ where: { id } }) }
  updateUser(id: string, data: Parameters<T.Store['updateUser']>[1]) { return this.db.user.update({ where: { id }, data }) }
  async listUsers(o: { q?: string; skip?: number; take?: number }) {
    const where = o.q ? { OR: [{ email: { contains: o.q, mode: 'insensitive' } }, { name: { contains: o.q, mode: 'insensitive' } }] } : {}
    const [items, total] = await Promise.all([
      this.db.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: o.skip ?? 0, take: o.take ?? 50 }),
      this.db.user.count({ where }),
    ])
    return { items, total }
  }
  listCities() { return this.db.city.findMany({ orderBy: { name: 'asc' } }) }
  getCity(k: string) { return this.db.city.findFirst({ where: { OR: [{ id: k }, { slug: k }] } }) }

  createIncident(d: T.NewIncident) { return this.db.incident.create({ data: d }) }
  private async decorate(rows: any[]): Promise<T.IncidentView[]> {
    if (!rows.length) return []
    const ids = rows.map(r => r.id)
    const votes = await this.db.incidentConfirmation.groupBy({ by: ['incidentId', 'stillThere'], where: { incidentId: { in: ids } }, _count: true })
    return rows.map(r => ({
      ...r,
      photos: r.photos ?? [],
      confirmCount: votes.find((v: any) => v.incidentId === r.id && v.stillThere)?._count ?? 0,
      goneCount: votes.find((v: any) => v.incidentId === r.id && !v.stillThere)?._count ?? 0,
    }))
  }
  async getIncident(id: string) {
    const r = await this.db.incident.findUnique({ where: { id }, include: { photos: true } })
    return r ? (await this.decorate([r]))[0] : null
  }
  getIncidentByClientId(clientId: string) { return this.db.incident.findUnique({ where: { clientId } }) }
  async listIncidents(f: T.IncidentFilter) {
    const where = incidentWhere(f)
    const [rows, total] = await Promise.all([
      this.db.incident.findMany({ where, include: { photos: true }, orderBy: { createdAt: 'desc' }, skip: f.skip ?? 0, take: f.take ?? 100 }),
      this.db.incident.count({ where }),
    ])
    return { items: await this.decorate(rows), total }
  }
  findRecentSimilar(type: string, since: Date) {
    return this.db.incident.findMany({ where: { type, status: { in: ['PENDING', 'CONFIRMED'] }, createdAt: { gt: since } } })
  }
  updateIncident(id: string, data: Parameters<T.Store['updateIncident']>[1]) { return this.db.incident.update({ where: { id }, data }) }
  async deleteIncident(id: string) {
    const photos = await this.db.incidentPhoto.findMany({ where: { incidentId: id } })
    await this.db.incident.delete({ where: { id } }) // photos/confirmations cascade
    return photos
  }
  async expireDue(now: Date) {
    const due = await this.db.incident.findMany({ where: { status: { in: ['PENDING', 'CONFIRMED'] }, expiresAt: { lt: now } } })
    if (due.length) await this.db.incident.updateMany({ where: { id: { in: due.map((d: any) => d.id) } }, data: { status: 'EXPIRED' } })
    return due.map((d: any) => ({ ...d, status: 'EXPIRED' }))
  }
  async upsertVote(incidentId: string, voterKey: string, stillThere: boolean) {
    await this.db.incidentConfirmation.upsert({
      where: { incidentId_deviceHash: { incidentId, deviceHash: voterKey } },
      update: { stillThere }, create: { incidentId, deviceHash: voterKey, stillThere },
    })
    const all = await this.db.incidentConfirmation.findMany({ where: { incidentId }, select: { stillThere: true } })
    const yes = all.filter((a: any) => a.stillThere).length
    return { yes, no: all.length - yes }
  }

  addPhoto(d: Parameters<T.Store['addPhoto']>[0]) { return this.db.incidentPhoto.create({ data: d }) }
  getPhoto(id: string) { return this.db.incidentPhoto.findUnique({ where: { id } }) }
  countPhotos(incidentId: string) { return this.db.incidentPhoto.count({ where: { incidentId } }) }

  listFavorites(userId: string) { return this.db.savedLocation.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }) }
  getFavorite(id: string) { return this.db.savedLocation.findUnique({ where: { id } }) }
  createFavorite(d: Parameters<T.Store['createFavorite']>[0]) { return this.db.savedLocation.create({ data: d }) }
  updateFavorite(id: string, data: Parameters<T.Store['updateFavorite']>[1]) { return this.db.savedLocation.update({ where: { id }, data }) }
  async deleteFavorite(id: string) { await this.db.savedLocation.delete({ where: { id } }) }
  async favoritesNear(lat: number, lng: number, maxRadiusM: number) {
    const dLat = maxRadiusM / 111000, dLng = maxRadiusM / (111000 * Math.cos((lat * Math.PI) / 180))
    const rows: T.FavoriteRec[] = await this.db.savedLocation.findMany({
      where: { notify: true, lat: { gte: lat - dLat, lte: lat + dLat }, lng: { gte: lng - dLng, lte: lng + dLng } },
    })
    return rows.filter(f => distM(lat, lng, f.lat, f.lng) <= Math.min(f.radiusM, maxRadiusM))
  }

  createNotification(d: Parameters<T.Store['createNotification']>[0]) { return this.db.notification.create({ data: { ...d, data: d.data ?? undefined } }) }
  async hasNotification(userId: string, type: T.NotificationType, incidentId: string) {
    return (await this.db.notification.count({ where: { userId, type, incidentId } })) > 0
  }
  async listNotifications(o: { userId?: string; unreadOnly?: boolean; skip?: number; take?: number }) {
    const where = { ...(o.userId ? { userId: o.userId } : {}), ...(o.unreadOnly ? { readAt: null } : {}) }
    const [items, total] = await Promise.all([
      this.db.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: o.skip ?? 0, take: o.take ?? 50 }),
      this.db.notification.count({ where }),
    ])
    return { items, total }
  }
  countUnread(userId: string) { return this.db.notification.count({ where: { userId, readAt: null } }) }
  async markRead(userId: string, id: string) {
    const r = await this.db.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } })
    if (r.count) return true
    return (await this.db.notification.count({ where: { id, userId } })) > 0
  }
  async markAllRead(userId: string) {
    return (await this.db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } })).count
  }

  async addAudit(d: Parameters<T.Store['addAudit']>[0]) {
    await this.db.auditLog.create({ data: { action: d.action, actorId: d.actorId ?? null, actor: d.actor ?? null, entity: d.entity ?? null, entityId: d.entityId ?? null, meta: d.meta ?? undefined } })
  }
  async listAudit(o: { skip?: number; take?: number }) {
    const [items, total] = await Promise.all([
      this.db.auditLog.findMany({ orderBy: { at: 'desc' }, skip: o.skip ?? 0, take: o.take ?? 50 }),
      this.db.auditLog.count(),
    ])
    return { items, total }
  }
}
