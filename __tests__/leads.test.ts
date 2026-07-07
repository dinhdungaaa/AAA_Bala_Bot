import { describe, it, expect } from "vitest";
import { channelFromUserKey, formatLeadNotify } from "../leadHelpers.js";

describe("channelFromUserKey", () => {
  it("prefix → kênh", () => {
    expect(channelFromUserKey("botcake:123")).toBe("botcake");
    expect(channelFromUserKey("fb:123")).toBe("fb");
    expect(channelFromUserKey("123456")).toBe("telegram");
    expect(channelFromUserKey(undefined)).toBe("web");
  });
});

describe("formatLeadNotify", () => {
  it("đủ tên/sđt/quan tâm/kênh", () => {
    const msg = formatLeadNotify({ name: "Chị Lan", phone: "0912345678", interest: "son đỏ", channel: "botcake" } as any);
    expect(msg).toContain("Chị Lan");
    expect(msg).toContain("0912345678");
    expect(msg).toContain("son đỏ");
    expect(msg).toContain("botcake");
  });
  it("thiếu field không vỡ", () => {
    const msg = formatLeadNotify({ phone: "0912345678" } as any);
    expect(msg).toContain("0912345678");
  });
});
