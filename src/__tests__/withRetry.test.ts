import { vi, describe, it, expect, afterEach } from 'vitest'
import { withRetry } from '../services/api/withRetry.js'

// Make retries instant: baseDelayMs=0 and jitter=0
afterEach(() => {
  vi.restoreAllMocks()
})

function retryableError(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status })
}

describe('withRetry', () => {
  it('succeeds on first attempt without retrying', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const fn = vi.fn(async () => 'ok')
    const result = await withRetry(fn, 3, 0)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on 429 and succeeds on second attempt', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    let calls = 0
    const fn = vi.fn(async () => {
      calls++
      if (calls === 1) throw retryableError(429)
      return 'ok'
    })
    const result = await withRetry(fn, 3, 0)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('retries on 503, succeeds on third attempt', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    let calls = 0
    const fn = vi.fn(async () => {
      calls++
      if (calls < 3) throw retryableError(503)
      return 'done'
    })
    const result = await withRetry(fn, 3, 0)
    expect(result).toBe('done')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws immediately on non-retryable error (400)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const fn = vi.fn(async () => { throw retryableError(400) })
    await expect(withRetry(fn, 3, 0)).rejects.toMatchObject({ status: 400 })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('throws last error after exhausting max retries', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const fn = vi.fn(async () => { throw retryableError(503) })
    await expect(withRetry(fn, 3, 0)).rejects.toMatchObject({ status: 503 })
    // 1 initial + 3 retries = 4 total calls
    expect(fn).toHaveBeenCalledTimes(4)
  })
})
