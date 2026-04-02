/** Environment variable overrides for provider config */
export const ENV_BASE_URL = 'CODEX_BASE_URL'
export const ENV_API_KEY = 'CODEX_API_KEY'
export const ENV_MODEL = 'CODEX_MODEL'
export const ENV_PROVIDER = 'CODEX_PROVIDER'

/** App info */
export const APP_NAME = 'Tikat-Codex'
export const CONFIG_DIR_NAME = '.Tikat-Codex'

/** Default generation settings */
export const DEFAULT_MAX_TOKENS = 8192
export const DEFAULT_TEMPERATURE = undefined // let provider decide

/** Slash commands */
export const SLASH_COMMANDS = [
  '/provider',
  '/model',
  '/clear',
  '/help',
  '/exit',
] as const
