import type { ProviderPreset } from './types.js'

/**
 * Built-in provider presets.
 * All use OpenAI-compatible Chat Completions API.
 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    supportsTools: true,
    apiKeyHint: 'Get key at: https://platform.deepseek.com/api_keys',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini'],
    supportsTools: true,
    apiKeyHint: 'Get key at: https://platform.openai.com/api-keys',
  },
  {
    id: 'kimi',
    name: '月之暗面 Kimi',
    baseURL: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    supportsTools: true,
    apiKeyHint: 'Get key at: https://platform.moonshot.cn/console/api-keys',
  },
  {
    id: 'qwen',
    name: '阿里 Qwen (通义千问)',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen2.5-coder-32b-instruct'],
    supportsTools: true,
    apiKeyHint: 'Get key at: https://dashscope.console.aliyun.com/apiKey',
  },
  {
    id: 'glm',
    name: '智谱 GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-plus',
    models: ['glm-4-plus', 'glm-4-air', 'glm-4-flash', 'glm-4-long'],
    supportsTools: true,
    apiKeyHint: 'Get key at: https://open.bigmodel.cn/usercenter/apikeys',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    baseURL: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
    models: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
    supportsTools: true,
    apiKeyHint: 'Get key at: https://console.mistral.ai/api-keys',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-2.5-pro-preview-03-25', 'gemini-1.5-pro'],
    supportsTools: true,
    apiKeyHint: 'Get key at: https://aistudio.google.com/apikey',
  },
  {
    id: 'ollama',
    name: 'Ollama (本地)',
    baseURL: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5-coder:7b',
    models: ['qwen2.5-coder:7b', 'qwen2.5-coder:32b', 'llama3.1:8b', 'deepseek-coder-v2'],
    supportsTools: false,
    apiKeyHint: '本地运行无需 API Key，输入任意字符即可',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (本地)',
    baseURL: 'http://localhost:1234/v1',
    defaultModel: 'local-model',
    models: ['local-model'],
    supportsTools: false,
    apiKeyHint: '本地运行无需 API Key，输入任意字符即可',
  },
]

export const CUSTOM_PRESET_ID = 'custom'

export function getPresetById(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find(p => p.id === id)
}
