import type { IncidentView, UserRec, FavoriteRec, NotificationRec } from './store/types.js'

/** Public incident shape: never exposes deviceHash or reporter identity. */
export const pubIncident = (i: IncidentView, extra: { mine?: boolean } = {}) => ({
  id: i.id, type: i.type, latitude: i.latitude, longitude: i.longitude, description: i.description,
  status: i.status, source: i.source, isDemo: i.isDemo, confidence: i.confidence, cityId: i.cityId,
  createdAt: i.createdAt, updatedAt: i.updatedAt, expiresAt: i.expiresAt,
  confirmCount: i.confirmCount, goneCount: i.goneCount,
  rejectionReason: extra.mine ? i.rejectionReason : undefined,
  photos: i.photos.map(p => ({ id: p.id, url: `/api/photos/${p.id}` })),
  // Always labelled: this is a driver report, never live provider data.
  dataKind: 'APPLICATION_REPORT' as const,
})
export const adminIncident = (i: IncidentView) => ({ ...pubIncident(i, { mine: true }), createdById: i.createdById, clientId: i.clientId })
export const adminUser = (u: UserRec) => ({ id: u.id, email: u.email, name: u.name, role: u.role, isActive: u.isActive, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt })
export const pubFavorite = (f: FavoriteRec) => ({ id: f.id, label: f.label, kind: f.kind, lat: f.lat, lng: f.lng, radiusM: f.radiusM, notify: f.notify })
export const pubNotification = (n: NotificationRec) => ({ id: n.id, type: n.type, incidentId: n.incidentId, data: n.data, title: n.title, body: n.body, readAt: n.readAt, createdAt: n.createdAt })
