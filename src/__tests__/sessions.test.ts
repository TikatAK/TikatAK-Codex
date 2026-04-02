import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'path'
import fs from 'fs'

// vi.hoisted runs before module imports — gives us a stable temp path for the mock
// NOTE: cannot use `path` module here since it hasn't been imported yet
const TEST_HOME = vi.hoisted(() => {
  const tmp = process.env['TEMP'] ?? process.env['TMPDIR'] ?? process.env['TMP'] ?? '/tmp'
  const sep = process.platform === 'win32' ? '\\' : '/'
  return `${tmp}${sep}tikatak-test-home-${process.pid}`
})

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>()
  return {
    ...actual,
    homedir: () => TEST_HOME,
    default: { ...actual, homedir: () => TEST_HOME },
  }
})

// Dynamic import AFTER mocks are registered so sessions picks up the mocked homedir
const { saveSession, loadSession, listSessions, deleteSession } =
  await import('../utils/sessions/index.js')

import type { AnthropicMessage } from '../adapters/openai/index.js'

const msg = (content: string): AnthropicMessage => ({ role: 'user', content })

afterAll(() => {
  // Clean up the temp directory
  const sessionsDir = path.join(TEST_HOME, '.Tikat-Codex', 'sessions')
  if (fs.existsSync(sessionsDir)) {
    fs.rmSync(sessionsDir, { recursive: true, force: true })
  }
  const configDir = path.join(TEST_HOME, '.Tikat-Codex')
  if (fs.existsSync(configDir)) {
    fs.rmSync(configDir, { recursive: true, force: true })
  }
})

describe('sessions', () => {
  it('saveSession creates a new file and returns correct SessionMeta', () => {
    const meta = saveSession(null, [msg('hello')], 'gpt-4')
    expect(meta.id).toBeTruthy()
    expect(meta.messageCount).toBe(1)
    expect(meta.model).toBe('gpt-4')
    expect(meta.title).toBe('hello')
    const sessionsDir = path.join(TEST_HOME, '.Tikat-Codex', 'sessions')
    expect(fs.existsSync(path.join(sessionsDir, `${meta.id}.json`))).toBe(true)
  })

  it('loadSession reads back the saved session', () => {
    const history = [msg('load test')]
    const meta = saveSession(null, history)
    const loaded = loadSession(meta.id)
    expect(loaded).not.toBeNull()
    expect(loaded!.history).toEqual(history)
    expect(loaded!.id).toBe(meta.id)
  })

  it('listSessions returns sessions sorted by updatedAt desc', async () => {
    // Save two sessions with a brief time gap
    const meta1 = saveSession(null, [msg('first')])
    await new Promise(r => setTimeout(r, 10))
    const meta2 = saveSession(null, [msg('second')])
    const list = listSessions()
    const ids = list.map(s => s.id)
    expect(ids.indexOf(meta2.id)).toBeLessThan(ids.indexOf(meta1.id))
  })

  it('deleteSession removes the file; loadSession returns null afterwards', () => {
    const meta = saveSession(null, [msg('to delete')])
    expect(loadSession(meta.id)).not.toBeNull()
    const deleted = deleteSession(meta.id)
    expect(deleted).toBe(true)
    expect(loadSession(meta.id)).toBeNull()
  })

  it('saveSession with same id updates rather than creates a new file', () => {
    const first = saveSession(null, [msg('original')])
    const sessionsDir = path.join(TEST_HOME, '.Tikat-Codex', 'sessions')
    const filesBefore = fs.readdirSync(sessionsDir).length

    const updated = saveSession(first.id, [msg('updated1'), msg('updated2')])
    const filesAfter = fs.readdirSync(sessionsDir).length

    expect(filesAfter).toBe(filesBefore)
    expect(updated.id).toBe(first.id)
    expect(updated.messageCount).toBe(2)
    expect(updated.createdAt).toBe(first.createdAt)
  })

  it('pruneOldSessions auto-deletes when > 20 sessions exist', () => {
    // Save 25 sessions
    for (let i = 0; i < 25; i++) {
      saveSession(null, [msg(`prune test ${i}`)])
    }
    const list = listSessions()
    expect(list.length).toBeLessThanOrEqual(20)
  })
})
