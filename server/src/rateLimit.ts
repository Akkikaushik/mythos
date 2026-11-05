/** Simple in-memory token bucket keyed by an arbitrary string (user id, IP, ...). */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; updated: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
  ) {}

  take(key: string, now = Date.now()): boolean {
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.capacity, updated: now };
      this.buckets.set(key, b);
    }
    b.tokens = Math.min(this.capacity, b.tokens + ((now - b.updated) / 1000) * this.refillPerSec);
    b.updated = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    if (this.buckets.size > 10_000) this.prune(now);
    return true;
  }

  private prune(now: number) {
    for (const [k, b] of this.buckets) {
      if (now - b.updated > 10 * 60_000) this.buckets.delete(k);
    }
  }
}
