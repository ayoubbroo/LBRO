import { randomUUID } from 'node:crypto'
import { distM } from '../logic.js'
import type * as T from './types.js'

/** In-memory Store used by the test-suite (no database needed). Mirrors PrismaStore semantics. */
export class MemoryStore implements T.Store {
  users: T.UserRec[] = []
  cities: T.CityRec[] = []
  incidents: T.IncidentRec[] = []
  votes: { incidentId: string; voterKey: string; stillThere: boolean }[] = []
  photos: T.PhotoRec[] = []
  favorites: T.FavoriteRec[] = []
  notifications: T.NotificationRec[] = []
  audit: T.AuditRec[] = []

  constructor(cities: Omit<T.CityRec, 'id'>[] = []) {
    this.cities = cities.map(c => ({ id: randomUUID(), ...c }))
  }
  async createUser(d: Parameters<T.Store['createUser']>[0]) {
    if (this.users.some(u => u.email === d.email)) throw Object.assign(new Error('unique'), { code: 'P2002' })
    const u: T.UserRec = { id: randomUUID(), email: d.email, name: d.name ?? null, passwordHash: d.passwordHash, role: d.role ?? 'USER', isActive: true, tokenVersion: 0, locale: d.locale ?? 'fr', createdAt: new Date(), lastLoginAt: null }
    this.users.push(u); return u
  }
  async getUserByEmail(email: string) { return this.users.find(u => u.email === email) ?? null }
  async getUserById(id: string) { return this.users.find(u => u.id === id) ?? null }
  async updateUser(id: string, patch: Parameters<T.Store['updateUser']>[1]) {
    const u = this.users.find(x => x.id === id); if (!u) throw new Error('not found')
    Object.assign(u, patch); return u
  }
  async listUsers(o: { q?: string; skip?: number; take?: number }) {
    let l = this.users.filter(u => !o.q || u.email.includes(o.q.toLowerCase()) || (u.name ?? '').toLowerCase().includes(o.q.toLowerCase()))
    l = [...l].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return { items: l.slice(o.skip ?? 0, (o.skip ?? 0) + (o.take ?? 50)), total: l.length }
  }
  async listCities() { return [...this.cities].sort((a, b) => a.name.localeCompare(b.name)) }
  async getCity(k: string) { return this.cities.find(c => c.id === k || c.slug === k) ?? null }

  async createIncident(d: T.NewIncident) {
    const now = new Date()
    const i: T.IncidentRec = { id: randomUUID(), clientId: d.clientId ?? null, type: d.type, latitude: d.latitude, longitude: d.longitude, description: d.description, status: d.status ?? 'PENDING', source: d.source ?? 'USER_REPORT', isDemo: d.isDemo ?? false, confidence: 1, rejectionReason: null, createdAt: now, updatedAt: now, expiresAt: d.expiresAt, createdById: d.createdById ?? null, cityId: d.cityId ?? null, deviceHash: d.deviceHash ?? null }
    this.incidents.push(i); return i
  }
  private view(i: T.IncidentRec): T.IncidentView {
    const v = this.votes.filter(x => x.incidentId === i.id)
    return { ...i, photos: this.photos.filter(p => p.incidentId === i.id), confirmCount: v.filter(x => x.stillThere).length, goneCount: v.filter(x => !x.stillThere).length }
  }
  async getIncident(id: string) { const i = this.incidents.find(x => x.id === id); return i ? this.view(i) : null }
  async getIncidentByClientId(c: string) { return this.incidents.find(x => x.clientId === c) ?? null }
  async listIncidents(f: T.IncidentFilter) {
    let l = this.incidents.filter(i =>
      (!f.statuses || f.statuses.includes(i.status)) && (!f.cityId || i.cityId === f.cityId) && (!f.type || i.type === f.type) &&
      (!f.ownerId || i.createdById === f.ownerId) && (f.includeDemo !== false || !i.isDemo) && (!f.createdAfter || i.createdAt > f.createdAfter) &&
      (!f.bbox || (i.latitude <= f.bbox.n && i.latitude >= f.bbox.s && i.longitude <= f.bbox.e && i.longitude >= f.bbox.w)))
    l = [...l].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return { items: l.slice(f.skip ?? 0, (f.skip ?? 0) + (f.take ?? 100)).map(i => this.view(i)), total: l.length }
  }
  async findRecentSimilar(type: string, since: Date) {
    return this.incidents.filter(i => i.type === type && ['PENDING', 'CONFIRMED'].includes(i.status) && i.createdAt > since)
  }
  async updateIncident(id: string, patch: Parameters<T.Store['updateIncident']>[1]) {
    const i = this.incidents.find(x => x.id === id); if (!i) throw new Error('not found')
    Object.assign(i, patch, { updatedAt: new Date() }); return i
  }
  async deleteIncident(id: string) {
    const ph = this.photos.filter(p => p.incidentId === id)
    this.incidents = this.incidents.filter(i => i.id !== id)
    this.photos = this.photos.filter(p => p.incidentId !== id)
    this.votes = this.votes.filter(v => v.incidentId !== id)
    return ph
  }
  async expireDue(now: Date) {
    const due = this.incidents.filter(i => ['PENDING', 'CONFIRMED'].includes(i.status) && i.expiresAt < now)
    due.forEach(i => { i.status = 'EXPIRED'; i.updatedAt = now }); return due
  }
  async upsertVote(incidentId: string, voterKey: string, stillThere: boolean) {
    const e = this.votes.find(v => v.incidentId === incidentId && v.voterKey === voterKey)
    if (e) e.stillThere = stillThere; else this.votes.push({ incidentId, voterKey, stillThere })
    const all = this.votes.filter(v => v.incidentId === incidentId)
    const yes = all.filter(v => v.stillThere).length
    return { yes, no: all.length - yes }
  }
  async addPhoto(d: Parameters<T.Store['addPhoto']>[0]) {
    const p: T.PhotoRec = { id: randomUUID(), incidentId: d.incidentId, storageKey: d.storageKey, mimeType: d.mimeType, sizeBytes: d.sizeBytes, uploadedById: d.uploadedById ?? null, createdAt: new Date() }
    this.photos.push(p); return p
  }
  async getPhoto(id: string) { return this.photos.find(p => p.id === id) ?? null }
  async countPhotos(incidentId: string) { return this.photos.filter(p => p.incidentId === incidentId).length }

  async listFavorites(userId: string) { return this.favorites.filter(f => f.userId === userId) }
  async getFavorite(id: string) { return this.favorites.find(f => f.id === id) ?? null }
  async createFavorite(d: Parameters<T.Store['createFavorite']>[0]) {
    const f: T.FavoriteRec = { id: randomUUID(), ...d, createdAt: new Date(), updatedAt: new Date() }
    this.favorites.push(f); return f
  }
  async updateFavorite(id: string, patch: Parameters<T.Store['updateFavorite']>[1]) {
    const f = this.favorites.find(x => x.id === id); if (!f) throw new Error('not found')
    Object.assign(f, patch, { updatedAt: new Date() }); return f
  }
  async deleteFavorite(id: string) { this.favorites = this.favorites.filter(f => f.id !== id) }
  async favoritesNear(lat: number, lng: number, maxRadiusM: number) {
    return this.favorites.filter(f => f.notify && distM(lat, lng, f.lat, f.lng) <= Math.min(f.radiusM, maxRadiusM))
  }

  async createNotification(d: Parameters<T.Store['createNotification']>[0]) {
    const n: T.NotificationRec = { id: randomUUID(), userId: d.userId, type: d.type, title: d.title, body: d.body, incidentId: d.incidentId ?? null, data: d.data ?? null, readAt: null, createdAt: new Date() }
    this.notifications.push(n); return n
  }
  async hasNotification(userId: string, type: T.NotificationType, incidentId: string) {
    return this.notifications.some(n => n.userId === userId && n.type === type && n.incidentId === incidentId)
  }
  async listNotifications(o: { userId?: string; unreadOnly?: boolean; skip?: number; take?: number }) {
    let l = this.notifications.filter(n => (!o.userId || n.userId === o.userId) && (!o.unreadOnly || !n.readAt))
    l = [...l].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return { items: l.slice(o.skip ?? 0, (o.skip ?? 0) + (o.take ?? 50)), total: l.length }
  }
  async countUnread(userId: string) { return this.notifications.filter(n => n.userId === userId && !n.readAt).length }
  async markRead(userId: string, id: string) {
    const n = this.notifications.find(x => x.id === id && x.userId === userId); if (!n) return false
    n.readAt = n.readAt ?? new Date(); return true
  }
  async markAllRead(userId: string) {
    const l = this.notifications.filter(n => n.userId === userId && !n.readAt); l.forEach(n => (n.readAt = new Date())); return l.length
  }
  async addAudit(d: Parameters<T.Store['addAudit']>[0]) {
    this.audit.push({ id: randomUUID(), action: d.action, actorId: d.actorId ?? null, actor: d.actor ?? null, entity: d.entity ?? null, entityId: d.entityId ?? null, meta: d.meta ?? null, at: new Date() })
  }
  async listAudit(o: { skip?: number; take?: number }) {
    const l = [...this.audit].sort((a, b) => b.at.getTime() - a.at.getTime())
    return { items: l.slice(o.skip ?? 0, (o.skip ?? 0) + (o.take ?? 50)), total: l.length }
  }
}
