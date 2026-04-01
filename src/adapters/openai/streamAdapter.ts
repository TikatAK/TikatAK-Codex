import type OpenAI from 'openai'
import type { AnthropicBlock } from './responseAdapter.js'

/**
 * Stream event types that the app's rendering layer expects.
 */
export type StreamEvent =
  | { type: 'message_start'; usage: { input_tokens: number; output_tokens: number } }
  | { type: 'content_block_start'; index: number; content_block: { type: 'text'; text: '' } | { type: 'tool_use'; id: string; name: string; input: '' } }
  | { type: 'content_block_delta'; index: number; delta: { type: 'text_delta'; text: string } | { type: 'input_json_delta'; partial_json: string } }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason: string; stop_sequence: string | null }; usage: { output_tokens: number } }
  | { type: 'message_stop' }

export interface StreamResult {
  events: StreamEvent[]
  content: AnthropicBlock[]
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens'
  usage: { input_tokens: number; output_tokens: number }
}

/**
 * Consume an OpenAI stream and yield Anthropic-compatible stream events.
 */
export async function* streamOpenAIToAnthropic(
  stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>,
): AsyncGenerator<StreamEvent> {
  let inputTokens = 0
  let outputTokens = 0

  // Track tool call accumulation across chunks
  const toolCallAccumulator: Map<
    number,
    { id: string; name: string; argumentsJson: string; blockIndex: number }
  > = new Map()

  let nextBlockIndex = 0
  let textBlockIndex = -1
  let hasOpenedTextBlock = false

  yield { type: 'message_start', usage: { input_tokens: 0, output_tokens: 0 } }

  for await (const chunk of stream) {
    const choice = chunk.choices[0]
    if (!choice) continue

    const delta = choice.delta

    // Usage data (usually in last chunk)
    if (chunk.usage) {
      inputTokens = chunk.usage.prompt_tokens ?? 0
      outputTokens = chunk.usage.completion_tokens ?? 0
    }

    // Text delta
    if (delta.content) {
      if (!hasOpenedTextBlock) {
        textBlockIndex = nextBlockIndex++
        yield {
          type: 'content_block_start',
          index: textBlockIndex,
          content_block: { type: 'text', text: '' },
        }
        hasOpenedTextBlock = true
      }
      yield {
        type: 'content_block_delta',
        index: textBlockIndex,
        delta: { type: 'text_delta', text: delta.content },
      }
    }

    // Tool call deltas
    if (delta.tool_calls) {
      for (const tcDelta of delta.tool_calls) {
        const idx = tcDelta.index ?? 0

        if (tcDelta.id) {
          // First chunk for this tool call — only allocate if not already seen
          if (!toolCallAccumulator.has(idx)) {
            const toolBlockIndex = nextBlockIndex++
            toolCallAccumulator.set(idx, {
              id: tcDelta.id,
              name: tcDelta.function?.name ?? '',
              argumentsJson: tcDelta.function?.arguments ?? '',
              blockIndex: toolBlockIndex,
            })
            yield {
              type: 'content_block_start',
              index: toolBlockIndex,
              content_block: {
                type: 'tool_use',
                id: tcDelta.id,
                name: tcDelta.function?.name ?? '',
                input: '',
              },
            }
          }
        } else {
          // Continuation chunk
          const acc = toolCallAccumulator.get(idx)
          if (acc && tcDelta.function?.arguments) {
            acc.argumentsJson += tcDelta.function.arguments
            acc.name = acc.name || tcDelta.function?.name || ''
            yield {
              type: 'content_block_delta',
              index: acc.blockIndex,
              delta: {
                type: 'input_json_delta',
                partial_json: tcDelta.function.arguments,
              },
            }
          }
        }
      }
    }

    // Stream end
    if (choice.finish_reason) {
      // Close text block
      if (hasOpenedTextBlock) {
        yield { type: 'content_block_stop', index: textBlockIndex }
      }

      // Close tool blocks
      for (const [, acc] of toolCallAccumulator) {
        yield { type: 'content_block_stop', index: acc.blockIndex }
      }

      const stopReason =
        choice.finish_reason === 'tool_calls'
          ? 'tool_use'
          : choice.finish_reason === 'length'
            ? 'max_tokens'
            : 'end_turn'

      yield {
        type: 'message_delta',
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: outputTokens },
      }
      yield { type: 'message_stop' }
    }
  }
}
