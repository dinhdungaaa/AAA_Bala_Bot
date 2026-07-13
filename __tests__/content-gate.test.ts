// __tests__/content-gate.test.ts
import { describe, it, expect } from "vitest";
import { CONTENT_LIMITS } from "../billing.js";
import { usageVerdict } from "../billing.js";

describe("CONTENT_LIMITS", () => {
  it("gói cao > gói thấp", () => {
    expect(CONTENT_LIMITS.pro).toBeGreaterThan(CONTENT_LIMITS.free);
    expect(CONTENT_LIMITS.enterprise).toBeGreaterThan(CONTENT_LIMITS.business);
  });
  it("verdict chặn khi vượt 110% hạn mức content", () => {
    expect(usageVerdict(CONTENT_LIMITS.free + 1, CONTENT_LIMITS.free)).not.toBe("ok");
    expect(usageVerdict(6, 5)).toBe("blocked"); // 6/5 = 120%
  });
});
