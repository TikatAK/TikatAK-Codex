import { readFileSync, writeFileSync, existsSync } from 'fs'
import * as path from 'path'
import { z } from 'zod'
import type { ToolDef, ToolContext, ToolResult } from '../base.js'

const inputSchema = z.object({
  file_path: z.string().describe('Path to the file to edit'),
  old_string: z.string().describe('The exact string to replace (must be unique in the file)'),
  new_string: z.string().describe('The new string to replace old_string with'),
})

type Input = z.infer<typeof inputSchema>

export const FileEditTool: ToolDef<Input, string> = {
  name: 'Edit',
  description:
    'Edit a file by replacing an exact string with a new string. The old_string must appear exactly once in the file. Creates the file if it does not exist (old_string must be empty).',
  inputSchema,

  async execute(input: Input, context: ToolContext): Promise<ToolResult<string>> {
    const filePath = path.isAbsolute(input.file_path)
      ? input.file_path
      : path.join(context.cwd, input.file_path)

    // Create file if it doesn't exist
    if (!existsSync(filePath)) {
      if (input.old_string !== '') {
        return {
          content: `File not found: ${input.file_path}. To create a new file, old_string must be empty.`,
          isError: true,
        }
      }
      try {
        // Ensure parent dir exists
        const { mkdirSync } = await import('fs')
        mkdirSync(path.dirname(filePath), { recursive: true })
        writeFileSync(filePath, input.new_string, 'utf8')
        return { content: `Created file: ${input.file_path}` }
      } catch (err) {
        return { content: `Failed to create file: ${String(err)}`, isError: true }
      }
    }

    try {
      const content = readFileSync(filePath, 'utf8')

      // Count occurrences
      const occurrences = countOccurrences(content, input.old_string)

      if (occurrences === 0) {
        return {
          content: `String not found in ${input.file_path}:\n${input.old_string}`,
          isError: true,
        }
      }

      if (occurrences > 1) {
        return {
          content: `Found ${occurrences} occurrences of the string in ${input.file_path}. Make old_string more specific to match exactly one location.`,
          isError: true,
        }
      }

      const newContent = content.replace(input.old_string, input.new_string)
      writeFileSync(filePath, newContent, 'utf8')

      const linesChanged = Math.abs(
        input.new_string.split('\n').length - input.old_string.split('\n').length,
      )
      return {
        content: `Successfully edited ${input.file_path}${linesChanged > 0 ? ` (${linesChanged > 0 ? '+' : ''}${linesChanged} lines)` : ''}`,
      }
    } catch (err) {
      return { content: `Error editing file: ${String(err)}`, isError: true }
    }
  },
}

function countOccurrences(text: string, search: string): number {
  if (!search) return 0
  let count = 0
  let pos = 0
  while ((pos = text.indexOf(search, pos)) !== -1) {
    count++
    pos += search.length
  }
  return count
}
