// Central, typed configuration. Nothing here has a real secret as a default.
export interface Config {
  nodeEnv: string
  port: number
  jwtSecret: string
  jwtExpiresIn: string
  corsOrigins: string[]
  allowAnonymousReports: boolean
  trafficProvider: string
  trafficApiKey: string
  trafficApiUrl: string
  aiProvider: string
  aiApiKey: string
  aiModel: string
  geocodingUrl: string
  routingUrl: string
  storageProvider: string
  storageLocalDir: string
  storageBucket: string
  storageEndpoint: string
  storageRegion: string
  storageAccessKey: string
  storageSecretKey: string
  maxUploadBytes: number
  maxPhotosPerIncident: number
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = env.NODE_ENV || 'development'
  const jwtSecret = env.JWT_SECRET || ''
  if (nodeEnv === 'production' && jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set (32+ characters) in production')
  }
  return {
    nodeEnv,
    port: Number(env.PORT || 3001),
    // Development-only fallback so `npm run dev` works; refused in production above.
    jwtSecret: jwtSecret || 'dev-only-insecure-secret-change-me-0000000000',
    jwtExpiresIn: env.JWT_EXPIRES_IN || '7d',
    corsOrigins: (env.CORS_ORIGINS || (nodeEnv === 'production' ? '' : 'http://localhost:5173'))
      .split(',').map(s => s.trim()).filter(Boolean),
    allowAnonymousReports: (env.ALLOW_ANONYMOUS_REPORTS ?? 'true') !== 'false',
    trafficProvider: (env.TRAFFIC_PROVIDER || 'none').toLowerCase(),
    trafficApiKey: env.TRAFFIC_API_KEY || '',
    trafficApiUrl: env.TRAFFIC_API_URL || '',
    aiProvider: (env.AI_PROVIDER || 'none').toLowerCase(),
    aiApiKey: env.AI_API_KEY || '',
    aiModel: env.AI_MODEL || '',
    geocodingUrl: env.GEOCODING_API_URL || 'https://nominatim.openstreetmap.org',
    routingUrl: env.ROUTING_API_URL || 'https://router.project-osrm.org',
    storageProvider: (env.STORAGE_PROVIDER || 'local').toLowerCase(),
    storageLocalDir: env.STORAGE_LOCAL_DIR || 'uploads',
    storageBucket: env.STORAGE_BUCKET || '',
    storageEndpoint: env.STORAGE_ENDPOINT || '',
    storageRegion: env.STORAGE_REGION || 'auto',
    storageAccessKey: env.STORAGE_ACCESS_KEY || '',
    storageSecretKey: env.STORAGE_SECRET_KEY || '',
    maxUploadBytes: Number(env.MAX_UPLOAD_MB || 5) * 1024 * 1024,
    maxPhotosPerIncident: Number(env.MAX_PHOTOS_PER_INCIDENT || 4),
  }
}
