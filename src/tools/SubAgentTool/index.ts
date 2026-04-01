import { z } from 'zod'
import type { ToolDef, ToolContext, ToolResult } from '../base.js'
import { sendMessage } from '../../services/api/claude.js'
import { executeTools } from '../../services/api/toolExecutor.js'
import { SUB_AGENT_TOOL_SCHEMAS } from '../index.js'
import type { AnthropicMessage, AnthropicBlock, AnthropicTool } from '../../adapters/openai/index.js'
import type { AnthropicToolUseBlock } from '../../adapters/openai/responseAdapter.js'

const MAX_TOOL_ROUNDS = 10

const inputSchema = z.object({
  task: z.string().describe('The task to perform. Be specific and self-contained.'),
  context: z.string().optional().describe('Additional context or files to be aware of.'),
})

type Input = z.infer<typeof inputSchema>

const SUB_AGENT_SYSTEM = `You are a focused sub-agent. Complete the given task precisely and concisely.
Use tools as needed. Return a clear summary of what you did and what the result was.
Do not ask clarifying questions — make reasonable assumptions and complete the task.`

/**
 * SubAgentTool — allows the main agent to spawn a sub-agent for a focused sub-task.
 * The sub-agent runs its own full agentic loop and returns the result as a string.
 */
export const SubAgentTool: ToolDef<Input, string> = {
  name: 'SubAgent',
  description:
    'Spawn a sub-agent to handle a focused, self-contained task in parallel. ' +
    'Useful for breaking large tasks into independent parts. ' +
    'Returns a text summary of what the sub-agent did.',
  inputSchema,

  async execute(input: Input, context: ToolContext): Promise<ToolResult<string>> {
    const systemPrompt = `${SUB_AGENT_SYSTEM}\nWorking directory: ${context.cwd}`
    const userContent = input.context
      ? `Context:\n${input.context}\n\nTask:\n${input.task}`
      : input.task

    let messages: AnthropicMessage[] = [{ role: 'user', content: userContent }]

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await sendMessage({
          messages,
          system: systemPrompt,
          // Sub-agents use all tools except SubAgent itself (no recursion)
          useBuiltinTools: false,
          tools: SUB_AGENT_TOOL_SCHEMAS as unknown as AnthropicTool[],
        })

        const toolBlocks = response.content.filter(
          (b): b is AnthropicToolUseBlock => b.type === 'tool_use',
        )
        const textBlocks = response.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map(b => b.text)
          .join('')

        if (toolBlocks.length === 0 || response.stop_reason === 'end_turn') {
          return { content: textBlocks || '(Sub-agent completed with no text output)' }
        }

        const results = await executeTools(toolBlocks, context)

        const assistantMsg: AnthropicMessage = {
          role: 'assistant',
          content: response.content as AnthropicBlock[],
        }
        const toolResultMsg: AnthropicMessage = {
          role: 'user',
          content: results.map(r => ({
            type: 'tool_result' as const,
            tool_use_id: r.tool_use_id,
            content: r.content,
            is_error: r.is_error,
          })),
        }
        messages = [...messages, assistantMsg, toolResultMsg]
      }

      return { content: 'Sub-agent reached max tool rounds without finishing.' }
    } catch (err) {
      return {
        content: `Sub-agent error: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      }
    }
  },
}
