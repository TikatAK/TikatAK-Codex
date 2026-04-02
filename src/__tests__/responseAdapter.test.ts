import { describe, it, expect } from 'vitest'
import { convertResponseToAnthropic } from '../adapters/openai/responseAdapter.js'
import type OpenAI from 'openai'

function makeResponse(
  content: string | null,
  finish_reason: 'stop' | 'tool_calls' | 'length',
  tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[],
  usage?: { prompt_tokens: number; completion_tokens: number },
): OpenAI.Chat.ChatCompletion {
  return {
    id: 'resp_1',
    object: 'chat.completion',
    created: 0,
    model: 'gpt-4',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
          tool_calls,
          refusal: null,
        },
        finish_reason,
        logprobs: null,
      },
    ],
    usage: usage
      ? { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, total_tokens: usage.prompt_tokens + usage.completion_tokens }
      : undefined,
  }
}

describe('convertResponseToAnthropic', () => {
  it('finish_reason=stop → stop_reason=end_turn', () => {
    const resp = convertResponseToAnthropic(makeResponse('hello', 'stop'))
    expect(resp.stop_reason).toBe('end_turn')
  })

  it('finish_reason=tool_calls → stop_reason=tool_use', () => {
    const toolCall: OpenAI.Chat.ChatCompletionMessageToolCall = {
      id: 'call_1',
      type: 'function',
      function: { name: 'my_fn', arguments: '{}' },
    }
    const resp = convertResponseToAnthropic(makeResponse(null, 'tool_calls', [toolCall]))
    expect(resp.stop_reason).toBe('tool_use')
  })

  it('finish_reason=length → stop_reason=max_tokens', () => {
    const resp = convertResponseToAnthropic(makeResponse('partial', 'length'))
    expect(resp.stop_reason).toBe('max_tokens')
  })

  it('invalid JSON in tool arguments falls back to { raw: ... }', () => {
    const toolCall: OpenAI.Chat.ChatCompletionMessageToolCall = {
      id: 'call_bad',
      type: 'function',
      function: { name: 'broken', arguments: 'not json at all' },
    }
    const resp = convertResponseToAnthropic(makeResponse(null, 'tool_calls', [toolCall]))
    const toolBlock = resp.content.find(b => b.type === 'tool_use')
    expect(toolBlock).toBeDefined()
    if (toolBlock?.type === 'tool_use') {
      expect((toolBlock.input as { raw: string }).raw).toBe('not json at all')
    }
  })

  it('usage is extracted correctly', () => {
    const resp = convertResponseToAnthropic(
      makeResponse('hi', 'stop', undefined, { prompt_tokens: 10, completion_tokens: 20 }),
    )
    expect(resp.usage.input_tokens).toBe(10)
    expect(resp.usage.output_tokens).toBe(20)
  })
})
