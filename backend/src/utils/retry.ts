export interface RetryOptions {
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  onRetry?: (attempt: number, error: unknown) => void
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 1000, maxDelayMs = 10000, onRetry } = options

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxAttempts) throw err
      onRetry?.(attempt, err)
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw new Error('Unreachable')
}
