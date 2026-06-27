import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as reg from "../sessionRegistry.js";

describe("zalo session registry", () => {
  beforeEach(() => { delete process.env.ZALO_MAX_SESSIONS; reg.__resetForTests(); });
  afterEach(() => { delete process.env.ZALO_MAX_SESSIONS; });

  it("getOrCreate returns same instance per owner", () => {
    const a1 = reg.getOrCreate("a@x.com");
    const a2 = reg.getOrCreate("a@x.com");
    expect(a1).toBe(a2);
    expect(a1.ownerEmail).toBe("a@x.com");
    expect(a1.loginState).toBe("needs_login");
  });

  it("sessions are isolated (separate dedup sets)", () => {
    const a = reg.getOrCreate("a@x.com");
    const b = reg.getOrCreate("b@x.com");
    a.recentBotMsgIds.add("m1");
    expect(b.recentBotMsgIds.has("m1")).toBe(false);
  });

  it("liveCount counts active/logging_in only", () => {
    reg.getOrCreate("a@x.com").loginState = "active";
    reg.getOrCreate("b@x.com").loginState = "logging_in";
    reg.getOrCreate("c@x.com").loginState = "needs_login";
    expect(reg.liveCount()).toBe(2);
  });

  it("atCapacity respects ZALO_MAX_SESSIONS", () => {
    process.env.ZALO_MAX_SESSIONS = "1";
    reg.getOrCreate("a@x.com").loginState = "active";
    expect(reg.atCapacity()).toBe(true);
  });

  it("remove deletes the session", () => {
    reg.getOrCreate("a@x.com");
    reg.remove("a@x.com");
    expect(reg.get("a@x.com")).toBeUndefined();
  });
});
