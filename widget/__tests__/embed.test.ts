import { describe, it, expect } from "vitest";
import {
  escapeWidgetHtml, isValidWidgetKey, isValidVisitorId, clampWidgetText,
  filterMessagesAfter, resolveWidgetConfig, buildEmbedSnippet,
} from "../embed.js";

describe("escapeWidgetHtml", () => {
  it("escape day du ky tu html", () => {
    expect(escapeWidgetHtml(`<img src=x onerror="a&b'c">`))
      .toBe("&lt;img src=x onerror=&quot;a&amp;b&#39;c&quot;&gt;");
  });
});

describe("isValidWidgetKey", () => {
  it("khop chinh xac moi cho qua", () => {
    expect(isValidWidgetKey("wk_abc", "wk_abc")).toBe(true);
    expect(isValidWidgetKey("wk_abc", "wk_xyz")).toBe(false);
  });
  it("bot chua bat widget (khong co key) -> tu choi ke ca khi given rong", () => {
    expect(isValidWidgetKey(undefined, "")).toBe(false);
    expect(isValidWidgetKey("", "")).toBe(false);
    expect(isValidWidgetKey(undefined, "wk_abc")).toBe(false);
  });
});

describe("isValidVisitorId", () => {
  it("chap nhan wv- + hex, tu choi rong/qua dai/ky tu la", () => {
    expect(isValidVisitorId("wv-a1b2c3d4e5f6")).toBe(true);
    expect(isValidVisitorId("abc")).toBe(false);
    expect(isValidVisitorId("x".repeat(65))).toBe(false);
    expect(isValidVisitorId("wv-<script>")).toBe(false);
    expect(isValidVisitorId(undefined)).toBe(false);
  });
});

describe("clampWidgetText", () => {
  it("trim + cat 2000 ky tu, khong phai string -> rong", () => {
    expect(clampWidgetText("  xin chào  ")).toBe("xin chào");
    expect(clampWidgetText("a".repeat(3000)).length).toBe(2000);
    expect(clampWidgetText(123 as any)).toBe("");
    expect(clampWidgetText(null)).toBe("");
  });
});

describe("filterMessagesAfter", () => {
  const msgs = [
    { sender: "user", text: "hỏi", timestamp: "2026-07-09T01:00:00.000Z" },
    { sender: "bot", text: "đáp", timestamp: "2026-07-09T01:00:05.000Z" },
    { sender: "agent", text: "người thật", timestamp: "2026-07-09T01:00:10.000Z" },
  ];
  it("khong co after -> tra het (toi da 50)", () => {
    expect(filterMessagesAfter(msgs)).toHaveLength(3);
  });
  it("after -> chi tin moi hon", () => {
    const out = filterMessagesAfter(msgs, "2026-07-09T01:00:05.000Z");
    expect(out).toEqual([{ sender: "agent", text: "người thật", timestamp: "2026-07-09T01:00:10.000Z" }]);
  });
  it("after rac -> coi nhu khong co", () => {
    expect(filterMessagesAfter(msgs, "not-a-date")).toHaveLength(3);
  });
  it("cat 50 tin cuoi + chi giu 3 field", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      sender: "bot", text: `t${i}`, timestamp: new Date(1700000000000 + i * 1000).toISOString(),
      sourcesUsed: [{ id: "x" }],
    }));
    const out = filterMessagesAfter(many as any);
    expect(out).toHaveLength(50);
    expect(out[49].text).toBe("t59");
    expect((out[0] as any).sourcesUsed).toBeUndefined();
  });
});

describe("resolveWidgetConfig", () => {
  it("fallback mac dinh khi bot chua tuy bien", () => {
    const c = resolveWidgetConfig({ name: "Shop Rau" });
    expect(c).toEqual({
      title: "Shop Rau",
      color: "#059669",
      greeting: "Dạ em chào anh/chị! Anh/chị cần em tư vấn gì ạ? 😊",
    });
  });
  it("dung gia tri da luu; mau sai format -> ve mac dinh", () => {
    const c = resolveWidgetConfig({ name: "X", widgetColor: "red", widgetTitle: "Tư vấn 24/7", widgetGreeting: "Chào bạn" });
    expect(c.color).toBe("#059669");
    expect(c.title).toBe("Tư vấn 24/7");
    expect(c.greeting).toBe("Chào bạn");
    expect(resolveWidgetConfig({ name: "X", widgetColor: "#FF00aa" }).color).toBe("#FF00aa");
  });
});

describe("buildEmbedSnippet", () => {
  it("dung format script tag", () => {
    expect(buildEmbedSnippet("https://antiantiai.xyz/balabot", "bot-1", "wk_9"))
      .toBe(`<script src="https://antiantiai.xyz/balabot/api/widget/loader.js" data-bot="bot-1" data-key="wk_9" async></script>`);
  });
});
