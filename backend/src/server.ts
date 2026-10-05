import 'dotenv/config'
import { loadConfig } from './config.js'
import { build, expireOld } from './app.js'
import { PrismaStore } from './store/prisma.js'
import { createStorage } from './storage.js'
import { createTrafficProvider } from './providers/traffic.js'
import { createAiProvider } from './providers/ai.js'

const cfg = loadConfig()
const prismaMod: any = await import('@prisma/client') // resolved at runtime after `prisma generate`
const prisma = new prismaMod.PrismaClient()
const { provider, status } = createTrafficProvider(cfg)
const deps = { cfg, store: new PrismaStore(prisma), storage: createStorage(cfg), traffic: provider, trafficStatus: status, ai: createAiProvider(cfg) }
const app = await build(deps)
const timer = setInterval(() => expireOld(deps).catch(e => app.log.error(e)), 60_000)
const stop = async () => { clearInterval(timer); await app.close(); await prisma.$disconnect(); process.exit(0) }
process.on('SIGINT', stop); process.on('SIGTERM', stop)
await app.listen({ port: cfg.port, host: '0.0.0.0' })
