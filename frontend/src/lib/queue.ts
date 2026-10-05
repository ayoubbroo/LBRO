// Offline report queue. Every report gets a client-generated UUID (`clientId`) that the
// server treats as an idempotency key, so retries or a double sync can never create duplicates.
export interface QueuedReport { clientId: string; type: string; latitude: number; longitude: number; description: string; queuedAt: number }
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
const KEY = 'tm-queue-v2'
const memKV = (): KV => { const m = new Map<string, string>(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) } }
let kv: KV = typeof localStorage !== 'undefined' ? localStorage : memKV()
export const _setStorage = (s: KV) => { kv = s } // test hook

export const readQueue = (): QueuedReport[] => { try { return JSON.parse(kv.getItem(KEY) || '[]') } catch { return [] } }
const write = (q: QueuedReport[]) => { try { kv.setItem(KEY, JSON.stringify(q)) } catch { /* quota exceeded: keep working in memory-less mode */ } }
const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16) }))

export function enqueue(r: Omit<QueuedReport, 'clientId' | 'queuedAt'> & { clientId?: string }): QueuedReport {
  const item: QueuedReport = { ...r, clientId: r.clientId ?? uuid(), queuedAt: Date.now() }
  const q = readQueue()
  if (!q.some(x => x.clientId === item.clientId)) write([...q, item])
  return item
}

let running: Promise<{ sent: number; left: number }> | null = null

/**
 * Sends queued reports one by one. Concurrent callers share a single run (no double sync).
 * Permanent failures (4xx) drop the item; network/5xx failures keep it for the next attempt.
 * Items enqueued while a sync is running are preserved.
 */
export function syncQueue(send: (r: QueuedReport) => Promise<void>, isPermanentFailure: (e: unknown) => boolean) {
  if (running) return running
  running = (async () => {
    const done = new Set<string>()
    let sent = 0
    for (const r of readQueue()) {
      try { await send(r); sent++; done.add(r.clientId) } catch (e) { if (isPermanentFailure(e)) done.add(r.clientId) }
    }
    const left = readQueue().filter(x => !done.has(x.clientId))
    write(left)
    return { sent, left: left.length }
  })().finally(() => { running = null })
  return running
}
