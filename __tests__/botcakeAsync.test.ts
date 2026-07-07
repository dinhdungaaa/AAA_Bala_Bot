import { describe, it, expect } from "vitest";
import { buildSendContentRequest, splitContentText } from "../botcakeAsync.js";

describe("buildSendContentRequest", () => {
  const base = { pageId: "P1", accessToken: "TOK", psid: "28087514047518474", text: "Chào bạn" };

  it("URL đúng endpoint send_content theo pageId", () => {
    const r = buildSendContentRequest(base);
    expect(r.url).toBe("https://botcake.io/api/public_api/v1/pages/P1/flows/send_content");
  });

  it("header access-token + content-type", () => {
    const r = buildSendContentRequest(base);
    expect(r.headers["access-token"]).toBe("TOK");
    expect(r.headers["Content-Type"]).toBe("application/json");
  });

  it("body có psid + data.version v2 + content.messages dạng text", () => {
    const r = buildSendContentRequest(base);
    const parsed = JSON.parse(r.body);
    expect(parsed.psid).toBe("28087514047518474");
    expect(parsed.data.version).toBe("v2");
    expect(parsed.data.content.messages).toEqual([{ type: "text", text: "Chào bạn" }]);
  });

  it("psid GIỮ chuỗi để không mất độ chính xác (dài > MAX_SAFE_INTEGER)", () => {
    const r = buildSendContentRequest(base);
    expect(typeof JSON.parse(r.body).psid).toBe("string");
    expect(r.body).toContain('"psid":"28087514047518474"');
  });

  it("encode pageId vào URL an toàn", () => {
    const r = buildSendContentRequest({ ...base, pageId: "a/b?c" });
    expect(r.url).toContain("pages/a%2Fb%3Fc/flows/send_content");
  });

  it("text dài bị cắt thành nhiều message text", () => {
    const long = "a".repeat(4000);
    const r = buildSendContentRequest({ ...base, text: long });
    const msgs = JSON.parse(r.body).data.content.messages;
    expect(msgs.length).toBeGreaterThan(1);
    for (const m of msgs) {
      expect(m.type).toBe("text");
      expect(m.text.length).toBeLessThanOrEqual(1800);
    }
  });
});

describe("splitContentText", () => {
  it("text rỗng → mảng rỗng (không tạo tin trống)", () => {
    expect(splitContentText("")).toEqual([]);
    expect(splitContentText("   ")).toEqual([]);
  });

  it("text ngắn → 1 đoạn", () => {
    expect(splitContentText("xin chào")).toEqual(["xin chào"]);
  });

  it("ưu tiên cắt ở xuống dòng khi nằm trong nửa sau", () => {
    const t = "A".repeat(1000) + "\n" + "B".repeat(1500);
    const parts = splitContentText(t, 1800);
    expect(parts[0]).toBe("A".repeat(1000));
    expect(parts[1]).toBe("B".repeat(1500));
  });
});
