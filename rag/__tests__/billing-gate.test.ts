import { describe, it, expect } from "vitest";
import { resolveLimitForOwner } from "../../billingResolve.js";

const customers = [
  { id: "u1", email: "a@x.com", tier: "starter", messageLimit: 0 },
  { id: "u2", email: "b@x.com", tier: "pro", messageLimit: 5000 },
] as any[];

describe("resolveLimitForOwner", () => {
  it("dung messageLimit khi >0", () => expect(resolveLimitForOwner("u2", customers)).toBe(5000));
  it("rot ve PLAN_LIMITS theo tier khi messageLimit=0", () => expect(resolveLimitForOwner("u1", customers)).toBe(3000));
  it("khop theo email", () => expect(resolveLimitForOwner("b@x.com", customers)).toBe(5000));
  it("khong thay -> free 150", () => expect(resolveLimitForOwner("zzz", customers)).toBe(150));
});
