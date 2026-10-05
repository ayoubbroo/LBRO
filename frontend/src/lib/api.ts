const TOKEN_KEY = 'tm-token'
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } }
export const setToken = (t: string | null) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch { /* storage unavailable */ } }
export const deviceId = () => {
  try { let d = localStorage.getItem('tm-device'); if (!d) { d = crypto.randomUUID(); localStorage.setItem('tm-device', d) } return d } catch { return 'anon' }
}

/** Error carrying the API's stable code; the UI translates it (never shows raw server text). */
export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code) }
  get network() { return this.status === 0 }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { 'x-device-id': deviceId() }
  if (opts.body !== undefined) headers['content-type'] = 'application/json'
  const tok = getToken()
  if (tok) headers.authorization = 'Bearer ' + tok
  let r: Response
  try { r = await fetch('/api' + path, { method: opts.method ?? 'GET', headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined }) }
  catch { throw new ApiError(0, 'network_error') }
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    if (r.status === 401 && tok && (j?.error === 'invalid_token' || j?.error === 'unauthorized')) window.dispatchEvent(new Event('tm-unauthorized'))
    throw new ApiError(r.status, j?.error || 'unknown_error')
  }
  return j as T
}

/** Upload with progress (fetch has no upload progress; XHR does). */
export function uploadPhoto(incidentId: string, file: File, onProgress: (pct: number) => void): Promise<{ id: string; url: string }> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open('POST', `/api/incidents/${incidentId}/photos`)
    const tok = getToken(); if (tok) x.setRequestHeader('authorization', 'Bearer ' + tok)
    x.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
    x.onload = () => {
      let j: any = {}; try { j = JSON.parse(x.responseText) } catch { /* not json */ }
      x.status >= 200 && x.status < 300 ? resolve(j) : reject(new ApiError(x.status, j?.error || 'unknown_error'))
    }
    x.onerror = () => reject(new ApiError(0, 'network_error'))
    const fd = new FormData(); fd.append('file', file)
    x.send(fd)
  })
}
