import { describe, it, expect } from "vitest";
import { parseBridgePayload, splitBridgeText, buildBridgeResponse } from "../botcakeBridge.js";

describe("parseBridgePayload", () => {
  it("đọc bộ trường chuẩn text/psid/name", () => {
    const p = parseBridgePayload({ text: " hello ", psid: "123", name: "Anh Dũng" });
    expect(p).toEqual({ text: "hello", psid: "123", fullName: "Anh Dũng" });
  });

  it("chấp nhận tên trường thay thế (message/sender_id/full_name)", () => {
    const p = parseBridgePayload({ message: "giá bao nhiêu", sender_id: "u9", full_name: "Chị Hoa" });
    expect(p).toEqual({ text: "giá bao nhiêu", psid: "u9", fullName: "Chị Hoa" });
  });

  it("chấp nhận last_input + messenger_user_id + first/last name ghép", () => {
    const p = parseBridgePayload({ last_input: "ship không", messenger_user_id: "m1", first_name: "Lan", last_name: "Trần" });
    expect(p.text).toBe("ship không");
    expect(p.psid).toBe("m1");
    expect(p.fullName).toBe("Lan Trần");
  });

  it("body rỗng/null → chuỗi rỗng, không throw", () => {
    expect(parseBridgePayload(null)).toEqual({ text: "", psid: "", fullName: "" });
    expect(parseBridgePayload({})).toEqual({ text: "", psid: "", fullName: "" });
  });

  it("giá trị không phải string (số, object) → ép về string an toàn hoặc bỏ qua", () => {
    const p = parseBridgePayload({ text: 123, psid: { a: 1 }, name: undefined });
    expect(p.text).toBe("123");
    expect(p.psid).toBe(""); // object không hợp lệ → bỏ
    expect(p.fullName).toBe("");
  });
});

describe("splitBridgeText", () => {
  it("tin ngắn → 1 phần tử nguyên vẹn", () => {
    expect(splitBridgeText("xin chào")).toEqual(["xin chào"]);
  });

  it("tin dài → cắt <= max, không mất nội dung", () => {
    const long = "Đoạn một. ".repeat(300); // ~3000 ký tự
    const parts = splitBridgeText(long, 1800);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(1800);
    expect(parts.join("")).toContain("Đoạn một.");
  });

  it("ưu tiên cắt tại xuống dòng/câu thay vì giữa từ", () => {
    const a = "A".repeat(1000) + "\n\n" + "B".repeat(1000);
    const parts = splitBridgeText(a, 1800);
    expect(parts[0].endsWith("A".repeat(10))).toBe(true);
    expect(parts[1].startsWith("B")).toBe(true);
  });

  it("chuỗi rỗng → mảng rỗng", () => {
    expect(splitBridgeText("")).toEqual([]);
    expect(splitBridgeText("   ")).toEqual([]);
  });
});

describe("buildBridgeResponse", () => {
  it("format Chatfuel/Botcake chuẩn", () => {
    expect(buildBridgeResponse("chào anh")).toEqual({ messages: [{ text: "chào anh" }] });
  });

  it("tin dài → nhiều messages", () => {
    const res = buildBridgeResponse("X. ".repeat(1000));
    expect(res.messages.length).toBeGreaterThan(1);
  });
});
