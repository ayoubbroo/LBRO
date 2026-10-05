import bcrypt from 'bcryptjs'
import jwt from '@fastify/jwt'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Deps } from './deps.js'
import type { UserRec } from './store/types.js'
import { forbidden, unauthorized } from './errors.js'

declare module 'fastify' {
  interface FastifyRequest { auth: UserRec | null }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest) => Promise<void>
    optionalAuth: (req: FastifyRequest) => Promise<void>
    requireAdmin: (req: FastifyRequest) => Promise<void>
  }
}

export const hashPassword = (pw: string, rounds = 12) => bcrypt.hash(pw, rounds)
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash)
// Compared against when the e-mail is unknown, so response time doesn't reveal which e-mails exist.
export const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 4)

export const publicUser = (u: UserRec) => ({ id: u.id, email: u.email, name: u.name, role: u.role, locale: u.locale, createdAt: u.createdAt })

export async function registerAuth(app: FastifyInstance, deps: Deps) {
  await app.register(jwt, { secret: deps.cfg.jwtSecret, sign: { expiresIn: deps.cfg.jwtExpiresIn, algorithm: 'HS256' }, verify: { algorithms: ['HS256'] } })
  app.decorateRequest('auth', null)

  const load = async (req: FastifyRequest) => {
    await req.jwtVerify()
    const p = req.user as { sub: string; tv: number }
    const u = await deps.store.getUserById(p.sub)
    // tokenVersion mismatch = logged out / password changed; inactive = disabled by an admin.
    if (!u || u.tokenVersion !== p.tv) throw unauthorized('invalid_token')
    if (!u.isActive) throw forbidden('account_disabled')
    req.auth = u
  }
  app.decorate('authenticate', async (req: FastifyRequest) => {
    try { await load(req) } catch (e: any) { if (e?.statusCode === 403 || e?.status === 403) throw e; throw unauthorized(e?.status === 401 ? e.code : 'unauthorized') }
  })
  // Anonymous allowed; a *provided but invalid* token is still rejected.
  app.decorate('optionalAuth', async (req: FastifyRequest) => {
    if (!req.headers.authorization) return
    await app.authenticate(req)
  })
  app.decorate('requireAdmin', async (req: FastifyRequest) => {
    await app.authenticate(req)
    if (req.auth?.role !== 'ADMIN') throw forbidden('admin_only')
  })
}

export const signToken = (app: FastifyInstance, u: UserRec) => app.jwt.sign({ sub: u.id, tv: u.tokenVersion, role: u.role })
