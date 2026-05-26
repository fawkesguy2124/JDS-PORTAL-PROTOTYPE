interface CacheEntry<T> {
  data: T
  ts: number
}

export class MemoryCache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>()
  private readonly ttlMs: number
  private readonly maxSize: number

  constructor(ttlMs = 5 * 60 * 1000, maxSize = 500) {
    this.ttlMs = ttlMs
    this.maxSize = maxSize
    setInterval(() => this.evict(), 60_000)
  }

  get(key: string): T | null {
    const entry = this.store.get(key)
    if (!entry) return null
    if (Date.now() - entry.ts > this.ttlMs) {
      this.store.delete(key)
      return null
    }
    return entry.data
  }

  set(key: string, data: T): void {
    if (this.store.size >= this.maxSize) {
      const oldest = this.store.entries().next().value
      if (oldest) this.store.delete(oldest[0])
    }
    this.store.set(key, { data, ts: Date.now() })
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  getAll(): T[] {
    const now = Date.now()
    const results: T[] = []
    for (const [, entry] of this.store) {
      if (now - entry.ts <= this.ttlMs) results.push(entry.data)
    }
    return results
  }

  private evict(): void {
    const now = Date.now()
    for (const [key, entry] of this.store) {
      if (now - entry.ts > this.ttlMs) this.store.delete(key)
    }
  }
}

export const trackingCache = new MemoryCache<any>(5 * 60 * 1000, 500)
