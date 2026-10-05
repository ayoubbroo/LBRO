// Upload validation: never trust the client-declared MIME type — sniff the magic bytes.
export const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const
export type ImageMime = (typeof ALLOWED_MIME)[number]
export const EXT: Record<ImageMime, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export function sniffImage(buf: Buffer): ImageMime | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return null
}

export type UploadCheck = { ok: true; mime: ImageMime } | { ok: false; code: 'file_empty' | 'file_too_large' | 'unsupported_type' | 'type_mismatch' }

export function validateImage(buf: Buffer, declaredMime: string, maxBytes: number): UploadCheck {
  if (buf.length === 0) return { ok: false, code: 'file_empty' }
  if (buf.length > maxBytes) return { ok: false, code: 'file_too_large' }
  if (!(ALLOWED_MIME as readonly string[]).includes(declaredMime === 'image/jpg' ? 'image/jpeg' : declaredMime)) return { ok: false, code: 'unsupported_type' }
  const real = sniffImage(buf)
  if (!real) return { ok: false, code: 'unsupported_type' }
  const declared = declaredMime === 'image/jpg' ? 'image/jpeg' : declaredMime
  if (real !== declared) return { ok: false, code: 'type_mismatch' }
  return { ok: true, mime: real }
}

/** Removes APP1 (EXIF/XMP — may contain GPS) and COM segments from a JPEG. Other formats are returned untouched. */
export function stripJpegMetadata(buf: Buffer): Buffer {
  if (sniffImage(buf) !== 'image/jpeg') return buf
  const out: Buffer[] = [buf.subarray(0, 2)]
  let i = 2
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) break
    const marker = buf[i + 1]
    if (marker === 0xda) { out.push(buf.subarray(i)); return Buffer.concat(out) } // start of scan: copy the rest as-is
    if (marker === 0xd9) { out.push(buf.subarray(i)); return Buffer.concat(out) }
    const len = buf.readUInt16BE(i + 2)
    if (len < 2 || i + 2 + len > buf.length) return buf // malformed: keep original rather than corrupt it
    if (marker !== 0xe1 && marker !== 0xfe) out.push(buf.subarray(i, i + 2 + len))
    i += 2 + len
  }
  return buf
}
