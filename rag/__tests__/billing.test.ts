import { describe, it, expect } from "vitest";
import { usageVerdict, currentYearMonth, PLAN_LIMITS } from "../../billing.js";

describe("usageVerdict", () => {
  it("ok khi duoi 80%", () => expect(usageVerdict(79, 100)).toBe("ok"));
  it("warn khi >=80% va <110%", () => {
    expect(usageVerdict(80, 100)).toBe("warn");
    expect(usageVerdict(109, 100)).toBe("warn");
  });
  it("blocked khi >=110% (het an han)", () => {
    expect(usageVerdict(110, 100)).toBe("blocked");
    expect(usageVerdict(999, 100)).toBe("blocked");
  });
  it("limit 0 hoac am -> ok (khong chan)", () => expect(usageVerdict(50, 0)).toBe("ok"));
});

describe("currentYearMonth", () => {
  it("dinh dang YYYY-MM theo UTC+7", () => {
    // 2026-06-30 23:00 UTC = 2026-07-01 06:00 UTC+7 -> thang 07
    expect(currentYearMonth(new Date("2026-06-30T23:00:00Z"))).toBe("2026-07");
    expect(currentYearMonth(new Date("2026-06-30T16:00:00Z"))).toBe("2026-06");
  });
});

describe("PLAN_LIMITS", () => {
  it("co du 5 goi voi messages hop le", () => {
    for (const t of ["free", "starter", "pro", "business", "enterprise"] as const) {
      expect(typeof PLAN_LIMITS[t].messages).toBe("number");
    }
    expect(PLAN_LIMITS.free.messages).toBe(150);
  });
});
