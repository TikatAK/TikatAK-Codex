import { readFile, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { z } from 'zod'
import type { ToolDef, ToolContext, ToolResult } from '../base.js'
import { resolvePath } from '../../utils/resolvePath.js'

const MAX_FILE_CHARS = 100_000
const MAX_LINES_DISPLAY = 2000
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB — prevent OOM on huge files

const inputSchema = z.object({
  file_path: z.string().describe('Absolute or relative path to the file to read'),
  offset: z.number().optional().describe('Line number to start reading from (1-indexed)'),
  limit: z.number().optional().describe('Maximum number of lines to read'),
})

type Input = z.infer<typeof inputSchema>

export const FileReadTool: ToolDef<Input, string> = {
  name: 'Read',
  description:
    'Read the contents of a file. Returns file content with line numbers. Supports text files. Use offset and limit for large files.',
  inputSchema,

  async execute(input: Input, context: ToolContext): Promise<ToolResult<string>> {
    const filePath = resolvePath(input.file_path, context.cwd)

    if (!existsSync(filePath)) {
      return {
        content: `File not found: ${input.file_path}\nCurrent directory: ${context.cwd}`,
        isError: true,
      }
    }

    try {
      // Reject huge files before loading into memory
      const fileStat = await stat(filePath)
      if (fileStat.isDirectory()) {
        return {
          content: `Path is a directory, not a file: ${input.file_path}. Use LS tool to list directory contents.`,
          isError: true,
        }
      }
      if (fileStat.size > MAX_FILE_BYTES) {
        return {
          content: `File too large to read: ${input.file_path} (${(fileStat.size / 1024 / 1024).toFixed(1)} MB). Use offset/limit params to read specific lines.`,
          isError: true,
        }
      }

      const raw = await readFile(filePath, 'utf8')
      const lines = raw.split('\n')
      const total = lines.length

      const start = Math.max(0, (input.offset ?? 1) - 1)
      const count = input.limit ?? MAX_LINES_DISPLAY
      const slice = lines.slice(start, start + count)

      // Add line numbers
      const numbered = slice
        .map((line, i) => `${String(start + i + 1).padStart(6)} │ ${line}`)
        .join('\n')

      const header =
        total > count
          ? `// File: ${filePath} (lines ${start + 1}-${Math.min(start + count, total)} of ${total})\n`
          : `// File: ${filePath} (${total} lines)\n`

      const result = header + numbered
      if (result.length > MAX_FILE_CHARS) {
        return { content: result.slice(0, MAX_FILE_CHARS) + '\n... (truncated)' }
      }
      return { content: result }
    } catch (err) {
      return { content: `Error reading file: ${String(err)}`, isError: true }
    }
  },
}
