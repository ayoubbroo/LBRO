export const INCIDENT_TYPES = [
  ['accident', '🚗'], ['roadworks', '🚧'], ['closed', '⛔'], ['pothole', '🕳️'], ['flood', '💧'], ['traffic_light', '🚦'],
  ['stopped', '🚘'], ['danger', '🚨'], ['heavy_traffic', '🐢'], ['damaged_road', '🛣️'], ['other', '📍'],
] as const
export const iconFor = (t: string) => INCIDENT_TYPES.find(x => x[0] === t)?.[1] ?? '📍'
export const MOROCCO_CENTER: [number, number] = [31.8, -7.1]
export const ALLOWED_PHOTO = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
