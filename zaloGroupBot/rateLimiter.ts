export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private maxPerMinute: number) {}

  allow(groupId: string, now: number = Date.now()): boolean {
    const windowStart = now - 60_000;
    const arr = (this.hits.get(groupId) || []).filter((t) => t > windowStart);
    if (arr.length >= this.maxPerMinute) {
      this.hits.set(groupId, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(groupId, arr);
    return true;
  }
}
