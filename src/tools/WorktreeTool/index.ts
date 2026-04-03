import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { join, resolve, isAbsolute } from 'path'
import { tmpdir } from 'os'
import { z } from 'zod'
import type { ToolDef, ToolContext, ToolResult } from '../base.js'

const execFileAsync = promisify(execFile)
const TIMEOUT_MS = 30_000

async function git(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('git', args, { cwd, timeout: TIMEOUT_MS })
}

// ── EnterWorktree ────────────────────────────────────────────────────────────

const enterInputSchema = z.object({
  branch: z.string().describe('Name of the new branch to create for the worktree'),
  base: z.string().optional().describe('Base branch/commit to start from (default: current HEAD)'),
})

type EnterInput = z.infer<typeof enterInputSchema>

export const EnterWorktreeTool: ToolDef<EnterInput, string> = {
  name: 'EnterWorktree',
  description:
    'Create an isolated git worktree on a new branch. All subsequent file operations will target this worktree directory, keeping the main working tree clean. ' +
    'Use when you want to work on a feature or experiment without touching the main branch. ' +
    'Returns the path of the new worktree. Call ExitWorktree when done.',
  inputSchema: enterInputSchema,

  async execute(input: EnterInput, context: ToolContext): Promise<ToolResult<string>> {
    if (!context.sessionState) {
      return { content: 'Worktree support is not available in this context.', isError: true }
    }
    if (context.sessionState.worktreePath) {
      return {
        content: `Already in a worktree at: ${context.sessionState.worktreePath}. Call ExitWorktree first.`,
        isError: true,
      }
    }

    // Verify we're in a git repo
    try {
      await git(['rev-parse', '--git-dir'], context.cwd)
    } catch {
      return { content: 'Not a git repository. EnterWorktree requires git.', isError: true }
    }

    // Create a temp directory for the worktree
    let worktreeDir: string
    try {
      worktreeDir = mkdtempSync(join(tmpdir(), 'tikat-worktree-'))
    } catch (err) {
      return { content: `Failed to create temp directory: ${String(err)}`, isError: true }
    }

    const branchArgs = input.base
      ? ['worktree', 'add', '-b', input.branch, worktreeDir, input.base]
      : ['worktree', 'add', '-b', input.branch, worktreeDir]

    try {
      await git(branchArgs, context.cwd)
    } catch (err) {
      // Clean up temp dir on failure
      try { rmSync(worktreeDir, { recursive: true, force: true }) } catch { /* ignore */ }
      return { content: `Failed to create worktree: ${String(err)}`, isError: true }
    }

    context.sessionState.worktreePath = worktreeDir
    context.sessionState.worktreeBranch = input.branch
    context.sessionState.worktreeMainCwd = context.cwd

    return {
      content:
        `✅ Entered worktree.\n` +
        `Branch: ${input.branch}\n` +
        `Path: ${worktreeDir}\n\n` +
        `Note: File operations should now target "${worktreeDir}" instead of the main working directory. ` +
        `Use absolute paths or paths relative to the worktree. ` +
        `Call ExitWorktree when done.`,
    }
  },
}

// ── ExitWorktree ─────────────────────────────────────────────────────────────

const exitInputSchema = z.object({
  merge: z
    .boolean()
    .optional()
    .describe('If true, merge the worktree branch into the original branch after cleanup (default: false)'),
  delete_branch: z
    .boolean()
    .optional()
    .describe('If true, delete the worktree branch after removing (default: false)'),
})

type ExitInput = z.infer<typeof exitInputSchema>

export const ExitWorktreeTool: ToolDef<ExitInput, string> = {
  name: 'ExitWorktree',
  description:
    'Remove the current git worktree and return to the main working directory. Optionally merge the worktree branch back into the original branch.',
  inputSchema: exitInputSchema,

  async execute(input: ExitInput, context: ToolContext): Promise<ToolResult<string>> {
    if (!context.sessionState?.worktreePath) {
      return { content: 'Not currently in a worktree.', isError: true }
    }

    const { worktreePath, worktreeBranch, worktreeMainCwd } = context.sessionState
    const lines: string[] = []

    // Optionally merge
    if (input.merge && worktreeBranch && worktreeMainCwd) {
      try {
        await git(['merge', worktreeBranch], worktreeMainCwd)
        lines.push(`✅ Merged "${worktreeBranch}" into current branch.`)
      } catch (err) {
        lines.push(`⚠️ Merge failed: ${String(err)}. Continuing with worktree removal.`)
      }
    }

    // Remove worktree
    const mainCwd = worktreeMainCwd ?? context.cwd
    try {
      await git(['worktree', 'remove', '--force', worktreePath], mainCwd)
      lines.push(`✅ Removed worktree: ${worktreePath}`)
    } catch {
      // Fallback: rm -rf then git worktree prune
      try {
        if (existsSync(worktreePath)) rmSync(worktreePath, { recursive: true, force: true })
        await git(['worktree', 'prune'], mainCwd)
        lines.push(`✅ Cleaned up worktree: ${worktreePath}`)
      } catch (err2) {
        lines.push(`⚠️ Could not fully remove worktree: ${String(err2)}`)
      }
    }

    // Optionally delete branch
    if (input.delete_branch && worktreeBranch) {
      try {
        await git(['branch', '-D', worktreeBranch], mainCwd)
        lines.push(`✅ Deleted branch: ${worktreeBranch}`)
      } catch (err) {
        lines.push(`⚠️ Could not delete branch "${worktreeBranch}": ${String(err)}`)
      }
    }

    // Clear state
    context.sessionState.worktreePath = undefined
    context.sessionState.worktreeBranch = undefined
    context.sessionState.worktreeMainCwd = undefined

    lines.push('Returned to main working directory.')
    return { content: lines.join('\n') }
  },
}

export function resolveWorktreePath(filePath: string, context: ToolContext): string {
  if (context.sessionState?.worktreePath && !isAbsolute(filePath)) {
    return join(context.sessionState.worktreePath, filePath)
  }
  return resolve(context.cwd, filePath)
}
