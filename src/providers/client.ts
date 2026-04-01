import OpenAI from 'openai'
import type { ProviderConfig } from './types.js'

let _client: OpenAI | null = null
let _currentConfig: ProviderConfig | null = null

/**
 * Get or create the OpenAI-compatible client for the active provider.
 * Re-creates if config has changed.
 */
export function getProviderClient(config: ProviderConfig): OpenAI {
  if (!config.apiKey) throw new Error('API Key 未配置，请先通过设置界面配置 API Key')
  if (!config.baseURL) throw new Error('Provider Base URL 未配置，请检查 Provider 设置')

  const configKey = `${config.baseURL}::${config.apiKey}`
  const currentKey = _currentConfig
    ? `${_currentConfig.baseURL}::${_currentConfig.apiKey}`
    : null

  if (!_client || configKey !== currentKey) {
    _client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      defaultHeaders: config.headers ?? {},
      maxRetries: 3,
      timeout: 120_000,
    })
    _currentConfig = config
  }

  return _client
}

/**
 * Test connectivity to a provider by sending a minimal request.
 * Returns { ok: true } or { ok: false, error: string }
 */
export async function testProviderConnection(
  config: ProviderConfig,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      defaultHeaders: config.headers ?? {},
      maxRetries: 0,
      timeout: 15_000,
    })

    await client.chat.completions.create({
      model: config.defaultModel,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 5,
      stream: false,
    })

    return { ok: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('401') || message.includes('Unauthorized') || message.includes('invalid_api_key')) {
      return { ok: false, error: 'API Key 无效，请检查密钥是否正确' }
    }
    if (message.includes('404') || message.includes('model_not_found')) {
      return { ok: false, error: `模型 "${config.defaultModel}" 不存在，请检查模型 ID` }
    }
    if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
      return { ok: false, error: `无法连接到 ${config.baseURL}，请检查网络或地址` }
    }
    if (message.includes('429') || message.includes('rate_limit')) {
      return { ok: true } // rate limited = key works
    }
    return { ok: false, error: message }
  }
}

/** Reset the cached client (e.g. after config change) */
export function resetProviderClient(): void {
  _client = null
  _currentConfig = null
}
