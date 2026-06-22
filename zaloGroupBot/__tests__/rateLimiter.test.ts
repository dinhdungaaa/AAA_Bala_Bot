import { describe, it, expect } from "vitest";
import { RateLimiter } from "../rateLimiter.js";

describe("RateLimiter", () => {
  it("cho phep toi da N tin trong 60s roi chan", () => {
    const rl = new RateLimiter(2);
    const t = 1_000_000;
    expect(rl.allow("g1", t)).toBe(true);
    expect(rl.allow("g1", t + 1)).toBe(true);
    expect(rl.allow("g1", t + 2)).toBe(false); // qua gioi han
  });
  it("reset sau 60s", () => {
    const rl = new RateLimiter(1);
    const t = 1_000_000;
    expect(rl.allow("g1", t)).toBe(true);
    expect(rl.allow("g1", t + 500)).toBe(false);
    expect(rl.allow("g1", t + 60_001)).toBe(true);
  });
  it("dem doc lap theo tung group", () => {
    const rl = new RateLimiter(1);
    const t = 1_000_000;
    expect(rl.allow("g1", t)).toBe(true);
    expect(rl.allow("g2", t)).toBe(true);
  });
});
