import { execFile } from 'child_process'
import { promisify } from 'util'
import { readdir, readFile, stat } from 'fs/promises'
import * as path from 'path'
import { z } from 'zod'
import type { ToolDef, ToolContext, ToolResult } from '../base.js'
import { resolvePath } from '../../utils/resolvePath.js'

const execFileAsync = promisify(execFile)
const MAX_OUTPUT = 50_000
const MAX_RESULTS = 1000
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'build', '__pycache__'])
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp',
  '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
  '.exe', '.dll', '.so', '.dylib', '.node',
  '.woff', '.woff2', '.ttf', '.eot',
  '.mp3', '.mp4', '.avi', '.mov',
])

const inputSchema = z.object({
  pattern: z.string().describe('Regular expression pattern to search for'),
  path: z.string().optional().describe('File or directory to search in (default: current directory)'),
  include: z.string().optional().describe('File extension or glob to include (e.g. "*.ts" or ".ts")'),
  context: z.number().optional().describe('Lines of context around each match (0-5)'),
  case_insensitive: z.boolean().optional().describe('Case insensitive search'),
  recursive: z.boolean().optional().describe('Search recursively (default: true)'),
})

type Input = z.infer<typeof inputSchema>

export const GrepTool: ToolDef<Input, string> = {
  name: 'Grep',
  description:
    'Search for a regex pattern in files. Returns matching lines with file paths and line numbers. Defaults to recursive search. Works without any external tools.',
  inputSchema,

  async execute(input: Input, context: ToolContext): Promise<ToolResult<string>> {
    const searchPath = input.path ? resolvePath(input.path, context.cwd) : context.cwd

    // Try rg first for speed (optional)
    if (await checkCommand('rg')) {
      const args = ['--no-heading', '--line-number']
      if (input.case_insensitive) args.push('--ignore-case')
      if (input.include) args.push('--glob', input.include)
      if (input.context) args.push('--context', String(input.context))
      args.push(input.pattern, searchPath)
      try {
        const { stdout } = await execFileAsync('rg', args, { cwd: context.cwd, maxBuffer: MAX_OUTPUT, signal: context.signal })
        return { content: stdout.trimEnd() || 'No matches found' }
      } catch (err: unknown) {
        if ((err as Record<string, unknown>)['code'] === 1) return { content: 'No matches found' }
        // Fall through to Node.js implementation
      }
    }

    // Pure Node.js grep — no external dependencies
    try {
      const regex = new RegExp(input.pattern, input.case_insensitive ? 'gi' : 'g')
      const results: string[] = []
      let totalMatches = 0

      // Check if searchPath is a file or directory
      const st = await stat(searchPath)
      const files: string[] = st.isDirectory()
        ? await collectFiles(searchPath, input.recursive !== false, input.include)
        : [searchPath]

      for (const file of files) {
        if (totalMatches >= MAX_RESULTS) break
        try {
          const raw = await readFile(file, 'utf8')
          const lines = raw.split(/\r?\n/)
          const contextLines = Math.min(input.context ?? 0, 5)
          const matchedLineNums = new Set<number>()

          lines.forEach((line, i) => {
            regex.lastIndex = 0
            if (regex.test(line)) matchedLineNums.add(i)
          })

          if (matchedLineNums.size === 0) continue

          const relPath = path.relative(context.cwd, file)
          const printedLines = new Set<number>()

          for (const lineNum of [...matchedLineNums].sort((a, b) => a - b)) {
            if (totalMatches >= MAX_RESULTS) break
            const start = Math.max(0, lineNum - contextLines)
            const end = Math.min(lines.length - 1, lineNum + contextLines)

            for (let i = start; i <= end; i++) {
              if (printedLines.has(i)) continue
              printedLines.add(i)
              const marker = matchedLineNums.has(i) ? ':' : '-'
              results.push(`${relPath}:${i + 1}${marker}${lines[i]}`)
            }
            if (contextLines > 0) results.push('--')
            totalMatches++
          }
        } catch {
          // Skip unreadable files
        }
      }

      if (results.length === 0) return { content: 'No matches found' }
      const output = results.join('\n')
      return {
        content: totalMatches >= MAX_RESULTS
          ? `${output}\n... (showing first ${MAX_RESULTS} matches)`
          : output,
      }
    } catch (err) {
      return { content: `Grep error: ${String(err)}`, isError: true }
    }
  },
}

async function collectFiles(dir: string, recursive: boolean, include?: string): Promise<string[]> {
  const files: string[] = []
  const extFilter = include ? normalizeExt(include) : null

  async function walk(current: string): Promise<void> {
    let entries: string[]
    try {
      entries = await readdir(current)
    } catch { return }

    for (const name of entries) {
      const full = path.join(current, name)
      let s
      try { s = await stat(full) } catch { continue }

      if (s.isDirectory()) {
        if (recursive && !SKIP_DIRS.has(name)) await walk(full)
      } else {
        const ext = path.extname(name).toLowerCase()
        if (BINARY_EXT.has(ext)) continue
        if (extFilter && !extFilter.has(ext) && !name.endsWith(extFilter.values().next().value ?? '')) continue
        files.push(full)
      }
    }
  }

  await walk(dir)
  return files
}

/** Convert include pattern like "*.ts" or ".ts" to a Set of extensions */
function normalizeExt(include: string): Set<string> | null {
  const m = include.match(/\*?(\.[a-z0-9]+)$/i)
  if (m) return new Set([m[1]!.toLowerCase()])
  return null
}

async function checkCommand(cmd: string): Promise<boolean> {
  try {
    await execFileAsync(cmd, ['--version'], { timeout: 2000 })
    return true
  } catch {
    return false
  }
}

