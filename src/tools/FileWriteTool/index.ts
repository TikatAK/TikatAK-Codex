import { writeFileSync, mkdirSync } from 'fs'
import * as path from 'path'
import { z } from 'zod'
import type { ToolDef, ToolContext, ToolResult } from '../base.js'

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB guard

const inputSchema = z.object({
  file_path: z.string().describe('Path to write the file to'),
  content: z.string().describe('Full content to write to the file'),
})

type Input = z.infer<typeof inputSchema>

export const FileWriteTool: ToolDef<Input, string> = {
  name: 'Write',
  description:
    'Write content to a file, creating it or overwriting it entirely. Creates parent directories as needed. Use for new files or complete rewrites.',
  inputSchema,

  async execute(input: Input, context: ToolContext): Promise<ToolResult<string>> {
    if (context.sessionState?.planMode) {
      return {
        content: '🚫 Write is disabled in plan mode. Finish your plan and call ExitPlanMode first.',
        isError: true,
      }
    }
    const filePath = path.isAbsolute(input.file_path)
      ? input.file_path
      : path.join(context.cwd, input.file_path)

    try {
      if (Buffer.byteLength(input.content, 'utf8') > MAX_FILE_SIZE_BYTES) {
        return { content: `Content too large (exceeds 5 MB). Split into smaller writes.`, isError: true }
      }
      mkdirSync(path.dirname(filePath), { recursive: true })
      writeFileSync(filePath, input.content, 'utf8')
      const lines = input.content.split('\n').length
      return { content: `Wrote ${lines} lines to ${input.file_path}` }
    } catch (err) {
      return { content: `Error writing file: ${String(err)}`, isError: true }
    }
  },
}
