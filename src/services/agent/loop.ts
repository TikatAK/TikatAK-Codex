import { sendMessageStream } from '../api/claude.js'
import { executeTools } from '../api/toolExecutor.js'
import { compressContext } from '../../utils/context/index.js'
import { finalizeToolUseBlocks } from '../../utils/stream.js'
import { MAX_AGENT_ROUNDS } from '../../constants/index.js'
import type { AnthropicMessage, AnthropicBlock } from '../../adapters/openai/index.js'
import type { AnthropicTextBlock } from '../../adapters/openai/responseAdapter.js'
import type { ToolExecutionResult } from '../api/toolExecutor.js'

export interface AgentLoopOptions {
  messages: AnthropicMessage[]
  system: string
  model?: string
  cwd: string
  maxRounds?: number
  /** Called for each streamed text chunk */
  onText?: (chunk: string) => void
  /** Called when a tool_use block starts (before execution) */
  onToolStart?: (toolName: string) => void
  /** Called after all tools in a round execute */
  onToolResult?: (results: ToolExecutionResult[]) => void
  /** Called when context was compressed */
  onCompressed?: (estimatedTokens: number) => void
  /** Called at the end of each streaming turn with token usage and text */
  onTurnComplete?: (turn: { text: string; inputTokens: number; outputTokens: number }) => void
}

export interface AgentLoopResult {
  messages: AnthropicMessage[]
  finalText: string
  hitRoundLimit: boolean
}

/**
 * Core agent loop: stream → accumulate → execute tools → repeat.
 * Used by both the interactive REPL and the non-interactive mode.
 */
export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult> {
  const { system, model, cwd, maxRounds = MAX_AGENT_ROUNDS } = opts
  let messages = [...opts.messages]
  let finalText = ''

  // Warn the model when it's 3 rounds from the limit, so it can wrap up gracefully
  const WARN_ROUNDS_BEFORE_LIMIT = 3

  for (let round = 0; round < maxRounds; round++) {
    const { messages: compressed, compressed: wasCompressed } = compressContext(messages)
    if (wasCompressed && opts.onCompressed) {
      const { estimateTokens } = await import('../../utils/context/index.js')
      opts.onCompressed(estimateTokens(compressed))
    }

    // Inject a wrap-up reminder when approaching the round limit
    const roundsLeft = maxRounds - round
    const messagesForThisRound =
      roundsLeft <= WARN_ROUNDS_BEFORE_LIMIT
        ? [
            ...compressed,
            {
              role: 'user' as const,
              content: `<system-reminder>You have ${roundsLeft} tool-use round${roundsLeft === 1 ? '' : 's'} remaining. Finish your current step, then provide your final response without starting new tool calls.</system-reminder>`,
            },
          ]
        : compressed

    const stream = sendMessageStream({ messages: messagesForThisRound, system, model })

    let textContent = ''
    let inputTokens = 0
    let outputTokens = 0
    let stopReason = 'end_turn'
    const toolAccumulator = new Map<number, { id: string; name: string; argsJson: string }>()

    for await (const event of stream) {
      if (event.type === 'message_start') {
        inputTokens = event.usage.input_tokens
      } else if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        const tb = event.content_block
        toolAccumulator.set(event.index, { id: tb.id, name: tb.name, argsJson: '' })
        opts.onToolStart?.(tb.name)
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          textContent += event.delta.text
          opts.onText?.(event.delta.text)
        } else if (event.delta.type === 'input_json_delta') {
          const acc = toolAccumulator.get(event.index)
          if (acc) acc.argsJson += event.delta.partial_json
        }
      } else if (event.type === 'message_delta') {
        stopReason = event.delta.stop_reason
        outputTokens = event.usage.output_tokens
      }
    }

    finalText = textContent
    opts.onTurnComplete?.({ text: textContent, inputTokens, outputTokens })

    const contentBlocks: AnthropicBlock[] = []
    if (textContent) contentBlocks.push({ type: 'text', text: textContent } satisfies AnthropicTextBlock)
    const toolUseBlocks = finalizeToolUseBlocks(toolAccumulator)
    for (const tb of toolUseBlocks) contentBlocks.push(tb)

    if (toolUseBlocks.length === 0 || stopReason === 'end_turn') {
      messages = [...messages, { role: 'assistant', content: contentBlocks }]
      return { messages, finalText, hitRoundLimit: false }
    }

    const results = await executeTools(toolUseBlocks, { cwd, signal: undefined })
    opts.onToolResult?.(results)

    messages = [
      ...messages,
      { role: 'assistant', content: contentBlocks },
      {
        role: 'user',
        content: results.map(r => ({
          type: 'tool_result' as const,
          tool_use_id: r.tool_use_id,
          content: r.content,
          is_error: r.is_error,
        })),
      },
    ]
  }

  return { messages, finalText, hitRoundLimit: true }
}
