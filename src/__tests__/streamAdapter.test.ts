import { describe, it, expect } from 'vitest'
import type OpenAI from 'openai'
import { streamOpenAIToAnthropic } from '../adapters/openai/streamAdapter.js'
import type { StreamEvent } from '../adapters/openai/streamAdapter.js'

type Chunk = OpenAI.Chat.ChatCompletionChunk

async function* makeStream(chunks: Chunk[]): AsyncGenerator<Chunk> {
  for (const c of chunks) yield c
}

async function collect(stream: AsyncGenerator<Chunk>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = []
  for await (const e of streamOpenAIToAnthropic(stream)) {
    events.push(e)
  }
  return events
}

function textChunk(content: string): Chunk {
  return {
    id: 'c1', object: 'chat.completion.chunk', created: 0, model: 'gpt-4',
    choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null, logprobs: null }],
    usage: null,
  }
}

function finishChunk(finish_reason: 'stop' | 'tool_calls' | 'length', usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }): Chunk {
  return {
    id: 'c1', object: 'chat.completion.chunk', created: 0, model: 'gpt-4',
    choices: [{ index: 0, delta: {}, finish_reason, logprobs: null }],
    usage: usage ?? null,
  }
}

function toolStartChunk(index: number, id: string, name: string, args = ''): Chunk {
  return {
    id: 'c1', object: 'chat.completion.chunk', created: 0, model: 'gpt-4',
    choices: [{
      index: 0,
      delta: {
        tool_calls: [{ index, id, type: 'function', function: { name, arguments: args } }],
      },
      finish_reason: null,
      logprobs: null,
    }],
    usage: null,
  }
}

function toolDeltaChunk(index: number, args: string): Chunk {
  return {
    id: 'c1', object: 'chat.completion.chunk', created: 0, model: 'gpt-4',
    choices: [{
      index: 0,
      delta: { tool_calls: [{ index, function: { arguments: args } }] },
      finish_reason: null,
      logprobs: null,
    }],
    usage: null,
  }
}

describe('streamOpenAIToAnthropic', () => {
  it('pure text stream produces correct event sequence', async () => {
    const chunks = [textChunk('hello '), textChunk('world'), finishChunk('stop')]
    const events = await collect(makeStream(chunks))

    expect(events[0]?.type).toBe('message_start')
    expect(events[1]?.type).toBe('content_block_start')
    if (events[1]?.type === 'content_block_start') {
      expect(events[1].content_block.type).toBe('text')
    }
    // text deltas
    const textDeltas = events.filter(e => e.type === 'content_block_delta')
    expect(textDeltas.length).toBeGreaterThanOrEqual(2)
    // content_block_stop, message_delta, message_stop
    const types = events.map(e => e.type)
    expect(types).toContain('content_block_stop')
    expect(types).toContain('message_delta')
    expect(types).toContain('message_stop')
  })

  it('tool call stream produces tool_use content_block_start and input_json_delta', async () => {
    const chunks = [
      toolStartChunk(0, 'call_abc', 'my_tool', '{"ke'),
      toolDeltaChunk(0, 'y":1}'),
      finishChunk('tool_calls'),
    ]
    const events = await collect(makeStream(chunks))

    const blockStart = events.find(e => e.type === 'content_block_start') as Extract<StreamEvent, { type: 'content_block_start' }> | undefined
    expect(blockStart?.content_block.type).toBe('tool_use')
    if (blockStart?.content_block.type === 'tool_use') {
      expect(blockStart.content_block.name).toBe('my_tool')
    }

    const jsonDeltas = events.filter(e => e.type === 'content_block_delta') as Extract<StreamEvent, { type: 'content_block_delta' }>[]
    expect(jsonDeltas.some(d => d.delta.type === 'input_json_delta')).toBe(true)

    const messageDelta = events.find(e => e.type === 'message_delta') as Extract<StreamEvent, { type: 'message_delta' }> | undefined
    expect(messageDelta?.delta.stop_reason).toBe('tool_use')
  })

  it('usage data is correctly extracted from chunk', async () => {
    const chunks = [
      textChunk('hi'),
      { ...finishChunk('stop'), usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
    ]
    const events = await collect(makeStream(chunks))
    const msgDelta = events.find(e => e.type === 'message_delta') as Extract<StreamEvent, { type: 'message_delta' }> | undefined
    expect(msgDelta?.usage.output_tokens).toBe(5)
  })

  it('duplicate tool call index does not create duplicate blocks', async () => {
    const chunks = [
      toolStartChunk(0, 'call_1', 'tool_a', '{"a"'),
      toolDeltaChunk(0, ':1}'),
      finishChunk('tool_calls'),
    ]
    const events = await collect(makeStream(chunks))
    const blockStarts = events.filter(e => e.type === 'content_block_start')
    // Only 1 block should be started for tool index 0
    const toolStarts = blockStarts.filter(e => {
      if (e.type === 'content_block_start') return e.content_block.type === 'tool_use'
      return false
    })
    expect(toolStarts.length).toBe(1)
  })
})
