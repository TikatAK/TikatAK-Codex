/**
 * CronTool — lightweight scheduled task management.
 *
 * Jobs are persisted to ~/.tikat-codex/crons.json.
 * At startup (when the REPL loads), saved jobs are re-registered.
 * Execution uses Node's `setInterval` / `setTimeout` rather than a native
 * cron daemon so no external dependency is required.
 *
 * Cron expression support:
 *   - Simplified "every N seconds/minutes/hours/days" syntax:
 *       "@every 30s"  |  "@every 5m"  |  "@every 1h"  |  "@every 2d"
 *   - Fixed schedule shortcuts:
 *       "@hourly"  |  "@daily"  |  "@weekly"
 *   - These cover the most common agent use-cases without a full cron parser.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { homedir } from 'os'
import { z } from 'zod'
import type { ToolDef, ToolContext, ToolResult } from '../base.js'
import { IS_WINDOWS } from '../../utils/platform.js'
import { readJson, writeJson } from '../../utils/jsonStorage.js'

const execFileAsync = promisify(execFile)
const CRON_FILE = join(homedir(), '.tikat-codex', 'crons.json')

// ── Storage ──────────────────────────────────────────────────────────────────

interface CronJob {
  id: string
  schedule: string
  command: string
  cwd: string
  description?: string
  createdAt: string
  lastRun?: string
  runCount: number
}

function readJobs(): CronJob[] {
  return readJson<CronJob[]>(CRON_FILE, [])
}

function writeJobs(jobs: CronJob[]): void {
  writeJson(CRON_FILE, jobs)
}

// ── Schedule parsing ─────────────────────────────────────────────────────────

function parseScheduleMs(schedule: string): number | null {
  const s = schedule.trim().toLowerCase()
  if (s === '@hourly')  return 3600 * 1000
  if (s === '@daily')   return 86400 * 1000
  if (s === '@weekly')  return 7 * 86400 * 1000
  const m = s.match(/^@every\s+(\d+)(s|m|h|d)$/)
  if (!m) return null
  const n = parseInt(m[1]!, 10)
  const unit = m[2]!
  const mult: Record<string, number> = { s: 1000, m: 60_000, h: 3600_000, d: 86400_000 }
  return n * (mult[unit] ?? 0)
}

// ── In-memory registry of active timers ──────────────────────────────────────

const activeTimers = new Map<string, ReturnType<typeof setInterval>>()

async function runJob(job: CronJob): Promise<void> {
  const jobs = readJobs()
  const idx = jobs.findIndex(j => j.id === job.id)
  if (idx === -1) return // Job was deleted

  jobs[idx]!.lastRun = new Date().toISOString()
  jobs[idx]!.runCount++
  writeJobs(jobs)

  const shell = IS_WINDOWS ? 'cmd.exe' : 'bash'
  const shellArg = IS_WINDOWS ? '/c' : '-c'
  try {
    await execFileAsync(shell, [shellArg, job.command], { cwd: job.cwd, timeout: 60_000 })
  } catch {
    // Silently swallow errors — job continues on schedule
  }
}

export function startJob(job: CronJob): boolean {
  const ms = parseScheduleMs(job.schedule)
  if (!ms) return false
  if (activeTimers.has(job.id)) return true // already running
  const timer = setInterval(() => void runJob(job), ms)
  // Allow Node to exit even if timers are still running
  if (timer.unref) timer.unref()
  activeTimers.set(job.id, timer)
  return true
}

export function stopJob(id: string): void {
  const timer = activeTimers.get(id)
  if (timer) {
    clearInterval(timer)
    activeTimers.delete(id)
  }
}

/** Re-register all saved cron jobs (call once at startup) */
export function restoreJobs(cwd: string): void {
  const jobs = readJobs()
  for (const job of jobs) {
    startJob({ ...job, cwd: job.cwd || cwd })
  }
}

// ── CronCreate ────────────────────────────────────────────────────────────────

const createInputSchema = z.object({
  id: z.string().describe('Unique identifier for this job (e.g. "backup", "health-check")'),
  schedule: z
    .string()
    .describe(
      'Schedule expression. Supported: "@every 30s", "@every 5m", "@every 1h", "@every 2d", "@hourly", "@daily", "@weekly"',
    ),
  command: z.string().describe('Shell command to run on schedule'),
  description: z.string().optional().describe('Human-readable description of what this job does'),
})

type CreateInput = z.infer<typeof createInputSchema>

export const CronCreateTool: ToolDef<CreateInput, string> = {
  name: 'CronCreate',
  description:
    'Create a recurring scheduled task that runs a shell command on a schedule. ' +
    'Jobs persist across sessions. Supported schedules: "@every 30s", "@every 5m", "@every 1h", "@every 2d", "@hourly", "@daily", "@weekly".',
  inputSchema: createInputSchema,

  async execute(input: CreateInput, context: ToolContext): Promise<ToolResult<string>> {
    const ms = parseScheduleMs(input.schedule)
    if (!ms) {
      return {
        content:
          `Invalid schedule: "${input.schedule}". ` +
          'Use: "@every 30s", "@every 5m", "@every 1h", "@every 2d", "@hourly", "@daily", "@weekly"',
        isError: true,
      }
    }

    const jobs = readJobs()
    if (jobs.find(j => j.id === input.id)) {
      return { content: `A cron job with id "${input.id}" already exists. Delete it first with CronDelete.`, isError: true }
    }

    const job: CronJob = {
      id: input.id,
      schedule: input.schedule,
      command: input.command,
      cwd: context.cwd,
      description: input.description,
      createdAt: new Date().toISOString(),
      runCount: 0,
    }
    jobs.push(job)
    writeJobs(jobs)
    startJob(job)

    const intervalSec = ms / 1000
    const readableInterval =
      intervalSec >= 86400 ? `${intervalSec / 86400}d`
      : intervalSec >= 3600 ? `${intervalSec / 3600}h`
      : intervalSec >= 60   ? `${intervalSec / 60}m`
      : `${intervalSec}s`

    return {
      content:
        `✅ Cron job "${input.id}" created.\n` +
        `Schedule: ${input.schedule} (every ${readableInterval})\n` +
        `Command: ${input.command}\n` +
        (input.description ? `Description: ${input.description}` : ''),
    }
  },
}

// ── CronDelete ────────────────────────────────────────────────────────────────

const deleteInputSchema = z.object({
  id: z.string().describe('ID of the cron job to delete'),
})

type DeleteInput = z.infer<typeof deleteInputSchema>

export const CronDeleteTool: ToolDef<DeleteInput, string> = {
  name: 'CronDelete',
  description: 'Delete a scheduled cron job by ID. Stops it immediately and removes it from storage.',
  inputSchema: deleteInputSchema,

  async execute(input: DeleteInput, _context: ToolContext): Promise<ToolResult<string>> {
    const jobs = readJobs()
    const idx = jobs.findIndex(j => j.id === input.id)
    if (idx === -1) {
      return { content: `Cron job not found: "${input.id}"`, isError: true }
    }
    jobs.splice(idx, 1)
    writeJobs(jobs)
    stopJob(input.id)
    return { content: `✅ Deleted cron job "${input.id}".` }
  },
}

// ── CronList ──────────────────────────────────────────────────────────────────

export const CronListTool: ToolDef<Record<never, never>, string> = {
  name: 'CronList',
  description: 'List all scheduled cron jobs with their schedule, command, and last run time.',
  inputSchema: z.object({}),

  async execute(_input, _context): Promise<ToolResult<string>> {
    const jobs = readJobs()
    if (jobs.length === 0) return { content: 'No cron jobs configured.' }
    const lines = jobs.map(j => {
      const active = activeTimers.has(j.id) ? '▶' : '⏸'
      const last = j.lastRun ? new Date(j.lastRun).toLocaleString() : 'never'
      return [
        `${active} [${j.id}] ${j.schedule}`,
        `   Command: ${j.command}`,
        `   Last run: ${last}  |  Run count: ${j.runCount}`,
        j.description ? `   ${j.description}` : '',
      ].filter(Boolean).join('\n')
    })
    return { content: lines.join('\n\n') }
  },
}
