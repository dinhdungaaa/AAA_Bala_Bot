import { describe, it, expect } from "vitest";
import {
  signOAuthState, verifyOAuthState, buildOAuthDialogUrl,
  verifyFacebookSignature, groupMessagingEventsByPage,
  randomToken, renderOAuthResultHtml, renderPageSelectionHtml,
} from "../facebookOauth.js";
import crypto from "node:crypto";

const SECRET = "test-secret";

describe("OAuth state", () => {
  it("ký rồi verify được, trả đúng botId", () => {
    const state = signOAuthState("bot-1", SECRET);
    const payload = verifyOAuthState(state, SECRET);
    expect(payload?.botId).toBe("bot-1");
  });

  it("từ chối state bị sửa nội dung", () => {
    const state = signOAuthState("bot-1", SECRET);
    const [body, sig] = state.split(".");
    const fakeBody = Buffer.from(JSON.stringify({ botId: "bot-EVIL", ts: Date.now(), nonce: "x" })).toString("base64url");
    expect(verifyOAuthState(`${fakeBody}.${sig}`, SECRET)).toBeNull();
  });

  it("từ chối state sai secret", () => {
    const state = signOAuthState("bot-1", "other-secret");
    expect(verifyOAuthState(state, SECRET)).toBeNull();
  });

  it("từ chối state quá 10 phút", () => {
    const past = Date.now() - 11 * 60 * 1000;
    const state = signOAuthState("bot-1", SECRET, past);
    expect(verifyOAuthState(state, SECRET)).toBeNull();
  });

  it("từ chối chuỗi rác", () => {
    expect(verifyOAuthState("not-a-state", SECRET)).toBeNull();
    expect(verifyOAuthState("", SECRET)).toBeNull();
  });
});

describe("buildOAuthDialogUrl", () => {
  it("chứa đủ client_id, redirect_uri, state, scope", () => {
    const url = buildOAuthDialogUrl({
      appId: "123", redirectUri: "https://x.vn/api/facebook-oauth/callback",
      state: "abc.def", graphVersion: "v25.0",
    });
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://www.facebook.com/v25.0/dialog/oauth");
    expect(u.searchParams.get("client_id")).toBe("123");
    expect(u.searchParams.get("redirect_uri")).toBe("https://x.vn/api/facebook-oauth/callback");
    expect(u.searchParams.get("state")).toBe("abc.def");
    expect(u.searchParams.get("scope")).toBe("pages_show_list,pages_messaging,pages_manage_metadata,pages_read_engagement");
  });
});

describe("verifyFacebookSignature", () => {
  it("chấp nhận chữ ký đúng", () => {
    const raw = Buffer.from('{"object":"page"}');
    const sig = "sha256=" + crypto.createHmac("sha256", SECRET).update(raw).digest("hex");
    expect(verifyFacebookSignature(raw, sig, SECRET)).toBe(true);
  });

  it("từ chối chữ ký sai / thiếu", () => {
    const raw = Buffer.from('{"object":"page"}');
    expect(verifyFacebookSignature(raw, "sha256=deadbeef", SECRET)).toBe(false);
    expect(verifyFacebookSignature(raw, undefined, SECRET)).toBe(false);
    expect(verifyFacebookSignature(undefined, "sha256=x", SECRET)).toBe(false);
  });
});

describe("groupMessagingEventsByPage", () => {
  it("gom event theo entry[].id", () => {
    const body = {
      object: "page",
      entry: [
        { id: "111", messaging: [{ m: 1 }, { m: 2 }] },
        { id: "222", messaging: [{ m: 3 }] },
        { id: "333", messaging: [] },
      ],
    };
    const groups = groupMessagingEventsByPage(body);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({ pageId: "111", events: [{ m: 1 }, { m: 2 }] });
    expect(groups[1].pageId).toBe("222");
  });

  it("trả rỗng khi không phải object=page", () => {
    expect(groupMessagingEventsByPage({ object: "user", entry: [{ id: "1", messaging: [{}] }] })).toEqual([]);
    expect(groupMessagingEventsByPage(null)).toEqual([]);
  });
});

describe("randomToken", () => {
  it("sinh chuỗi hex đủ dài, không trùng", () => {
    const a = randomToken(); const b = randomToken();
    expect(a).toMatch(/^[0-9a-f]{24}$/);
    expect(a).not.toBe(b);
  });
});

describe("render HTML", () => {
  it("result html chứa postMessage + escape nội dung", () => {
    const html = renderOAuthResultHtml({ success: true, message: 'Đã kết nối "<Page>"', pageName: "P" });
    expect(html).toContain("balabot-facebook-connected");
    expect(html).not.toContain("<Page>"); // đã escape
  });

  it("selection html render đủ radio cho từng page + hidden selectionId", () => {
    const html = renderPageSelectionHtml({
      selectionId: "sel1",
      pages: [{ id: "1", name: "Shop A" }, { id: "2", name: "Shop B" }],
      actionPath: "https://x.vn/api/facebook-oauth/select",
    });
    expect(html).toContain("Shop A");
    expect(html).toContain("Shop B");
    expect(html).toContain('value="sel1"');
    expect(html).toContain('action="https://x.vn/api/facebook-oauth/select"');
  });
});
