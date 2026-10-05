import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { ALLOWED_PHOTO, MAX_PHOTO_BYTES } from '../lib/constants'

export interface PickedPhoto { file: File; url: string; progress: number; state: 'ready' | 'uploading' | 'done' | 'error'; error?: string }

/** Camera + gallery capture with validation and previews. Upload itself is driven by the parent (it needs the incident id). */
export default function PhotoPicker({ photos, onChange, max = 4, disabled }: { photos: PickedPhoto[]; onChange(p: PickedPhoto[]): void; max?: number; disabled?: boolean }) {
  const { t } = useI18n()
  const cam = useRef<HTMLInputElement>(null), gal = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState('')
  const live = useRef(photos); live.current = photos
  useEffect(() => () => live.current.forEach(p => URL.revokeObjectURL(p.url)), [])

  function add(files: FileList | null) {
    setErr('')
    if (!files) return
    const next = [...photos]
    for (const f of Array.from(files)) {
      if (next.length >= max) { setErr(t('photo_too_many', { n: max })); break }
      if (!ALLOWED_PHOTO.includes(f.type)) { setErr(t('photo_bad_type')); continue }
      if (f.size > MAX_PHOTO_BYTES) { setErr(t('photo_too_big', { mb: MAX_PHOTO_BYTES / 1024 / 1024 })); continue }
      next.push({ file: f, url: URL.createObjectURL(f), progress: 0, state: 'ready' })
    }
    onChange(next)
    if (cam.current) cam.current.value = ''; if (gal.current) gal.current.value = ''
  }
  const remove = (i: number) => { URL.revokeObjectURL(photos[i].url); onChange(photos.filter((_, j) => j !== i)) }

  return (
    <div>
      <div className="row">
        <button type="button" className="btn ghost" disabled={disabled || photos.length >= max} onClick={() => cam.current?.click()}>📷 {t('photo_camera')}</button>
        <button type="button" className="btn ghost" disabled={disabled || photos.length >= max} onClick={() => gal.current?.click()}>🖼️ {t('photo_gallery')}</button>
      </div>
      <input ref={cam} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={e => add(e.target.files)} />
      <input ref={gal} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => add(e.target.files)} />
      {err && <p className="err">{err}</p>}
      <div className="thumbs">
        {photos.map((p, i) => (
          <div className="thumb" key={p.url}>
            <img src={p.url} alt="" />
            {p.state === 'ready' && !disabled && <button type="button" className="x" onClick={() => remove(i)} aria-label={t('remove')}>✕</button>}
            {p.state === 'uploading' && <div className="bar"><i style={{ width: p.progress + '%' }} /></div>}
            {p.state === 'done' && <span className="ok">✓</span>}
            {p.state === 'error' && <span className="bad" title={p.error}>!</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
