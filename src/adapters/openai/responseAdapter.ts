import type OpenAI from 'openai'

/**
 * Anthropic-style response types (what the rest of the app expects).
 */
export interface AnthropicUsage {
  input_tokens: number
  output_tokens: number
}

export interface AnthropicTextBlock {
  type: 'text'
  text: string
}

export interface AnthropicToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}

export type AnthropicBlock = AnthropicTextBlock | AnthropicToolUseBlock

export interface AnthropicResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: AnthropicBlock[]
  model: string
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'
  stop_sequence: string | null
  usage: AnthropicUsage
}

/**
 * Convert a completed OpenAI response to Anthropic message format.
 */
export function convertResponseToAnthropic(
  response: OpenAI.Chat.ChatCompletion,
): AnthropicResponse {
  const choice = response.choices[0]
  if (!choice) {
    throw new Error('No choices in OpenAI response')
  }

  const content: AnthropicBlock[] = []

  // Add text content if present
  if (choice.message.content) {
    content.push({ type: 'text', text: choice.message.content })
  }

  // Convert tool_calls to tool_use blocks
  if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
    for (const toolCall of choice.message.tool_calls) {
      let parsedInput: unknown = {}
      try {
        parsedInput = JSON.parse(toolCall.function.arguments)
      } catch {
        parsedInput = { raw: toolCall.function.arguments }
      }

      content.push({
        type: 'tool_use',
        id: toolCall.id,
        name: toolCall.function.name,
        input: parsedInput,
      })
    }
  }

  // Map stop_reason
  let stopReason: AnthropicResponse['stop_reason'] = 'end_turn'
  if (choice.finish_reason === 'tool_calls') {
    stopReason = 'tool_use'
  } else if (choice.finish_reason === 'length') {
    stopReason = 'max_tokens'
  } else if (choice.finish_reason === 'stop') {
    stopReason = 'end_turn'
  }

  return {
    id: response.id,
    type: 'message',
    role: 'assistant',
    content,
    model: response.model,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: response.usage?.prompt_tokens ?? 0,
      output_tokens: response.usage?.completion_tokens ?? 0,
    },
  }
}
