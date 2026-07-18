// __tests__/training-gate.test.ts
import { describe, it, expect } from "vitest";
import { TRAINING_LIMITS, usageVerdict } from "../billing.js";

describe("TRAINING_LIMITS", () => {
  it("gói cao > gói thấp cho cả examples và rules", () => {
    expect(TRAINING_LIMITS.pro.examples).toBeGreaterThan(TRAINING_LIMITS.free.examples);
    expect(TRAINING_LIMITS.pro.rules).toBeGreaterThan(TRAINING_LIMITS.free.rules);
    expect(TRAINING_LIMITS.enterprise.examples).toBeGreaterThan(TRAINING_LIMITS.business.examples);
    expect(TRAINING_LIMITS.enterprise.rules).toBeGreaterThan(TRAINING_LIMITS.business.rules);
  });
  it("verdict chặn khi vượt 110% hạn mức examples của gói free", () => {
    expect(usageVerdict(TRAINING_LIMITS.free.examples + 1, TRAINING_LIMITS.free.examples)).not.toBe("ok");
    expect(usageVerdict(6, 5)).toBe("blocked");
  });
  it("verdict chặn khi vượt 110% hạn mức rules của gói free", () => {
    expect(usageVerdict(TRAINING_LIMITS.free.rules + 1, TRAINING_LIMITS.free.rules)).not.toBe("ok");
  });
});
