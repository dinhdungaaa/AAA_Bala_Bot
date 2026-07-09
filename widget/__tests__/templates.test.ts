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
    // greeting nhung THO qua jsEmbed (khong HTML-escape): "<" thanh escape unicode 003c,
    // hien thi qua textContent nen khach thay dung ky tu goc.
    expect(html).toContain("Chào \\u003cscript");
    expect(html).not.toContain("&lt;script&gt;");
  });
  it("chan </script> breakout voi moi gia tri nhung vao script", () => {
    const evil = buildFrameHtml({
      botId: "bot-</script><script>alert(0)</script>",
      widgetKey: 'wk"</script><script>alert(1)</script>',
      visitorId: "</script><script>alert(2)</script>",
      title: "Shop",
      color: "#123456",
      greeting: "</script><script>alert(3)</script>",
    });
    expect(evil).not.toContain("</script><script>");
    expect(evil).not.toContain("alert(1)</script>");
    // the </script> hop le duy nhat la the dong cua script noi tuyen
    expect(evil.split("</script>").length).toBe(2);
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
