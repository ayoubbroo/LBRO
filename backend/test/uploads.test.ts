import { describe, it, expect } from 'vitest'
import { makeApp, multipart, JPEG, PNG, WEBP, MEKNES } from './helpers.js'
import { sniffImage, validateImage, stripJpegMetadata } from '../src/upload.js'
import { LocalStorage } from '../src/storage.js'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function setup(env: Record<string, string> = {}) {
  const t = await makeApp({ env })
  const o = await t.register('o@test.ma')
  const id = (await t.j('POST', '/api/incidents', { type: 'accident', ...MEKNES }, o.token)).json().id as string
  const up = (name: string, mime: string, data: Buffer, token?: string, incident = id) => {
    const m = multipart(name, mime, data)
    return t.app.inject({ method: 'POST', url: `/api/incidents/${incident}/photos`, payload: m.body, headers: { ...m.headers, ...(token ? { authorization: 'Bearer ' + token } : {}) } })
  }
  return { ...t, o, id, up }
}

describe('photo uploads', () => {
  it('accepts JPEG, PNG and WebP and associates them with the incident', async () => {
    const s = await setup()
    for (const [n, m, d] of [['a.jpg', 'image/jpeg', JPEG], ['b.png', 'image/png', PNG], ['c.webp', 'image/webp', WEBP]] as const) {
      const r = await s.up(n, m, d, s.o.token)
      expect(r.statusCode).toBe(201)
    }
    const inc = (await s.j('GET', `/api/incidents/${s.id}`)).json()
    expect(inc.photos).toHaveLength(3)
    const img = await s.j('GET', inc.photos[0].url)
    expect(img.statusCode).toBe(200); expect(img.headers['content-type']).toBe('image/jpeg')
    expect(img.headers['x-content-type-options']).toBe('nosniff')
  })
  it('requires authentication and ownership (or admin)', async () => {
    const s = await setup()
    expect((await s.up('a.jpg', 'image/jpeg', JPEG)).statusCode).toBe(401)
    const other = await s.register('x@test.ma')
    expect((await s.up('a.jpg', 'image/jpeg', JPEG, other.token)).statusCode).toBe(403)
    const adm = await s.admin()
    expect((await s.up('a.jpg', 'image/jpeg', JPEG, adm.token)).statusCode).toBe(201)
  })
  it('rejects unsupported MIME types (gif, pdf, svg, html)', async () => {
    const s = await setup()
    for (const [n, m] of [['a.gif', 'image/gif'], ['a.pdf', 'application/pdf'], ['a.svg', 'image/svg+xml'], ['a.html', 'text/html']]) {
      expect((await s.up(n, m, Buffer.from('GIF89a....'), s.o.token)).statusCode).toBe(400)
    }
  })
  it('rejects a file whose bytes do not match the declared type (e.g. script renamed .jpg)', async () => {
    const s = await setup()
    const r = await s.up('evil.jpg', 'image/jpeg', Buffer.from('<script>alert(1)</script>'), s.o.token)
    expect(r.statusCode).toBe(400)
    const mism = await s.up('a.png', 'image/png', JPEG, s.o.token)
    expect(mism.statusCode).toBe(400); expect(mism.json().error).toBe('type_mismatch')
  })
  it('rejects empty and oversized files', async () => {
    const s = await setup({ MAX_UPLOAD_MB: '1' })
    expect((await s.up('a.jpg', 'image/jpeg', Buffer.alloc(0), s.o.token)).statusCode).toBe(400)
    const big = Buffer.concat([JPEG, Buffer.alloc(1.2 * 1024 * 1024)])
    const r = await s.up('big.jpg', 'image/jpeg', big, s.o.token)
    expect(r.statusCode).toBe(413); expect(r.json().error).toBe('file_too_large')
  })
  it('limits photos per incident', async () => {
    const s = await setup({ MAX_PHOTOS_PER_INCIDENT: '2' })
    await s.up('a.jpg', 'image/jpeg', JPEG, s.o.token); await s.up('a.jpg', 'image/jpeg', JPEG, s.o.token)
    const r = await s.up('a.jpg', 'image/jpeg', JPEG, s.o.token)
    expect(r.statusCode).toBe(400); expect(r.json().error).toBe('too_many_photos')
  })
  it('uses server-generated storage keys, never the client filename', async () => {
    const s = await setup()
    await s.up('../../etc/passwd.jpg', 'image/jpeg', JPEG, s.o.token)
    const keys = [...s.storage.files.keys()]
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatch(/^incidents\/[^/]+\/[0-9a-f-]{36}\.jpg$/)
  })
  it('deleting an incident deletes its stored photos', async () => {
    const s = await setup()
    const adm = await s.admin()
    await s.up('a.jpg', 'image/jpeg', JPEG, s.o.token)
    expect(s.storage.files.size).toBe(1)
    expect((await s.j('DELETE', `/api/admin/incidents/${s.id}`, undefined, adm.token)).statusCode).toBe(200)
    expect(s.storage.files.size).toBe(0)
  })
})

describe('upload helpers', () => {
  it('sniffs magic bytes', () => { expect(sniffImage(JPEG)).toBe('image/jpeg'); expect(sniffImage(PNG)).toBe('image/png'); expect(sniffImage(WEBP)).toBe('image/webp'); expect(sniffImage(Buffer.from('hello'))).toBeNull() })
  it('validateImage covers every branch', () => {
    expect(validateImage(JPEG, 'image/jpeg', 1000)).toEqual({ ok: true, mime: 'image/jpeg' })
    expect(validateImage(JPEG, 'image/jpg', 1000).ok).toBe(true)
    expect(validateImage(JPEG, 'image/jpeg', 10)).toEqual({ ok: false, code: 'file_too_large' })
  })
  it('strips EXIF (APP1) from JPEG and keeps the image data', () => {
    const exif = Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, 0x0b]), Buffer.from('Exif\0\0GPS')])
    const withExif = Buffer.concat([Buffer.from([0xff, 0xd8]), exif, Buffer.from([0xff, 0xdb, 0x00, 0x04, 0x01, 0x02]), Buffer.from([0xff, 0xda, 0x00, 0x02, 0xaa, 0xff, 0xd9])])
    const out = stripJpegMetadata(withExif)
    expect(out.includes(Buffer.from('Exif'))).toBe(false)
    expect(out.length).toBe(withExif.length - exif.length)
    expect(sniffImage(out)).toBe('image/jpeg')
    expect(stripJpegMetadata(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]))).toBeTruthy() // malformed: no throw
  })
  it('LocalStorage round-trips and blocks path traversal', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tm-'))
    const st = new LocalStorage(dir)
    await st.put('incidents/1/a.jpg', Buffer.from('hi'))
    expect((await st.get('incidents/1/a.jpg'))!.data.toString()).toBe('hi')
    await expect(st.put('../escape.txt', Buffer.from('x'))).rejects.toThrow()
    await st.delete('incidents/1/a.jpg'); expect(await st.get('incidents/1/a.jpg')).toBeNull()
    await expect(readFile(join(dir, '..', 'escape.txt'))).rejects.toThrow()
  })
})
