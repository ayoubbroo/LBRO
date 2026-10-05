import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import type { Config } from './config.js'

/** Storage abstraction: local disk for dev, S3-compatible (AWS S3, Cloudflare R2, MinIO) for production. */
export interface StorageProvider {
  readonly name: string
  put(key: string, data: Buffer, contentType: string): Promise<void>
  get(key: string): Promise<{ data: Buffer; contentType?: string } | null>
  delete(key: string): Promise<void>
}

export class LocalStorage implements StorageProvider {
  readonly name = 'local'
  private root: string
  constructor(dir: string) { this.root = resolve(dir) }
  private path(key: string) {
    const p = resolve(this.root, key)
    if (p !== this.root && !p.startsWith(this.root + sep)) throw new Error('invalid storage key') // path traversal guard
    return p
  }
  async put(key: string, data: Buffer) { const p = this.path(key); await mkdir(dirname(p), { recursive: true }); await writeFile(p, data) }
  async get(key: string) { try { return { data: await readFile(this.path(key)) } } catch { return null } }
  async delete(key: string) { await rm(this.path(key), { force: true }) }
}

export class MemoryStorage implements StorageProvider {
  readonly name = 'memory'
  files = new Map<string, { data: Buffer; contentType: string }>()
  async put(key: string, data: Buffer, contentType: string) { this.files.set(key, { data, contentType }) }
  async get(key: string) { return this.files.get(key) ?? null }
  async delete(key: string) { this.files.delete(key) }
}

export class S3Storage implements StorageProvider {
  readonly name = 's3'
  private client: any
  private mods: any
  constructor(private cfg: Config) {}
  private async init() {
    if (!this.client) {
      this.mods = await import('@aws-sdk/client-s3')
      this.client = new this.mods.S3Client({
        region: this.cfg.storageRegion,
        ...(this.cfg.storageEndpoint ? { endpoint: this.cfg.storageEndpoint } : {}), // Cloudflare R2: https://<account>.r2.cloudflarestorage.com
        credentials: { accessKeyId: this.cfg.storageAccessKey, secretAccessKey: this.cfg.storageSecretKey },
      })
    }
  }
  async put(key: string, data: Buffer, contentType: string) {
    await this.init()
    await this.client.send(new this.mods.PutObjectCommand({ Bucket: this.cfg.storageBucket, Key: key, Body: data, ContentType: contentType }))
  }
  async get(key: string) {
    await this.init()
    try {
      const r = await this.client.send(new this.mods.GetObjectCommand({ Bucket: this.cfg.storageBucket, Key: key }))
      return { data: Buffer.from(await r.Body.transformToByteArray()), contentType: r.ContentType as string | undefined }
    } catch { return null }
  }
  async delete(key: string) {
    await this.init()
    await this.client.send(new this.mods.DeleteObjectCommand({ Bucket: this.cfg.storageBucket, Key: key }))
  }
}

export function createStorage(cfg: Config): StorageProvider {
  if (cfg.storageProvider === 's3' || cfg.storageProvider === 'r2') {
    if (!cfg.storageBucket || !cfg.storageAccessKey || !cfg.storageSecretKey) {
      throw new Error('STORAGE_PROVIDER=s3|r2 requires STORAGE_BUCKET, STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY')
    }
    return new S3Storage(cfg)
  }
  return new LocalStorage(cfg.storageLocalDir)
}
