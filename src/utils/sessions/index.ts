import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { AnthropicMessage } from '../../adapters/openai/index.js'

const CONFIG_DIR = join(homedir(), '.tikatak-codex')
const SESSIONS_DIR = join(CONFIG_DIR, 'sessions')
const MAX_SESSIONS = 20

export interface SessionMeta {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount: number
  model?: string
}

export interface Session extends SessionMeta {
  history: AnthropicMessage[]
}

function ensureSessionsDir(): void {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true, mode: 0o700 })
  }
}

function sessionFile(id: string): string {
  return join(SESSIONS_DIR, `${id}.json`)
}

/** Generate a simple time-based session ID */
function generateId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

/** Derive a short title from the first user message */
function deriveTitle(history: AnthropicMessage[]): string {
  const first = history.find(m => m.role === 'user')
  if (!first) return '新对话'
  const content = typeof first.content === 'string' ? first.content : '新对话'
  return content.slice(0, 40) + (content.length > 40 ? '…' : '')
}

/** Save (create or update) a session */
export function saveSession(
  id: string | null,
  history: AnthropicMessage[],
  model?: string,
): SessionMeta {
  ensureSessionsDir()
  const now = new Date().toISOString()
  const sessionId = id ?? generateId()
  const filePath = sessionFile(sessionId)

  let createdAt = now
  if (id && existsSync(filePath)) {
    try {
      const existing = JSON.parse(readFileSync(filePath, 'utf8')) as Session
      createdAt = existing.createdAt
    } catch { /* use now */ }
  }

  const meta: SessionMeta = {
    id: sessionId,
    title: deriveTitle(history),
    createdAt,
    updatedAt: now,
    messageCount: history.length,
    model,
  }
  const session: Session = { ...meta, history }
  writeFileSync(filePath, JSON.stringify(session, null, 2), { encoding: 'utf8', mode: 0o600 })
  pruneOldSessions()
  return meta
}

/** Load a session by ID */
export function loadSession(id: string): Session | null {
  const filePath = sessionFile(id)
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as Session
  } catch {
    return null
  }
}

/** List all sessions sorted by updatedAt desc */
export function listSessions(): SessionMeta[] {
  if (!existsSync(SESSIONS_DIR)) return []
  const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'))
  const sessions: SessionMeta[] = []
  for (const file of files) {
    try {
      const raw = JSON.parse(readFileSync(join(SESSIONS_DIR, file), 'utf8')) as Session
      sessions.push({
        id: raw.id,
        title: raw.title,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        messageCount: raw.messageCount,
        model: raw.model,
      })
    } catch { /* skip corrupt */ }
  }
  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** Delete a session by ID */
export function deleteSession(id: string): boolean {
  const filePath = sessionFile(id)
  if (!existsSync(filePath)) return false
  try { unlinkSync(filePath); return true } catch { return false }
}

function pruneOldSessions(): void {
  const sessions = listSessions()
  if (sessions.length <= MAX_SESSIONS) return
  for (const s of sessions.slice(MAX_SESSIONS)) {
    deleteSession(s.id)
  }
}
