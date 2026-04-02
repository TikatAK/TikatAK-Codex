import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const GITHUB_REPO = 'TikatAK/Tikat-Codex'
const GITHUB_RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
const GITHUB_RAW_URL =
  'https://raw.githubusercontent.com/TikatAK/Tikat-Codex/master/package.json'
const CHECK_TIMEOUT_MS = 8000

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

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'tikat-codex-updater' },
    })
    return res
  } finally {
    clearTimeout(timer)
  }
}

interface ReleaseInfo {
  version: string
  tarballUrl: string
}

/**
 * Fetch the latest release info from GitHub Releases API.
 * Returns null on any network / parse error.
 */
export async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const res = await fetchWithTimeout(GITHUB_RELEASES_API)
    if (!res.ok) return null
    const data = await res.json() as {
      tag_name?: string
      assets?: Array<{ name: string; browser_download_url: string }>
    }
    const tag = data.tag_name
    if (!tag) return null
    const version = tag.replace(/^v/, '')
    // Find the .tgz asset
    const tgzAsset = data.assets?.find(a => a.name.endsWith('.tgz'))
    if (!tgzAsset) {
      // Fallback: construct the expected URL from the tag
      const tarballUrl = `https://github.com/${GITHUB_REPO}/releases/download/${tag}/tikat-codex-${version}.tgz`
      return { version, tarballUrl }
    }
    return { version, tarballUrl: tgzAsset.browser_download_url }
  } catch {
    return null
  }
}

/**
 * Fetch the latest version string (from package.json on master, as a fast fallback).
 * Returns null on any network / parse error.
 */
export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(GITHUB_RAW_URL)
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
 * Install the latest version from GitHub Releases (tarball) globally.
 * Returns { ok, deferred?, error }.
 *
 * Uses Release tarball instead of `github:` shorthand to avoid the npm 11+
 * Junction/symlink bug where the tmp directory is cleaned up after install,
 * leaving dist/cli.js unreachable.
 *
 * On Windows: spawns the install as a detached background process (3s delay)
 * so the current process can exit first and release the file lock on cli.js.
 */
export async function performUpdate(): Promise<{ ok: boolean; deferred?: boolean; error?: string }> {
  const release = await fetchLatestRelease()
  if (!release) {
    return { ok: false, error: 'Failed to fetch latest release info from GitHub' }
  }

  const { tarballUrl } = release
  const isWindows = process.platform === 'win32'

  try {
    if (isWindows) {
      const { spawn } = await import('child_process')
      const child = spawn(
        'cmd.exe',
        ['/c', `timeout /t 3 /nobreak > nul && npm install -g "${tarballUrl}"`],
        { detached: true, stdio: 'ignore', shell: false },
      )
      child.unref()
      return { ok: true, deferred: true }
    } else {
      await execFileAsync('npm', ['install', '-g', tarballUrl], {
        timeout: 120_000,
      })
      return { ok: true }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
