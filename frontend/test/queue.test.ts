import { describe, it, expect, beforeEach } from 'vitest'
import { _setStorage, enqueue, readQueue, syncQueue, type KV } from '../src/lib/queue'

const mk = (): KV & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) } }
const R = { type: 'accident', latitude: 33.9, longitude: -5.5, description: '' }
const perm = (e: unknown) => (e as any)?.status === 400
beforeEach(() => _setStorage(mk()))

describe('offline report queue', () => {
  it('assigns a unique clientId per report and never stores the same one twice', () => {
    const a = enqueue(R), b = enqueue(R)
    expect(a.clientId).not.toBe(b.clientId)
    enqueue({ ...R, clientId: a.clientId })
    expect(readQueue()).toHaveLength(2)
  })
  it('syncs every item once and empties the queue', async () => {
    enqueue(R); enqueue(R)
    const sent: string[] = []
    const r = await syncQueue(async q => { sent.push(q.clientId) }, perm)
    expect(r).toEqual({ sent: 2, left: 0 }); expect(new Set(sent).size).toBe(2); expect(readQueue()).toHaveLength(0)
  })
  it('concurrent syncs share one run: no duplicate sends', async () => {
    enqueue(R); enqueue(R)
    let calls = 0
    const send = async () => { calls++; await new Promise(r => setTimeout(r, 10)) }
    const [a, b, c] = await Promise.all([syncQueue(send, perm), syncQueue(send, perm), syncQueue(send, perm)])
    expect(calls).toBe(2); expect(a).toBe(b); expect(b).toBe(c)
  })
  it('keeps items on network/5xx errors, drops them on permanent 4xx errors', async () => {
    enqueue({ ...R, description: 'net' }); enqueue({ ...R, description: 'bad' }); enqueue({ ...R, description: 'ok' })
    const r = await syncQueue(async q => { if (q.description === 'net') throw Object.assign(new Error('x'), { status: 0 }); if (q.description === 'bad') throw Object.assign(new Error('x'), { status: 400 }) }, perm)
    expect(r).toEqual({ sent: 1, left: 1 })
    expect(readQueue().map(q => q.description)).toEqual(['net'])
  })
  it('a report enqueued during a sync is preserved', async () => {
    enqueue({ ...R, description: 'first' })
    const r = await syncQueue(async q => { if (q.description === 'first') enqueue({ ...R, description: 'late' }) }, perm)
    expect(r.sent).toBe(1)
    expect(readQueue().map(q => q.description)).toEqual(['late'])
  })
  it('survives corrupted storage', () => {
    const s = mk(); s.setItem('tm-queue-v2', '{not json'); _setStorage(s)
    expect(readQueue()).toEqual([]); expect(() => enqueue(R)).not.toThrow(); expect(readQueue()).toHaveLength(1)
  })
  it('a later sync can run after the previous one finished', async () => {
    enqueue(R); await syncQueue(async () => {}, perm)
    enqueue(R); expect((await syncQueue(async () => {}, perm)).sent).toBe(1)
  })
})
