import { build } from '/home/claude/work/TRAFFIC-MAROC/backend/src/app.js'
import { loadConfig } from '/home/claude/work/TRAFFIC-MAROC/backend/src/config.js'
import { MemoryStore } from '/home/claude/work/TRAFFIC-MAROC/backend/src/store/memory.js'
import { MemoryStorage } from '/home/claude/work/TRAFFIC-MAROC/backend/src/storage.js'
import { createTrafficProvider } from '/home/claude/work/TRAFFIC-MAROC/backend/src/providers/traffic.js'
import { createAiProvider } from '/home/claude/work/TRAFFIC-MAROC/backend/src/providers/ai.js'
const cfg = loadConfig({ NODE_ENV: 'development', PORT: '3999' } as any)
const t = createTrafficProvider(cfg)
const app = await build({ cfg, store: new MemoryStore([{ name: 'Meknès', slug: 'meknes', nameAr: null, nameEn: null, lat: 33.8935, lng: -5.5473 }]), storage: new MemoryStorage(), traffic: t.provider, trafficStatus: t.status, ai: createAiProvider(cfg) })
await app.listen({ port: 3999, host: '127.0.0.1' })
