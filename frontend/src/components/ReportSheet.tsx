import { useState } from 'react'
import { useI18n } from '../i18n'
import { useApp } from '../lib/app'
import { useAuth } from '../lib/auth'
import { INCIDENT_TYPES } from '../lib/constants'
import { getPosition } from '../lib/geo'
import { uploadPhoto } from '../lib/api'
import PhotoPicker, { type PickedPhoto } from './PhotoPicker'
import { Notice, Sheet } from './ui'

export default function ReportSheet({ pin, onClose, onDone }: { pin: { lat: number; lng: number } | null; onClose(): void; onDone(): void }) {
  const { t, err } = useI18n()
  const { submitReport, flash, online } = useApp()
  const { user } = useAuth()
  const [type, setType] = useState<string>('accident')
  const [desc, setDesc] = useState('')
  const [photos, setPhotos] = useState<PickedPhoto[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function submit() {
    setMsg(''); setBusy(true)
    try {
      let p = pin
      if (!p) { try { p = await getPosition() } catch { setMsg(t('report_need_location')); return } }
      const r = await submitReport({ type, latitude: p.lat, longitude: p.lng, description: desc.trim() })
      if (r.queued) { flash(t('report_queued')); onDone(); return }
      // Photos are attached after the report exists (needs the incident id, a signed-in owner, and a connection).
      const pending = photos.filter(x => x.state === 'ready')
      if (pending.length && r.id && user && !r.duplicate) {
        let failed = 0
        for (const ph of pending) {
          setPhotos(cur => cur.map(c => c.url === ph.url ? { ...c, state: 'uploading', progress: 0 } : c))
          try { await uploadPhoto(r.id, ph.file, pct => setPhotos(cur => cur.map(c => c.url === ph.url ? { ...c, progress: pct } : c))); setPhotos(cur => cur.map(c => c.url === ph.url ? { ...c, state: 'done', progress: 100 } : c)) }
          catch (e) { failed++; setPhotos(cur => cur.map(c => c.url === ph.url ? { ...c, state: 'error', error: err(e) } : c)) }
        }
        if (failed) { setMsg(t('photo_upload_partial', { n: failed })); flash(t('report_sent')); return } // stay open so the user sees which photos failed
      }
      flash(r.duplicate ? t('report_duplicate') : t('report_sent'))
      onDone()
    } catch (e) { setMsg(err(e)) } finally { setBusy(false) }
  }

  return (
    <Sheet title={t('report_title')} onClose={onClose}>
      <p className="muted">{pin ? t('report_pin_set') : t('report_use_location')}</p>
      <div className="types" role="radiogroup" aria-label={t('report_type')}>
        {INCIDENT_TYPES.map(([k, e]) => (
          <button key={k} type="button" role="radio" aria-checked={type === k} className={'type' + (type === k ? ' on' : '')} onClick={() => setType(k)}><span>{e}</span><small>{t(('type_' + k) as any)}</small></button>
        ))}
      </div>
      <textarea value={desc} maxLength={500} onChange={e => setDesc(e.target.value)} placeholder={t('report_desc')} aria-label={t('report_desc')} rows={2} />
      {user
        ? (online ? <PhotoPicker photos={photos} onChange={setPhotos} disabled={busy} /> : <Notice tone="warn">{t('photo_offline_note')}</Notice>)
        : <Notice>{t('photo_login_note')}</Notice>}
      {msg && <Notice tone="error">{msg}</Notice>}
      <button className="btn primary full" disabled={busy} onClick={submit}>{busy ? t('sending') : t('submit')}</button>
    </Sheet>
  )
}
