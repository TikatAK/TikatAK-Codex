import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const GITHUB_RAW_URL =
  'https://raw.githubusercontent.com/TikatAK/Tikat-Codex/master/package.json'
const GITHUB_REPO = 'TikatAK/Tikat-Codex'
const CHECK_TIMEOUT_MS = 5000

export interface UpdateInfo {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string
  repoUrl: string
}

/** Compare two semver strings. Returns true if b > a */
function isNewer(a: string, b: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number)
  const [aMajor = 0, aMinor = 0, aPatch = 0] = parse(a)
  const [bMajor = 0, bMinor = 0, bPatch = 0] = parse(b)
  if (bMajor !== aMajor) return bMajor > aMajor
  if (bMinor !== aMinor) return bMinor > aMinor
  return bPatch > aPatch
}

/**
 * Fetch the latest version from GitHub (non-throwing).
 * Returns null on any network / parse error.
 */
export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS)
    const res = await fetch(GITHUB_RAW_URL, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const pkg = await res.json() as { version?: string }
    return typeof pkg.version === 'string' ? pkg.version : null
  } catch {
    return null
  }
}

/**
 * Check if a newer version is available on GitHub.
 * Never throws — silently returns no-update on errors.
 */
export async function checkForUpdates(currentVersion: string): Promise<UpdateInfo> {
  const latestVersion = await fetchLatestVersion()
  return {
    hasUpdate: latestVersion !== null && isNewer(currentVersion, latestVersion),
    currentVersion,
    latestVersion: latestVersion ?? currentVersion,
    repoUrl: `https://github.com/${GITHUB_REPO}`,
  }
}

/**
 * Install the latest version from GitHub globally.
 * Returns { ok, deferred?, error }.
 *
 * On Windows the current Node process holds dist/cli.js open, so npm cannot
 * overwrite it while we are running (EPERM / errno -4048).
 * Fix: spawn the install as a fully detached background process that starts
 * after a 3-second delay (giving the current process time to exit and release
 * the file locks), then exit immediately.
 */
export async function performUpdate(): Promise<{ ok: boolean; deferred?: boolean; error?: string }> {
  const isWindows = process.platform === 'win32'
  try {
    if (isWindows) {
      const { spawn } = await import('child_process')
      // Use cmd.exe /c so that && chaining works without shell:true quirks.
      const child = spawn(
        'cmd.exe',
        ['/c', `timeout /t 3 /nobreak > nul && npm install -g github:${GITHUB_REPO}`],
        { detached: true, stdio: 'ignore', shell: false },
      )
      child.unref()
      return { ok: true, deferred: true }
    } else {
      await execFileAsync('npm', ['install', '-g', `github:${GITHUB_REPO}`], {
        timeout: 120_000,
      })
      return { ok: true }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
