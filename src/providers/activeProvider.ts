import { readSettings, readApiKey } from '../utils/settings/index.js'
import { getPresetById, CUSTOM_PRESET_ID } from './registry.js'
import type { ActiveProvider, ProviderConfig } from './types.js'

const ENV_BASE_URL = process.env['CODEX_BASE_URL']
const ENV_API_KEY  = process.env['CODEX_API_KEY']
const ENV_MODEL    = process.env['CODEX_MODEL']

/**
 * Load the currently configured provider.
 * Environment variables (CODEX_BASE_URL / CODEX_API_KEY / CODEX_MODEL) take priority over settings.
 * Throws a friendly error if no provider is configured.
 */
export function loadActiveProvider(): ActiveProvider {
  // Env-var override — useful for CI / scripting
  if (ENV_BASE_URL && ENV_API_KEY) {
    const config: ProviderConfig = {
      name: 'env',
      baseURL: ENV_BASE_URL,
      apiKey: ENV_API_KEY,
      defaultModel: ENV_MODEL ?? 'gpt-4o',
      supportsTools: true,
      supportsStreaming: true,
    }
    return { presetId: 'custom', config }
  }

  const settings = readSettings()
  const apiKey = readApiKey()

  if (!settings.provider) {
    throw new ProviderNotConfiguredError()
  }

  const { presetId, baseURL, model, name, headers, supportsTools } = settings.provider

  if (!apiKey) {
    throw new ApiKeyMissingError(name)
  }

  const config: ProviderConfig = {
    name,
    baseURL,
    apiKey,
    defaultModel: model,
    headers,
    supportsTools: supportsTools ?? true,
    supportsStreaming: true,
  }

  return { presetId, config }
}

export function isProviderConfigured(): boolean {
  try {
    loadActiveProvider()
    return true
  } catch {
    return false
  }
}

export class ProviderNotConfiguredError extends Error {
  constructor() {
    super(
      'No AI provider configured.\n' +
      'Run: codex /provider set\n' +
      'Or set environment variables: CODEX_BASE_URL, CODEX_API_KEY, CODEX_MODEL',
    )
    this.name = 'ProviderNotConfiguredError'
  }
}

export class ApiKeyMissingError extends Error {
  constructor(providerName: string) {
    super(`API Key for "${providerName}" is not set.\nRun: codex /provider set`)
    this.name = 'ApiKeyMissingError'
  }
}
