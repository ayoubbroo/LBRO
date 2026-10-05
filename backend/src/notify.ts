import type { Store, IncidentRec, NotificationType } from './store/types.js'

const MAX_NEAR_RADIUS_M = 5000

/**
 * Notification rows store `type` + `data`; clients render translated text from them.
 * title/body are an English fallback for API consumers that don't translate.
 */
export async function notifyNearFavorites(store: Store, inc: IncidentRec) {
  const favs = await store.favoritesNear(inc.latitude, inc.longitude, MAX_NEAR_RADIUS_M)
  const seen = new Set<string>()
  for (const f of favs) {
    if (seen.has(f.userId) || f.userId === inc.createdById) continue // one per user, never to the reporter
    seen.add(f.userId)
    if (await store.hasNotification(f.userId, 'INCIDENT_NEAR_FAVORITE', inc.id)) continue
    await store.createNotification({
      userId: f.userId, type: 'INCIDENT_NEAR_FAVORITE', incidentId: inc.id,
      title: 'Driver report near a saved place', body: `A "${inc.type}" report (${inc.status.toLowerCase()}) was posted near "${f.label}".`,
      data: { incidentType: inc.type, status: inc.status, favoriteId: f.id, favoriteLabel: f.label, lat: inc.latitude, lng: inc.longitude },
    })
  }
}

const STATUS_NOTIF: Record<string, NotificationType | undefined> = { CONFIRMED: 'REPORT_CONFIRMED', REJECTED: 'REPORT_REJECTED', EXPIRED: 'REPORT_EXPIRED' }

export async function notifyOwnerStatus(store: Store, inc: IncidentRec, newStatus: string, reason?: string | null) {
  const type = STATUS_NOTIF[newStatus]
  if (!type || !inc.createdById) return
  if (await store.hasNotification(inc.createdById, type, inc.id)) return
  await store.createNotification({
    userId: inc.createdById, type, incidentId: inc.id,
    title: `Your report is ${newStatus.toLowerCase()}`, body: `Your "${inc.type}" report is now ${newStatus.toLowerCase()}.`,
    data: { incidentType: inc.type, status: newStatus, ...(reason ? { reason } : {}) },
  })
}
