import { describe, it, expect } from 'vitest'
import { compressContext, estimateTokens } from '../utils/context/index.js'
import type { AnthropicMessage } from '../adapters/openai/index.js'

function makeMessages(n: number): AnthropicMessage[] {
  return Array.from({ length: n }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `message ${i}`,
  }))
}

describe('compressContext', () => {
  it('messages <= 40 are not compressed', () => {
    const msgs = makeMessages(40)
    const { compressed, messages } = compressContext(msgs)
    expect(compressed).toBe(false)
    expect(messages).toHaveLength(40)
  })

  it('messages > 40 are compressed; output length = 11 (1 summary + 10 kept)', () => {
    const msgs = makeMessages(41)
    const { messages, compressed } = compressContext(msgs)
    expect(compressed).toBe(true)
    expect(messages).toHaveLength(11)
  })

  it('first message of compressed result is a summary', () => {
    const msgs = makeMessages(50)
    const { messages } = compressContext(msgs)
    expect(typeof messages[0]?.content).toBe('string')
    expect(messages[0]?.content as string).toContain('压缩')
  })

  it('kept messages are the last 10 of original', () => {
    const msgs = makeMessages(50)
    const { messages } = compressContext(msgs)
    // messages[1..10] should match original last 10
    for (let i = 0; i < 10; i++) {
      expect(messages[i + 1]).toEqual(msgs[40 + i])
    }
  })
})

describe('estimateTokens', () => {
  it('returns Math.ceil(len/4) for a string content message', () => {
    const msgs: AnthropicMessage[] = [{ role: 'user', content: '1234' }]
    expect(estimateTokens(msgs)).toBe(1) // ceil(4/4) = 1
  })

  it('handles 5-char string: ceil(5/4) = 2', () => {
    const msgs: AnthropicMessage[] = [{ role: 'user', content: '12345' }]
    expect(estimateTokens(msgs)).toBe(2) // ceil(5/4) = 2
  })

  it('returns 0 for empty array', () => {
    expect(estimateTokens([])).toBe(0)
  })

  it('sums chars across multiple messages', () => {
    const msgs: AnthropicMessage[] = [
      { role: 'user', content: '1234' },     // 4 chars
      { role: 'assistant', content: '5678' }, // 4 chars
    ]
    expect(estimateTokens(msgs)).toBe(2) // ceil(8/4) = 2
  })
})
