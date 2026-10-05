import type { Config } from './config.js'
import type { Store } from './store/types.js'
import type { StorageProvider } from './storage.js'
import type { AiProvider } from './providers/ai.js'
import type { TrafficProvider, ProviderStatus } from './providers/traffic.js'

export interface Limits { global: number; auth: number; report: number; upload: number; ai: number }
export const defaultLimits: Limits = { global: 120, auth: 10, report: 5, upload: 20, ai: 10 }

export interface Deps {
  cfg: Config
  store: Store
  storage: StorageProvider
  traffic: TrafficProvider
  trafficStatus: ProviderStatus
  ai: AiProvider
  bcryptRounds?: number
  limits?: Partial<Limits>
  fetchImpl?: typeof fetch
}
