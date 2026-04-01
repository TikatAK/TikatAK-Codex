/**
 * Retry wrapper with exponential backoff.
 * Retries on rate limits (429) and transient server errors (500, 502, 503, 529).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      lastError = err
      const status = getStatusCode(err)

      const isRetryable =
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 529

      if (!isRetryable || attempt === maxRetries) {
        throw err
      }

      // Respect Retry-After header if present
      const retryAfterMs = getRetryAfterMs(err)
      const delay = retryAfterMs ?? baseDelayMs * Math.pow(2, attempt)
      await sleep(delay + jitter(500))
    }
  }

  throw lastError
}

function getStatusCode(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>
    if (typeof e['status'] === 'number') return e['status']
    const msg = String(e['message'] ?? '')
    const match = msg.match(/\b(4\d\d|5\d\d)\b/)
    if (match) return Number(match[1])
  }
  return undefined
}

function getRetryAfterMs(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>
    const headers = e['headers'] as Record<string, string> | undefined
    if (headers?.['retry-after']) {
      const seconds = Number(headers['retry-after'])
      if (!isNaN(seconds)) return seconds * 1000
    }
  }
  return undefined
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function jitter(maxMs: number): number {
  return Math.random() * maxMs
}
