import type { Config } from '../config.js'

export interface AiProvider { readonly name: string; readonly available: boolean; complete(system: string, user: string): Promise<string> }

export class NoAiProvider implements AiProvider {
  readonly name = 'none'
  readonly available = false
  async complete(): Promise<string> { throw new Error('AI disabled') }
}

/** Anthropic Messages API adapter. Model name must be supplied via AI_MODEL (no default is assumed). */
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic'
  readonly available = true
  constructor(private key: string, private model: string, private f: typeof fetch = fetch) {}
  async complete(system: string, user: string) {
    const r = await this.f('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: this.model, max_tokens: 500, system, messages: [{ role: 'user', content: user }] }),
    })
    if (!r.ok) throw new Error('ai http ' + r.status)
    const j: any = await r.json()
    return (j.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n').trim()
  }
}

export function createAiProvider(cfg: Pick<Config, 'aiProvider' | 'aiApiKey' | 'aiModel'>): AiProvider {
  if (cfg.aiProvider === 'anthropic' && cfg.aiApiKey && cfg.aiModel) return new AnthropicProvider(cfg.aiApiKey, cfg.aiModel)
  return new NoAiProvider() // 'none', unknown name, or missing key/model
}

export const AI_SYSTEM_PROMPT = [
  'You summarise road conditions for Moroccan drivers.',
  'Use ONLY the JSON facts provided. Never add, estimate or guess traffic conditions, speeds, delays, causes or durations.',
  'Facts labelled "application_reports" are unverified-or-community-confirmed driver reports, not live traffic. Say so.',
  'If a field is missing or empty, say that no reliable data is available for it.',
  'Reply in the requested language, in at most 5 short sentences, no speculation.',
].join(' ')
