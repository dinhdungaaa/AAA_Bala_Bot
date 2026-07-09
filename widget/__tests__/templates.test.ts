// widget/__tests__/templates.test.ts
import { describe, it, expect } from "vitest";
import { buildLoaderJs } from "../loaderJs.js";
import { buildFrameHtml } from "../frameHtml.js";

describe("buildLoaderJs", () => {
  const js = buildLoaderJs();
  it("doc data-bot/data-key tu currentScript va co visitor localStorage", () => {
    expect(js).toContain("document.currentScript");
    expect(js).toContain("data-bot");
    expect(js).toContain("balabot-visitor-");
    expect(js).toContain("localStorage");
  });
  it("goi config truoc khi ve nut, 403 thi khong ve", () => {
    expect(js).toContain("/config?key=");
    expect(js).toMatch(/ok\s*\)|status/);
  });
  it("khong co backtick tho gay vo template khi nhung", () => {
    expect(js.includes("`")).toBe(false);
  });
});

describe("buildFrameHtml", () => {
  const html = buildFrameHtml({
    botId: "bot-1", widgetKey: "wk_9", visitorId: "wv-abc123",
    title: `Shop "A" <b>`, color: "#123456", greeting: "Chào <script>",
  });
  it("escape title/greeting (khong XSS)", () => {
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("Chào <script>");
    expect(html).toContain("&lt;b&gt;");
  });
  it("nhung dung endpoint chat/messages + polling 5000ms", () => {
    expect(html).toContain("/api/widget/bot-1/chat");
    expect(html).toContain("/api/widget/bot-1/messages");
    expect(html).toContain("5000");
  });
  it("dung mau da cau hinh", () => {
    expect(html).toContain("#123456");
  });
});
