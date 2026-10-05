// Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='long passphrase' npm run create-admin
import 'dotenv/config'
import { createRequire } from 'node:module'
import bcrypt from 'bcryptjs'
const { PrismaClient } = createRequire(import.meta.url)('@prisma/client')
const p = new PrismaClient()
const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase()
const password = process.env.ADMIN_PASSWORD || ''
if (!email.includes('@') || password.length < 12) { console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ chars).'); process.exit(1) }
const passwordHash = await bcrypt.hash(password, 12)
const u = await p.user.upsert({ where: { email }, update: { role: 'ADMIN', passwordHash, isActive: true }, create: { email, passwordHash, role: 'ADMIN', name: 'Admin' } })
await p.auditLog.create({ data: { action: 'admin.bootstrap', actorId: u.id, entity: 'User', entityId: u.id } })
console.log('Admin ready:', email)
await p.$disconnect()
