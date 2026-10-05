export type Status = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'EXPIRED'
export interface Photo { id: string; url: string }
export interface Incident {
  id: string; type: string; latitude: number; longitude: number; description: string; status: Status; source: string
  isDemo: boolean; confidence: number; cityId: string | null; createdAt: string; updatedAt: string; expiresAt: string
  confirmCount: number; goneCount: number; rejectionReason?: string | null; photos: Photo[]; dataKind: 'APPLICATION_REPORT'
}
export interface User { id: string; email: string; name: string | null; role: 'USER' | 'ADMIN'; locale: 'ar' | 'fr' | 'en' }
export interface City { id: string; name: string; slug: string | null; nameAr: string | null; nameEn: string | null; lat: number; lng: number }
export interface Favorite { id: string; label: string; kind: 'HOME' | 'WORK' | 'CUSTOM'; lat: number; lng: number; radiusM: number; notify: boolean }
export interface Notif { id: string; type: string; incidentId: string | null; data: Record<string, any> | null; title: string; body: string; readAt: string | null; createdAt: string }
export interface Place { name: string; lat: number; lng: number }
export interface RouteInfo { trafficAwareEta: boolean; etaNote: string; routes: { distanceM: number; baseDurationS: number; trafficDurationS: number | null; geometry: { coordinates: [number, number][] } }[] }
export interface TrafficInfo { available: boolean; provider: string; message: string; data: { level: string; lat: number; lng: number }[] }
