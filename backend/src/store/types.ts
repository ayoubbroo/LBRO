export type Role = 'USER' | 'ADMIN'
export type Status = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'EXPIRED'
export type FavoriteKind = 'HOME' | 'WORK' | 'CUSTOM'
export type NotificationType = 'INCIDENT_NEAR_FAVORITE' | 'REPORT_CONFIRMED' | 'REPORT_REJECTED' | 'REPORT_EXPIRED' | 'SYSTEM'

export interface UserRec {
  id: string; email: string; name: string | null; passwordHash: string; role: Role
  isActive: boolean; tokenVersion: number; locale: string; createdAt: Date; lastLoginAt: Date | null
}
export interface CityRec { id: string; name: string; slug: string | null; nameAr: string | null; nameEn: string | null; lat: number; lng: number }
export interface PhotoRec { id: string; incidentId: string; storageKey: string; mimeType: string; sizeBytes: number; uploadedById: string | null; createdAt: Date }
export interface IncidentRec {
  id: string; clientId: string | null; type: string; latitude: number; longitude: number; description: string
  status: Status; source: string; isDemo: boolean; confidence: number; rejectionReason: string | null
  createdAt: Date; updatedAt: Date; expiresAt: Date; createdById: string | null; cityId: string | null; deviceHash: string | null
}
export interface IncidentView extends IncidentRec { photos: PhotoRec[]; confirmCount: number; goneCount: number }
export interface NewIncident {
  clientId?: string | null; type: string; latitude: number; longitude: number; description: string
  expiresAt: Date; createdById?: string | null; cityId?: string | null; deviceHash?: string | null
  source?: string; isDemo?: boolean; status?: Status
}
export interface IncidentFilter {
  statuses?: Status[]; cityId?: string; type?: string; ownerId?: string; includeDemo?: boolean
  createdAfter?: Date; bbox?: { n: number; s: number; e: number; w: number }
  skip?: number; take?: number
}
export interface FavoriteRec { id: string; userId: string; label: string; kind: FavoriteKind; lat: number; lng: number; radiusM: number; notify: boolean; createdAt: Date; updatedAt: Date }
export interface NotificationRec { id: string; userId: string; type: NotificationType; title: string; body: string; incidentId: string | null; data: Record<string, unknown> | null; readAt: Date | null; createdAt: Date }
export interface AuditRec { id: string; action: string; actorId: string | null; actor: string | null; entity: string | null; entityId: string | null; meta: Record<string, unknown> | null; at: Date }

export interface Store {
  // users
  createUser(d: { email: string; passwordHash: string; name?: string | null; role?: Role; locale?: string }): Promise<UserRec>
  getUserByEmail(email: string): Promise<UserRec | null>
  getUserById(id: string): Promise<UserRec | null>
  updateUser(id: string, patch: Partial<Pick<UserRec, 'name' | 'passwordHash' | 'locale' | 'isActive' | 'role' | 'tokenVersion' | 'lastLoginAt'>>): Promise<UserRec>
  listUsers(o: { q?: string; skip?: number; take?: number }): Promise<{ items: UserRec[]; total: number }>
  // cities
  listCities(): Promise<CityRec[]>
  getCity(idOrSlug: string): Promise<CityRec | null>
  // incidents
  createIncident(d: NewIncident): Promise<IncidentRec>
  getIncident(id: string): Promise<IncidentView | null>
  getIncidentByClientId(clientId: string): Promise<IncidentRec | null>
  listIncidents(f: IncidentFilter): Promise<{ items: IncidentView[]; total: number }>
  findRecentSimilar(type: string, since: Date): Promise<IncidentRec[]>
  updateIncident(id: string, patch: Partial<Pick<IncidentRec, 'status' | 'confidence' | 'expiresAt' | 'rejectionReason' | 'description'>>): Promise<IncidentRec>
  deleteIncident(id: string): Promise<PhotoRec[]>
  expireDue(now: Date): Promise<IncidentRec[]>
  upsertVote(incidentId: string, voterKey: string, stillThere: boolean): Promise<{ yes: number; no: number }>
  // photos
  addPhoto(d: { incidentId: string; storageKey: string; mimeType: string; sizeBytes: number; uploadedById?: string | null }): Promise<PhotoRec>
  getPhoto(id: string): Promise<PhotoRec | null>
  countPhotos(incidentId: string): Promise<number>
  // favorites
  listFavorites(userId: string): Promise<FavoriteRec[]>
  getFavorite(id: string): Promise<FavoriteRec | null>
  createFavorite(d: { userId: string; label: string; kind: FavoriteKind; lat: number; lng: number; radiusM: number; notify: boolean }): Promise<FavoriteRec>
  updateFavorite(id: string, patch: Partial<Pick<FavoriteRec, 'label' | 'kind' | 'lat' | 'lng' | 'radiusM' | 'notify'>>): Promise<FavoriteRec>
  deleteFavorite(id: string): Promise<void>
  favoritesNear(lat: number, lng: number, maxRadiusM: number): Promise<FavoriteRec[]>
  // notifications
  createNotification(d: { userId: string; type: NotificationType; title: string; body: string; incidentId?: string | null; data?: Record<string, unknown> | null }): Promise<NotificationRec>
  hasNotification(userId: string, type: NotificationType, incidentId: string): Promise<boolean>
  listNotifications(o: { userId?: string; unreadOnly?: boolean; skip?: number; take?: number }): Promise<{ items: NotificationRec[]; total: number }>
  countUnread(userId: string): Promise<number>
  markRead(userId: string, id: string): Promise<boolean>
  markAllRead(userId: string): Promise<number>
  // audit
  addAudit(d: { action: string; actorId?: string | null; actor?: string | null; entity?: string | null; entityId?: string | null; meta?: Record<string, unknown> | null }): Promise<void>
  listAudit(o: { skip?: number; take?: number }): Promise<{ items: AuditRec[]; total: number }>
}
