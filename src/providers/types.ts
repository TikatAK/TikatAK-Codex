/**
 * Provider configuration types for TikatAK-Codex.
 * Supports any OpenAI-compatible API endpoint.
 */

export interface ProviderConfig {
  /** Human-readable name shown in UI */
  name: string
  /** Base URL of the OpenAI-compatible API (e.g. https://api.deepseek.com/v1) */
  baseURL: string
  /** API key for authentication */
  apiKey: string
  /** Default model ID to use with this provider */
  defaultModel: string
  /** Optional additional HTTP headers */
  headers?: Record<string, string>
  /** Whether this provider supports tool/function calling */
  supportsTools?: boolean
  /** Whether this provider supports streaming */
  supportsStreaming?: boolean
}

export interface ProviderPreset {
  id: string
  name: string
  baseURL: string
  defaultModel: string
  models: string[]
  supportsTools: boolean
  apiKeyHint?: string
}

export interface ActiveProvider {
  presetId: string | 'custom'
  config: ProviderConfig
}

export interface StoredProviderSettings {
  presetId: string | 'custom'
  baseURL: string
  model: string
  name: string
  headers?: Record<string, string>
  supportsTools?: boolean
}
