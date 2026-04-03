/**
 * Comprehensive functional test for all tools.
 * Run with: npx vitest run test-tools.mjs  (or via npm test)
 */

import { describe, it, expect, afterAll } from 'vitest'
import { join } from 'path'
import { mkdtempSync, rmSync, existsSync, unlinkSync } from 'fs'
import { tmpdir, homedir } from 'os'
import {
  BashTool, FileReadTool, FileEditTool, FileWriteTool,
  GrepTool, GlobTool, LSTool,
  AskUserTool, TodoWriteTool, TodoReadTool, TodoUpdateTool, TodoDeleteTool,
  EnterPlanModeTool, ExitPlanModeTool,
  CronCreateTool, CronDeleteTool, CronListTool,
  SkillTool, SkillListTool, SkillCreateTool,
  ALL_TOOLS,
} from '../tools/index.js'

const tmpDir = mkdtempSync(join(tmpdir(), 'tikat-test-'))
const ctx = () => ({ cwd: tmpDir, sessionState: { planMode: false } })

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  const testSkill = join(homedir(), '.tikat-codex', 'skills', 'test-skill.md')
  if (existsSync(testSkill)) unlinkSync(testSkill)
})

// ── Tool registration ────────────────────────────────────────────────────────
describe('Tool Registration', () => {
  const names = ALL_TOOLS.map(t => t.name)
  const expected = [
    'Bash', 'Read', 'Edit', 'Write', 'Grep', 'Glob', 'LS', 'WebFetch',
    'WebSearch', 'AskUser',
    'TodoWrite', 'TodoRead', 'TodoUpdate', 'TodoDelete',
    'EnterPlanMode', 'ExitPlanMode',
    'EnterWorktree', 'ExitWorktree',
    'CronCreate', 'CronDelete', 'CronList',
    'Skill', 'SkillList', 'SkillCreate',
    'SubAgent',
  ]
  for (const name of expected) {
    it(`registers ${name}`, () => expect(names).toContain(name))
  }
})

// ── File tools ───────────────────────────────────────────────────────────────
describe('File Tools', () => {
  it('FileWrite creates file', async () => {
    const r = await FileWriteTool.execute({ file_path: 'hello.txt', content: 'Hello World\n' }, ctx())
    expect(r.isError).toBeFalsy()
  })

  it('FileRead reads file', async () => {
    const r = await FileReadTool.execute({ file_path: join(tmpDir, 'hello.txt') }, ctx())
    expect(r.content).toContain('Hello World')
  })

  it('FileEdit replaces string', async () => {
    const r = await FileEditTool.execute(
      { file_path: join(tmpDir, 'hello.txt'), old_string: 'Hello World', new_string: 'Hello Tikat' },
      ctx(),
    )
    expect(r.isError).toBeFalsy()
    const read = await FileReadTool.execute({ file_path: join(tmpDir, 'hello.txt') }, ctx())
    expect(read.content).toContain('Hello Tikat')
  })

  it('Glob finds txt files', async () => {
    const r = await GlobTool.execute({ pattern: '*.txt', path: tmpDir }, ctx())
    expect(String(r.content)).toContain('hello.txt')
  })

  it('Grep finds pattern', async () => {
    const r = await GrepTool.execute({ pattern: 'Hello', path: tmpDir }, ctx())
    expect(r.isError).toBeFalsy()
  })

  it('LS lists directory', async () => {
    const r = await LSTool.execute({ path: tmpDir }, ctx())
    expect(r.content).toContain('hello.txt')
  })
})

// ── Bash ─────────────────────────────────────────────────────────────────────
describe('Bash', () => {
  it('executes command and returns output', async () => {
    const r = await BashTool.execute({ command: 'echo hello_bash' }, ctx())
    expect(r.content).toContain('hello_bash')
  })
})

// ── PlanMode ─────────────────────────────────────────────────────────────────
describe('PlanMode', () => {
  it('EnterPlanMode sets flag', async () => {
    const c = ctx()
    await EnterPlanModeTool.execute({}, c)
    expect(c.sessionState!.planMode).toBe(true)
  })

  it('Bash blocked in plan mode', async () => {
    const c = { cwd: tmpDir, sessionState: { planMode: true } }
    const r = await BashTool.execute({ command: 'echo blocked' }, c)
    expect(r.isError).toBe(true)
  })

  it('FileWrite blocked in plan mode', async () => {
    const c = { cwd: tmpDir, sessionState: { planMode: true } }
    const r = await FileWriteTool.execute({ file_path: 'blocked.txt', content: 'x' }, c)
    expect(r.isError).toBe(true)
  })

  it('FileEdit blocked in plan mode', async () => {
    const c = { cwd: tmpDir, sessionState: { planMode: true } }
    const r = await FileEditTool.execute(
      { file_path: join(tmpDir, 'hello.txt'), old_string: 'Hello', new_string: 'Blocked' },
      c,
    )
    expect(r.isError).toBe(true)
  })

  it('ExitPlanMode clears flag and unblocks Bash', async () => {
    const c = { cwd: tmpDir, sessionState: { planMode: true } }
    await ExitPlanModeTool.execute({}, c)
    expect(c.sessionState.planMode).toBe(false)
    const r = await BashTool.execute({ command: 'echo restored' }, c)
    expect(r.content).toContain('restored')
  })
})

// ── AskUser ──────────────────────────────────────────────────────────────────
describe('AskUser', () => {
  it('returns fallback when no askUser callback', async () => {
    const r = await AskUserTool.execute({ question: 'Test?' }, ctx())
    expect(r.isError).toBeFalsy()
    expect(r.content).toContain('not available')
  })

  it('calls askUser callback when provided', async () => {
    const c = { cwd: tmpDir, askUser: async () => 'test answer' }
    const r = await AskUserTool.execute({ question: 'What?' }, c)
    expect(r.content).toBe('test answer')
  })
})

// ── Todo CRUD ─────────────────────────────────────────────────────────────────
describe('Todo CRUD', () => {
  it('TodoWrite creates todos', async () => {
    const r = await TodoWriteTool.execute({
      todos: [
        { id: 'ft-1', content: 'Task one', status: 'pending', priority: 'high' },
        { id: 'ft-2', content: 'Task two', status: 'in_progress', priority: 'low' },
      ],
    }, ctx())
    expect(r.isError).toBeFalsy()
  })

  it('TodoRead lists todos', async () => {
    const r = await TodoReadTool.execute({}, ctx())
    expect(r.content).toContain('ft-1')
    expect(r.content).toContain('ft-2')
  })

  it('TodoUpdate changes status', async () => {
    await TodoUpdateTool.execute({ id: 'ft-1', status: 'completed' }, ctx())
    const r = await TodoReadTool.execute({}, ctx())
    expect(r.content).toMatch(/completed.*ft-1|ft-1.*completed/)
  })

  it('TodoDelete removes item', async () => {
    await TodoDeleteTool.execute({ id: 'ft-2' }, ctx())
    const r = await TodoReadTool.execute({}, ctx())
    expect(r.content).not.toContain('ft-2')
  })

  it('TodoDelete returns error for missing id', async () => {
    const r = await TodoDeleteTool.execute({ id: 'nonexistent-xyz' }, ctx())
    expect(r.isError).toBe(true)
  })
})

// ── Cron ─────────────────────────────────────────────────────────────────────
describe('Cron', () => {
  it('CronCreate saves job', async () => {
    const r = await CronCreateTool.execute(
      { id: 'ft-cron', schedule: '@every 1h', command: 'echo test' },
      ctx(),
    )
    expect(r.isError).toBeFalsy()
    expect(r.content).toContain('ft-cron')
  })

  it('CronList shows job', async () => {
    const r = await CronListTool.execute({}, ctx())
    expect(r.content).toContain('ft-cron')
  })

  it('CronCreate rejects duplicate id', async () => {
    const r = await CronCreateTool.execute(
      { id: 'ft-cron', schedule: '@every 1h', command: 'echo dup' },
      ctx(),
    )
    expect(r.isError).toBe(true)
  })

  it('CronCreate rejects invalid schedule', async () => {
    const r = await CronCreateTool.execute(
      { id: 'bad-sched', schedule: '* * * * *', command: 'echo x' },
      ctx(),
    )
    expect(r.isError).toBe(true)
  })

  it('CronDelete removes job', async () => {
    await CronDeleteTool.execute({ id: 'ft-cron' }, ctx())
    const r = await CronListTool.execute({}, ctx())
    expect(r.content).not.toContain('ft-cron')
  })
})

// ── Skill ─────────────────────────────────────────────────────────────────────
describe('Skill', () => {
  it('SkillCreate creates skill file', async () => {
    const r = await SkillCreateTool.execute(
      { name: 'test-skill', content: '# Test Skill\nStep 1. Step 2.' },
      ctx(),
    )
    expect(r.isError).toBeFalsy()
  })

  it('SkillList shows skill', async () => {
    const r = await SkillListTool.execute({}, ctx())
    expect(r.content).toContain('test-skill')
  })

  it('Skill runs with task', async () => {
    const r = await SkillTool.execute({ name: 'test-skill', task: 'demo' }, ctx())
    expect(r.content).toContain('Test Skill')
    expect(r.content).toContain('demo')
  })

  it('Skill returns error for missing skill', async () => {
    const r = await SkillTool.execute({ name: 'does-not-exist-xyz' }, ctx())
    expect(r.isError).toBe(true)
  })
})

