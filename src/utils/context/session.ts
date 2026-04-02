import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { platform, release } from 'os'

/**
 * Try to read a CLAUDE.md (or AGENTS.md) file from the given directory.
 * Returns the file content, or null if not found.
 */
export function readClaudeMd(cwd: string): string | null {
  for (const name of ['CLAUDE.md', 'AGENTS.md', '.claude.md']) {
    const filePath = join(cwd, name)
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, 'utf8').trim()
        if (content) return content
      } catch {
        // ignore
      }
    }
  }
  return null
}

/**
 * Gather git context: branch, latest commits.
 * Returns a formatted string or null if not a git repo.
 */
export function getGitContext(cwd: string): string | null {
  try {
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd, encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()

    const log = execFileSync(
      'git', ['log', '--oneline', '-5'],
      { cwd, encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim()

    const status = execFileSync(
      'git', ['status', '--short'],
      { cwd, encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim()

    const lines: string[] = [
      '# Git Context',
      `- Branch: ${branch}`,
    ]
    if (status) lines.push(`- Uncommitted changes:\n${status.split('\n').map(l => `  ${l}`).join('\n')}`)
    if (log) lines.push(`- Recent commits:\n${log.split('\n').map(l => `  ${l}`).join('\n')}`)

    return lines.join('\n')
  } catch {
    return null
  }
}

/**
 * Build environment context string (platform, date, Node version).
 */
export function getEnvContext(): string {
  const os = platform()
  const osLabel = os === 'win32' ? 'Windows' : os === 'darwin' ? 'macOS' : 'Linux'
  const date = new Date().toISOString().slice(0, 10)

  return [
    '# Environment',
    `- Platform: ${osLabel} (${os} ${release()})`,
    `- Node.js: ${process.version}`,
    `- Date: ${date}`,
    `- Shell: ${process.env['SHELL'] ?? (os === 'win32' ? 'cmd.exe / PowerShell' : 'bash')}`,
  ].join('\n')
}
