import { describe, it, expect } from 'vitest'
import { convertMessagesToOpenAI } from '../adapters/openai/requestAdapter.js'
import type { AnthropicMessage } from '../adapters/openai/requestAdapter.js'

describe('convertMessagesToOpenAI', () => {
  it('plain string messages are converted correctly', () => {
    const messages: AnthropicMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'world' },
    ]
    const result = convertMessagesToOpenAI(messages)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ role: 'user', content: 'hello' })
    expect(result[1]).toEqual({ role: 'assistant', content: 'world' })
  })

  it('tool_use blocks are converted to tool_calls in assistant message', () => {
    const messages: AnthropicMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'calling tool' },
          { type: 'tool_use', id: 'call_1', name: 'my_func', input: { x: 1 } },
        ],
      },
    ]
    const result = convertMessagesToOpenAI(messages)
    expect(result).toHaveLength(1)
    const assistantMsg = result[0] as { role: 'assistant'; tool_calls: { id: string; function: { name: string; arguments: string } }[] }
    expect(assistantMsg.tool_calls).toHaveLength(1)
    expect(assistantMsg.tool_calls[0]?.function.name).toBe('my_func')
    expect(JSON.parse(assistantMsg.tool_calls[0]?.function.arguments ?? '{}')).toEqual({ x: 1 })
  })

  it('tool_result blocks become separate tool-role messages', () => {
    const messages: AnthropicMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'call_1', content: 'result text' },
        ],
      },
    ]
    const result = convertMessagesToOpenAI(messages)
    expect(result).toHaveLength(1)
    expect(result[0]?.role).toBe('tool')
    const toolMsg = result[0] as { role: 'tool'; tool_call_id: string; content: string }
    expect(toolMsg.tool_call_id).toBe('call_1')
    expect(toolMsg.content).toBe('result text')
  })

  it('system prompt is injected as the first system message', () => {
    const messages: AnthropicMessage[] = [{ role: 'user', content: 'hi' }]
    const result = convertMessagesToOpenAI(messages, 'You are helpful')
    expect(result[0]?.role).toBe('system')
    expect((result[0] as { content: string }).content).toBe('You are helpful')
    expect(result[1]?.role).toBe('user')
  })
})
