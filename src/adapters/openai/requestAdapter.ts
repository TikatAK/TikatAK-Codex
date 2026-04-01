import type OpenAI from 'openai'

/**
 * Convert Anthropic-style tool definitions to OpenAI function/tool format.
 */
export interface AnthropicTool {
  name: string
  description?: string
  input_schema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
    [key: string]: unknown
  }
}

export function convertToolsToOpenAI(
  tools: AnthropicTool[],
): OpenAI.Chat.ChatCompletionTool[] {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description ?? '',
      parameters: tool.input_schema,
    },
  }))
}

/**
 * Convert Anthropic-style messages to OpenAI chat messages.
 * Handles: text, tool_use, tool_result content blocks.
 */
export type AnthropicRole = 'user' | 'assistant'

export interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'image'
  text?: string
  // tool_use
  id?: string
  name?: string
  input?: unknown
  // tool_result
  tool_use_id?: string
  content?: string | AnthropicContentBlock[]
  is_error?: boolean
  // image
  source?: { type: 'base64'; media_type: string; data: string }
}

export interface AnthropicMessage {
  role: AnthropicRole
  content: string | AnthropicContentBlock[]
}

export function convertMessagesToOpenAI(
  messages: AnthropicMessage[],
  systemPrompt?: string,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const result: OpenAI.Chat.ChatCompletionMessageParam[] = []

  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt })
  }

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      result.push({ role: msg.role, content: msg.content })
      continue
    }

    // Separate tool results from regular content (OpenAI requires tool messages separately)
    const toolResults: AnthropicContentBlock[] = []
    const regularBlocks: AnthropicContentBlock[] = []

    for (const block of msg.content) {
      if (block.type === 'tool_result') {
        toolResults.push(block)
      } else {
        regularBlocks.push(block)
      }
    }

    // Add regular content as user/assistant message
    if (regularBlocks.length > 0) {
      if (msg.role === 'assistant') {
        // Build assistant message with optional tool_calls
        const textBlocks = regularBlocks.filter(b => b.type === 'text')
        const toolUseBlocks = regularBlocks.filter(b => b.type === 'tool_use')

        const assistantMsg: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
          role: 'assistant',
          content: textBlocks.map(b => b.text ?? '').join('') || null,
        }

        if (toolUseBlocks.length > 0) {
          let callCounter = 0
          assistantMsg.tool_calls = toolUseBlocks.map(b => ({
            id: b.id ?? `call_${b.name ?? 'tool'}_${Date.now()}_${callCounter++}`,
            type: 'function' as const,
            function: {
              name: b.name ?? '',
              arguments: JSON.stringify(b.input ?? {}),
            },
          }))
        }

        result.push(assistantMsg)
      } else {
        // User message — convert image blocks if present
        const hasImages = regularBlocks.some(b => b.type === 'image')
        if (hasImages) {
          const parts: OpenAI.Chat.ChatCompletionContentPart[] = regularBlocks
            .filter(b => b.type === 'text' || b.type === 'image')
            .map(b => {
              if (b.type === 'image' && b.source) {
                return {
                  type: 'image_url' as const,
                  image_url: {
                    url: `data:${b.source.media_type};base64,${b.source.data}`,
                  },
                }
              }
              return { type: 'text' as const, text: b.text ?? '' }
            })
          result.push({ role: 'user', content: parts })
        } else {
          const text = regularBlocks.map(b => b.text ?? '').join('')
          result.push({ role: 'user', content: text })
        }
      }
    }

    // Add tool results as separate tool messages
    for (const tr of toolResults) {
      const toolContent =
        typeof tr.content === 'string'
          ? tr.content
          : Array.isArray(tr.content)
            ? tr.content.map(b => (typeof b === 'object' && 'text' in b ? b.text : '')).join('')
            : ''

      result.push({
        role: 'tool',
        tool_call_id: tr.tool_use_id ?? '',
        content: tr.is_error ? `[Error] ${toolContent}` : toolContent,
      })
    }
  }

  return result
}
