import { readdirSync, statSync } from 'fs'
import * as path from 'path'
import { z } from 'zod'
import type { ToolDef, ToolContext, ToolResult } from '../base.js'

const MAX_ENTRIES = 200

const inputSchema = z.object({
  path: z.string().optional().describe('Directory to list (default: current directory)'),
  recursive: z.boolean().optional().describe('List recursively (default: false)'),
})

type Input = z.infer<typeof inputSchema>

export const LSTool: ToolDef<Input, string> = {
  name: 'LS',
  description: 'List directory contents with file sizes. Great for exploring project structure.',
  inputSchema,

  async execute(input: Input, context: ToolContext): Promise<ToolResult<string>> {
    const dirPath = input.path
      ? (path.isAbsolute(input.path) ? input.path : path.join(context.cwd, input.path))
      : context.cwd

    try {
      const lines: string[] = [`// Directory: ${dirPath}\n`]
      let count = 0

      function listDir(dir: string, indent: string): void {
        if (count >= MAX_ENTRIES) return
        let names: string[]
        try {
          names = readdirSync(dir)
        } catch { return }

        const sorted = names
          .filter(n => n !== 'node_modules' && n !== '.git')
          .sort((a, b) => {
            const aIsDir = isDir(path.join(dir, a))
            const bIsDir = isDir(path.join(dir, b))
            if (aIsDir && !bIsDir) return -1
            if (!aIsDir && bIsDir) return 1
            return a.localeCompare(b)
          })

        for (const name of sorted) {
          if (count >= MAX_ENTRIES) break
          const fullPath = path.join(dir, name)
          if (isDir(fullPath)) {
            lines.push(`${indent}📁 ${name}/`)
            if (input.recursive === true) listDir(fullPath, indent + '  ')
          } else {
            try {
              const size = statSync(fullPath).size
              lines.push(`${indent}📄 ${name} (${formatSize(size)})`)
            } catch {
              lines.push(`${indent}📄 ${name}`)
            }
          }
          count++
        }
      }

      listDir(dirPath, '')
      if (count >= MAX_ENTRIES) lines.push(`\n... (first ${MAX_ENTRIES} entries shown)`)

      return { content: lines.join('\n') }
    } catch (err) {
      return { content: `Error listing directory: ${String(err)}`, isError: true }
    }
  },
}

function isDir(p: string): boolean {
  try { return statSync(p).isDirectory() } catch { return false }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
