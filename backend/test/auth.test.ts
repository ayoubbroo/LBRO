import { describe, it, expect } from 'vitest'
import { makeApp } from './helpers.js'

describe('authentication', () => {
  it('registers, hashes the password, never returns the hash, role is USER', async () => {
    const { store, register } = await makeApp()
    const { res, user } = await register()
    expect(res.statusCode).toBe(201)
    expect(user.role).toBe('USER')
    expect(JSON.stringify(res.json())).not.toContain('passwordHash')
    const rec = await store.getUserByEmail('a@test.ma')
    expect(rec!.passwordHash).not.toBe('password123')
    expect(rec!.passwordHash.startsWith('$2')).toBe(true)
  })
  it('ignores a client-supplied role (no privilege escalation)', async () => {
    const { j, store } = await makeApp()
    const r = await j('POST', '/api/auth/register', { email: 'x@test.ma', password: 'password123', role: 'ADMIN' })
    expect(r.json().user.role).toBe('USER')
    expect((await store.getUserByEmail('x@test.ma'))!.role).toBe('USER')
  })
  it('rejects duplicate e-mail, weak password and bad e-mail', async () => {
    const { j, register } = await makeApp()
    await register()
    expect((await j('POST', '/api/auth/register', { email: 'A@test.ma', password: 'password123' })).statusCode).toBe(409)
    expect((await j('POST', '/api/auth/register', { email: 'b@test.ma', password: 'short' })).statusCode).toBe(400)
    expect((await j('POST', '/api/auth/register', { email: 'nope', password: 'password123' })).statusCode).toBe(400)
  })
  it('logs in; wrong password and unknown e-mail give the same error', async () => {
    const { j, register } = await makeApp()
    await register()
    expect((await j('POST', '/api/auth/login', { email: 'a@test.ma', password: 'password123' })).statusCode).toBe(200)
    const bad = await j('POST', '/api/auth/login', { email: 'a@test.ma', password: 'wrongwrong' })
    const unk = await j('POST', '/api/auth/login', { email: 'zzz@test.ma', password: 'wrongwrong' })
    expect(bad.statusCode).toBe(401); expect(unk.statusCode).toBe(401)
    expect(bad.json()).toEqual(unk.json())
  })
  it('protects /me and rejects tampered tokens', async () => {
    const { j, register } = await makeApp()
    const { token } = await register()
    expect((await j('GET', '/api/auth/me')).statusCode).toBe(401)
    expect((await j('GET', '/api/auth/me', undefined, token)).statusCode).toBe(200)
    expect((await j('GET', '/api/auth/me', undefined, token.slice(0, -3) + 'abc')).statusCode).toBe(401)
  })
  it('logout invalidates the token', async () => {
    const { j, register } = await makeApp()
    const { token } = await register()
    expect((await j('POST', '/api/auth/logout', undefined, token)).statusCode).toBe(200)
    expect((await j('GET', '/api/auth/me', undefined, token)).statusCode).toBe(401)
  })
  it('disabled accounts cannot log in or use old tokens', async () => {
    const { j, register, store } = await makeApp()
    const { token, user } = await register()
    await store.updateUser(user.id, { isActive: false })
    expect((await j('GET', '/api/auth/me', undefined, token)).statusCode).toBe(403)
    expect((await j('POST', '/api/auth/login', { email: 'a@test.ma', password: 'password123' })).statusCode).toBe(403)
  })
  it('profile update and password change (needs current password, rotates token)', async () => {
    const { j, register } = await makeApp()
    const { token } = await register()
    expect((await j('PATCH', '/api/auth/me', { name: 'Ayoub', locale: 'ar' }, token)).json().user.name).toBe('Ayoub')
    expect((await j('PATCH', '/api/auth/me', { newPassword: 'newpassword1' }, token)).statusCode).toBe(401)
    const ok = await j('PATCH', '/api/auth/me', { currentPassword: 'password123', newPassword: 'newpassword1' }, token)
    expect(ok.statusCode).toBe(200)
    expect((await j('GET', '/api/auth/me', undefined, token)).statusCode).toBe(401) // old token revoked
    expect((await j('GET', '/api/auth/me', undefined, ok.json().token)).statusCode).toBe(200)
  })
  it('rate-limits login attempts', async () => {
    const { j } = await makeApp({ limits: { auth: 3 } })
    const codes: number[] = []
    for (let n = 0; n < 5; n++) codes.push((await j('POST', '/api/auth/login', { email: 'a@test.ma', password: 'whatever12' })).statusCode)
    expect(codes).toContain(429)
  })
  it('refuses to start in production without a strong JWT_SECRET', async () => {
    const { loadConfig } = await import('../src/config.js')
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'short' } as any)).toThrow()
  })
})
