import { glob } from 'fs/promises'
import type { Dirent } from 'fs'
import { z } from 'zod'
import type { ToolDef, ToolContext, ToolResult } from '../base.js'
import { resolvePath } from '../../utils/resolvePath.js'

const MAX_RESULTS = 500

const inputSchema = z.object({
  pattern: z.string().describe('Glob pattern to match files (e.g. "**/*.ts", "src/**/*.{js,ts}")'),
  path: z.string().optional().describe('Base directory to search in (default: current directory)'),
  exclude: z.string().optional().describe('Glob pattern to exclude'),
})

type Input = z.infer<typeof inputSchema>

export const GlobTool: ToolDef<Input, string> = {
  name: 'Glob',
  description:
    'Find files matching a glob pattern. Returns a list of matching file paths. Great for discovering files before reading them.',
  inputSchema,

  async execute(input: Input, context: ToolContext): Promise<ToolResult<string>> {
    const basePath = input.path ? resolvePath(input.path, context.cwd) : context.cwd

    try {
      const matches: string[] = []

      for await (const entry of glob(input.pattern, {
        cwd: basePath,
        withFileTypes: false,
        exclude: (p: Dirent | string) => {
          const str = typeof p === 'string' ? p : p.name
          const alwaysExclude = str.includes('node_modules') || str.includes('.git')
          if (!input.exclude) return alwaysExclude
          return alwaysExclude || str.includes(input.exclude)
        },
      })) {
        matches.push(entry as string)
        if (matches.length >= MAX_RESULTS) break
      }

      if (matches.length === 0) {
        return { content: `No files matched pattern: ${input.pattern}` }
      }

      const sorted = matches.sort()
      const result = sorted.join('\n')
      return {
        content:
          matches.length >= MAX_RESULTS
            ? `${result}\n... (showing first ${MAX_RESULTS} results)`
            : result,
      }
    } catch (err) {
      return { content: `Glob error: ${String(err)}`, isError: true }
    }
  },
}
