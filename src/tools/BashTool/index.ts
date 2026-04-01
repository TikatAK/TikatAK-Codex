import { execFile } from 'child_process'
import { promisify } from 'util'
import { z } from 'zod'
import type { ToolDef, ToolContext, ToolResult } from '../base.js'

const execFileAsync = promisify(execFile)

const TIMEOUT_MS = 120_000
const MAX_OUTPUT_BYTES = 200_000

const IS_WINDOWS = process.platform === 'win32'

const inputSchema = z.object({
  command: z.string().describe('The shell command to execute'),
  timeout: z.number().optional().describe('Timeout in milliseconds (default 120000)'),
  description: z.string().optional().describe('Short description of what this command does'),
})

type Input = z.infer<typeof inputSchema>

export const BashTool: ToolDef<Input, string> = {
  name: 'Bash',
  description:
    'Execute a shell command. Returns stdout and stderr. Use for running code, git operations, file manipulation, and any system task.',
  inputSchema,

  async execute(input: Input, context: ToolContext): Promise<ToolResult<string>> {
    const timeout = input.timeout ?? TIMEOUT_MS

    // Windows: use cmd.exe /c; Unix: use bash -c
    const shell = IS_WINDOWS ? 'cmd.exe' : 'bash'
    const shellArg = IS_WINDOWS ? '/c' : '-c'

    try {
      const { stdout, stderr } = await execFileAsync(shell, [shellArg, input.command], {
        cwd: context.cwd,
        timeout,
        maxBuffer: MAX_OUTPUT_BYTES,
        signal: context.signal,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          ...(!IS_WINDOWS ? { DEBIAN_FRONTEND: 'noninteractive' } : {}),
        },
      })

      const output = [stdout, stderr].filter(Boolean).join('\n').trimEnd()
      return { content: output || '(no output)' }
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null) {
        const e = err as Record<string, unknown>
        // maxBuffer exceeded
        if (String(e['message']).includes('maxBuffer') || String(e['code']) === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
          return {
            content: `Output too large (exceeded ${MAX_OUTPUT_BYTES / 1024}KB limit). Use pipes or redirect to file.`,
            isError: true,
          }
        }
        if (typeof e['stdout'] === 'string' || typeof e['stderr'] === 'string') {
          const out = [e['stdout'], e['stderr']].filter(Boolean).join('\n').toString().trimEnd()
          const code = e['code']
          return {
            content: `Exit code ${code ?? 'unknown'}\n${out}`,
            isError: true,
          }
        }
        if ((e['signal'] as string) === 'SIGTERM' || String(e['message']).includes('timed out')) {
          return { content: `Command timed out after ${timeout}ms`, isError: true }
        }
      }
      return { content: String(err), isError: true }
    }
  },
}

