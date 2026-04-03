import { z } from 'zod'
import type { ToolDef, ToolContext, ToolResult } from '../base.js'

const inputSchema = z.object({
  question: z.string().describe('The question to ask the user'),
  choices: z
    .array(z.string())
    .optional()
    .describe('Optional list of suggested choices to present (user can still type freely)'),
})

type Input = z.infer<typeof inputSchema>

export const AskUserTool: ToolDef<Input, string> = {
  name: 'AskUser',
  description:
    'Pause execution and ask the user a clarifying question, then wait for their response. Use when you need information or a decision from the user before proceeding. Optionally provide choices to guide their answer.',
  inputSchema,

  async execute(input: Input, context: ToolContext): Promise<ToolResult<string>> {
    if (!context.askUser) {
      // Non-interactive context (e.g. non-REPL mode) — return a helpful fallback
      return {
        content:
          'AskUser is not available in this context (non-interactive mode). Use your best judgment and proceed.',
      }
    }

    try {
      const answer = await context.askUser(input.question, input.choices)
      return { content: answer.trim() || '(no response)' }
    } catch (err) {
      return { content: `Failed to get user input: ${String(err)}`, isError: true }
    }
  },
}
