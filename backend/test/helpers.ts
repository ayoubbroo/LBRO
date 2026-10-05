import { build } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { MemoryStore } from '../src/store/memory.js'
import { MemoryStorage } from '../src/storage.js'
import { createTrafficProvider, type TrafficProvider } from '../src/providers/traffic.js'
import { createAiProvider, type AiProvider } from '../src/providers/ai.js'

export const CITIES = [
  { name: 'Meknès', slug: 'meknes', nameAr: 'مكناس', nameEn: 'Meknes', lat: 33.8935, lng: -5.5473 },
  { name: 'Casablanca', slug: 'casablanca', nameAr: 'الدار البيضاء', nameEn: 'Casablanca', lat: 33.5731, lng: -7.5898 },
]
export const MEKNES = { latitude: 33.8935, longitude: -5.5473 }

export async function makeApp(o: { env?: Record<string, string>; traffic?: TrafficProvider; ai?: AiProvider; limits?: any } = {}) {
  const cfg = loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(40), ...o.env } as any)
  const store = new MemoryStore(CITIES)
  const storage = new MemoryStorage()
  const t = createTrafficProvider(cfg)
  const deps = { cfg, store, storage, traffic: o.traffic ?? t.provider, trafficStatus: t.status, ai: o.ai ?? createAiProvider(cfg), bcryptRounds: 4, limits: { global: 10000, auth: 1000, report: 1000, upload: 1000, ai: 1000, ...o.limits } }
  const app = await build(deps)
  const j = (method: string, url: string, payload?: unknown, token?: string, headers: Record<string, string> = {}) =>
    app.inject({ method: method as any, url, payload: payload as any, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers } })
  async function register(email = 'a@test.ma', password = 'password123') {
    const r = await j('POST', '/api/auth/register', { email, password })
    const b = r.json()
    return { token: b.token as string, user: b.user, res: r }
  }
  async function admin(email = 'admin@test.ma') {
    const u = await register(email)
    await store.updateUser(u.user.id, { role: 'ADMIN' })
    return u
  }
  return { app, store, storage, deps, j, register, admin }
}

export function multipart(filename: string, mime: string, data: Buffer) {
  const b = 'XBOUNDARYX'
  const body = Buffer.concat([
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
    data, Buffer.from(`\r\n--${b}--\r\n`),
  ])
  return { body, headers: { 'content-type': `multipart/form-data; boundary=${b}` } }
}
// Smallest real-looking headers (magic bytes + padding).
export const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0', 'ascii'), Buffer.alloc(40, 1), Buffer.from([0xff, 0xda, 0x00, 0x02, 0xff, 0xd9])])
export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)])
export const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(40)])
