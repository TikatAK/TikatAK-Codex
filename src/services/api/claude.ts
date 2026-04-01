import type OpenAI from 'openai'
import { getProviderClient } from '../../providers/client.js'
import { loadActiveProvider } from '../../providers/activeProvider.js'
import {
  convertMessagesToOpenAI,
  convertToolsToOpenAI,
  convertResponseToAnthropic,
  streamOpenAIToAnthropic,
} from '../../adapters/openai/index.js'
import type {
  AnthropicMessage,
  AnthropicTool,
  AnthropicResponse,
  StreamEvent,
} from '../../adapters/openai/index.js'
import { TOOL_SCHEMAS } from '../../tools/index.js'
import { withRetry } from './withRetry.js'

export interface SendMessageOptions {
  messages: AnthropicMessage[]
  system?: string
  tools?: AnthropicTool[]
  model?: string
  maxTokens?: number
  stream?: boolean
  temperature?: number
  /** If true, automatically inject all built-in tools (default: true) */
  useBuiltinTools?: boolean
}

/**
 * Send a message using the active provider and return a full response.
 */
export async function sendMessage(opts: SendMessageOptions): Promise<AnthropicResponse> {
  const provider = loadActiveProvider()
  const client = getProviderClient(provider.config)
  const model = opts.model ?? provider.config.defaultModel

  const openaiMessages = convertMessagesToOpenAI(opts.messages, opts.system)
  const builtinTools = opts.useBuiltinTools !== false ? (TOOL_SCHEMAS as unknown as AnthropicTool[]) : []
  const allTools = [...builtinTools, ...(opts.tools ?? [])]
  const tools = allTools.length > 0 ? convertToolsToOpenAI(allTools) : undefined

  const request: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
    model,
    messages: openaiMessages,
    max_tokens: opts.maxTokens ?? 8192,
    stream: false,
    ...(tools ? { tools, tool_choice: 'auto' } : {}),
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
  }

  const response = await withRetry(() => client.chat.completions.create(request))
  return convertResponseToAnthropic(response)
}

/**
 * Send a message with streaming, yielding Anthropic-compatible stream events.
 */
export async function* sendMessageStream(
  opts: SendMessageOptions,
): AsyncGenerator<StreamEvent> {
  const provider = loadActiveProvider()
  const client = getProviderClient(provider.config)
  const model = opts.model ?? provider.config.defaultModel

  const openaiMessages = convertMessagesToOpenAI(opts.messages, opts.system)
  const builtinTools2 = opts.useBuiltinTools !== false ? (TOOL_SCHEMAS as unknown as AnthropicTool[]) : []
  const allTools2 = [...builtinTools2, ...(opts.tools ?? [])]
  const tools = allTools2.length > 0 ? convertToolsToOpenAI(allTools2) : undefined

  const request: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
    model,
    messages: openaiMessages,
    max_tokens: opts.maxTokens ?? 8192,
    stream: true,
    stream_options: { include_usage: true },
    ...(tools ? { tools, tool_choice: 'auto' } : {}),
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
  }

  const stream = await client.chat.completions.create(request)
  yield* streamOpenAIToAnthropic(stream)
}
