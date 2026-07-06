# Kết nối Fanpage Facebook 1 chạm (OAuth) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khách bấm "Kết nối Facebook" → popup OAuth → chọn Fanpage → bot tự kết nối, thay luồng dán Page Access Token thủ công.

**Architecture:** Helpers thuần (state HMAC, verify chữ ký, group event theo Page) tách ra `facebookOauth.ts` root-level (pattern như `billing.ts`) để unit-test được; server.ts thêm 3 route OAuth + 1 webhook chung route theo Page ID, tái dùng logic connect/subscribe sẵn có (trích thành hàm `connectFacebookPageToBot`). Frontend thêm nút popup + postMessage listener trong `src/App.tsx`.

**Tech Stack:** Express 4, Node crypto (HMAC-SHA256), Facebook Graph API v25.0, React 19, vitest.

**Spec:** `docs/superpowers/specs/2026-07-06-facebook-oauth-connect-design.md`

## Global Constraints

- Scopes OAuth đúng spec: `pages_show_list,pages_messaging,pages_manage_metadata`.
- `state` ký HMAC-SHA256, TTL 10 phút.
- Webhook chung: luôn trả 200 sau khi nhận event hợp lệ (Meta retry nếu không).
- Verify chữ ký `X-Hub-Signature-256` CHỈ enforce khi `FACEBOOK_APP_SECRET` được cấu hình.
- Giữ nguyên endpoint webhook per-bot cũ (`/api/facebook-webhook/:botId`) — không phá kết nối hiện có.
- Mọi thông báo lỗi hiển thị cho khách bằng tiếng Việt.
- Env mới: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`. Đã có: `FACEBOOK_VERIFY_TOKEN`, `FACEBOOK_GRAPH_API_VERSION` (mặc định v25.0).
- Test: `npx vitest run` phải xanh; `npm run lint` (tsc --noEmit) phải sạch trước khi commit.

---

### Task 1: Module `facebookOauth.ts` — helpers thuần + tests

**Files:**
- Create: `facebookOauth.ts` (root, cạnh `billing.ts`)
- Create: `__tests__/facebookOauth.test.ts`
- Modify: `vitest.config.ts` (thêm include `__tests__/**/*.test.ts`)

**Interfaces:**
- Consumes: không phụ thuộc task nào (chỉ `node:crypto`).
- Produces (Task 3, 4 dùng):
  - `signOAuthState(botId: string, secret: string, now?: number): string`
  - `verifyOAuthState(state: string, secret: string, now?: number): { botId: string; ts: number; nonce: string } | null`
  - `buildOAuthDialogUrl(opts: { appId: string; redirectUri: string; state: string; graphVersion: string }): string`
  - `verifyFacebookSignature(rawBody: Buffer | undefined, signatureHeader: string | undefined, appSecret: string): boolean`
  - `groupMessagingEventsByPage(body: any): Array<{ pageId: string; events: any[] }>`
  - `randomToken(bytes?: number): string`
  - `renderOAuthResultHtml(opts: { success: boolean; message: string; pageName?: string }): string`
  - `renderPageSelectionHtml(opts: { selectionId: string; pages: Array<{ id: string; name: string }>; actionPath: string }): string`

- [ ] **Step 1: Sửa vitest.config.ts để nhận thư mục test mới**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["zaloGroupBot/**/*.test.ts", "rag/**/*.test.ts", "__tests__/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 2: Viết test fail — `__tests__/facebookOauth.test.ts`**

```ts
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
    expect(u.searchParams.get("scope")).toBe("pages_show_list,pages_messaging,pages_manage_metadata");
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
```

- [ ] **Step 3: Chạy test, xác nhận FAIL**

Run: `npx vitest run __tests__/facebookOauth.test.ts`
Expected: FAIL — `Cannot find module '../facebookOauth.js'`

- [ ] **Step 4: Viết `facebookOauth.ts`**

```ts
import crypto from "node:crypto";

// Helpers thuần cho luồng OAuth kết nối Fanpage Facebook (1 app chung của BalaBot).
// Tách khỏi server.ts để unit-test được (pattern như billing.ts).

const STATE_TTL_MS = 10 * 60 * 1000;

export type OAuthStatePayload = { botId: string; ts: number; nonce: string };

function hmacBase64Url(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

// state = base64url(JSON payload) + "." + HMAC — chống CSRF, mang botId qua vòng OAuth.
export function signOAuthState(botId: string, secret: string, now = Date.now()): string {
  const payload: OAuthStatePayload = { botId, ts: now, nonce: crypto.randomBytes(8).toString("hex") };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmacBase64Url(body, secret)}`;
}

export function verifyOAuthState(state: string, secret: string, now = Date.now()): OAuthStatePayload | null {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig) return null;
  const expected = hmacBase64Url(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthStatePayload;
    if (!payload?.botId || typeof payload.ts !== "number") return null;
    if (now - payload.ts > STATE_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildOAuthDialogUrl(opts: { appId: string; redirectUri: string; state: string; graphVersion: string }): string {
  const p = new URLSearchParams({
    client_id: opts.appId,
    redirect_uri: opts.redirectUri,
    state: opts.state,
    response_type: "code",
    scope: "pages_show_list,pages_messaging,pages_manage_metadata",
  });
  return `https://www.facebook.com/${opts.graphVersion}/dialog/oauth?${p.toString()}`;
}

// Verify chữ ký webhook Meta (X-Hub-Signature-256 = "sha256=<hex hmac của raw body>").
export function verifyFacebookSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!rawBody || !signatureHeader) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Webhook app-level: 1 request có thể chứa event của nhiều Page → gom theo entry[].id.
export function groupMessagingEventsByPage(body: any): Array<{ pageId: string; events: any[] }> {
  if (body?.object !== "page") return [];
  const out: Array<{ pageId: string; events: any[] }> = [];
  for (const entry of body?.entry || []) {
    const pageId = String(entry?.id || "");
    const events = Array.isArray(entry?.messaging) ? entry.messaging : [];
    if (pageId && events.length) out.push({ pageId, events });
  }
  return out;
}

export function randomToken(bytes = 12): string {
  return crypto.randomBytes(bytes).toString("hex");
}

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Trang kết quả trong popup: postMessage về dashboard rồi tự đóng.
export function renderOAuthResultHtml(opts: { success: boolean; message: string; pageName?: string }): string {
  const payload = JSON.stringify({
    type: "balabot-facebook-connected",
    success: opts.success,
    pageName: opts.pageName || "",
    message: opts.message,
  }).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>BalaBot — Kết nối Facebook</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:90vh;background:#f8fafc;margin:0">
<div style="max-width:420px;text-align:center;padding:24px">
<h2 style="color:${opts.success ? "#059669" : "#e11d48"};font-size:20px">${opts.success ? "✅ Kết nối thành công" : "⚠️ Chưa kết nối được"}</h2>
<p style="color:#334155;font-size:14px;line-height:1.6">${escapeHtml(opts.message)}</p>
<p style="color:#94a3b8;font-size:12px">Cửa sổ sẽ tự đóng…</p>
</div>
<script>try{window.opener&&window.opener.postMessage(${payload},"*")}catch(e){}setTimeout(function(){window.close()},${opts.success ? 1800 : 6000});</script>
</body></html>`;
}

// Trang chọn Page khi tài khoản quản lý nhiều Fanpage.
export function renderPageSelectionHtml(opts: {
  selectionId: string;
  pages: Array<{ id: string; name: string }>;
  actionPath: string;
}): string {
  const items = opts.pages
    .map(
      (p, i) => `<label style="display:flex;gap:10px;align-items:center;padding:12px;border:1px solid #e2e8f0;border-radius:10px;cursor:pointer;background:#fff">
<input type="radio" name="pageId" value="${escapeHtml(p.id)}" ${i === 0 ? "checked" : ""}>
<span style="font-size:14px;color:#0f172a;font-weight:600">${escapeHtml(p.name)}</span>
<span style="font-size:11px;color:#94a3b8;margin-left:auto">${escapeHtml(p.id)}</span>
</label>`
    )
    .join("\n");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>BalaBot — Chọn Fanpage</title></head>
<body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:24px">
<div style="max-width:460px;margin:0 auto">
<h2 style="font-size:18px;color:#0f172a">Chọn Fanpage muốn kết nối với bot</h2>
<form method="POST" action="${escapeHtml(opts.actionPath)}" style="display:flex;flex-direction:column;gap:10px">
<input type="hidden" name="selectionId" value="${escapeHtml(opts.selectionId)}">
${items}
<button type="submit" style="padding:12px;background:#059669;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer">Kết nối Fanpage này</button>
</form>
</div>
</body></html>`;
}
```

- [ ] **Step 5: Chạy test, xác nhận PASS toàn bộ**

Run: `npx vitest run`
Expected: PASS tất cả (kể cả các test rag/zalo cũ).

- [ ] **Step 6: Lint + commit**

Run: `npm run lint`
Expected: exit 0, không lỗi type.

```bash
git add facebookOauth.ts __tests__/facebookOauth.test.ts vitest.config.ts
git commit -m "feat(facebook): helpers OAuth — state HMAC, verify chữ ký webhook, gom event theo Page"
```

---

### Task 2: Trích `connectFacebookPageToBot` từ route hiện có

**Files:**
- Modify: `server.ts:2328-2390` (route `POST /api/bots/:botId/facebook-connect`)

**Interfaces:**
- Consumes: `dbGetBots`, `dbUpdateBot`, `bots`, `getFacebookGraphApiVersion` (sẵn có trong server.ts).
- Produces (Task 3 dùng):
  `connectFacebookPageToBot(botId: string, pageAccessToken: string): Promise<{ success: boolean; status: number; pageId?: string; pageName?: string; subscribed?: boolean; subscribeWarning?: string; message?: string; error?: string }>`

- [ ] **Step 1: Thêm hàm `connectFacebookPageToBot` ngay TRÊN route (trước dòng `app.post("/api/bots/:botId/facebook-connect"`)**

Logic bê nguyên từ thân route hiện tại (server.ts:2341-2388), đổi `res.*` thành return object:

```ts
// Lõi kết nối Page cho 1 bot: verify token → lấy Page info → tự subscribe webhook → lưu per-bot.
// Dùng chung cho route dán token thủ công VÀ luồng OAuth (Task 3).
async function connectFacebookPageToBot(
  botId: string,
  pageAccessToken: string
): Promise<{
  success: boolean; status: number; pageId?: string; pageName?: string;
  subscribed?: boolean; subscribeWarning?: string; message?: string; error?: string;
}> {
  const token = (pageAccessToken || "").trim();
  if (!token) return { success: false, status: 400, error: "Thiếu Page Access Token." };

  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === botId);
  if (!bot) return { success: false, status: 404, error: "Bot not found" };

  const ver = getFacebookGraphApiVersion();
  try {
    // 1. Xác thực token + lấy thông tin Page.
    const meRes = await fetch(`https://graph.facebook.com/${ver}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
    const me = await meRes.json();
    if (!meRes.ok || !me?.id) {
      return { success: false, status: 400, error: me?.error?.message || "Token không hợp lệ hoặc không phải Page Access Token." };
    }

    // 2. Tự subscribe app vào Page cho các event tin nhắn (bỏ bước thủ công).
    let subscribed = false;
    let subscribeWarning = "";
    try {
      const subRes = await fetch(
        `https://graph.facebook.com/${ver}/${me.id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks&access_token=${encodeURIComponent(token)}`,
        { method: "POST" }
      );
      const subData = await subRes.json().catch(() => ({}));
      subscribed = !!subData?.success;
      if (!subscribed) subscribeWarning = subData?.error?.message || "Không tự subscribe được; có thể cần subscribe thủ công trên Meta.";
    } catch (subErr: any) {
      subscribeWarning = subErr?.message || "Lỗi khi subscribe app vào Page.";
    }

    // 3. Lưu per-bot (memory + DB).
    const updates = {
      facebookPageAccessToken: token,
      facebookPageId: me.id,
      facebookPageName: me.name || "",
      facebookStatus: "connected" as const,
      facebookConnectedAt: new Date().toISOString()
    };
    const memBot = bots.find(b => b.id === botId);
    if (memBot) Object.assign(memBot, updates);
    await dbUpdateBot(botId, updates);

    return {
      success: true, status: 200,
      pageId: me.id, pageName: me.name || "", subscribed, subscribeWarning,
      message: subscribed
        ? `Đã kết nối Page "${me.name}" và tự subscribe webhook thành công.`
        : `Đã kết nối Page "${me.name}". Lưu ý: ${subscribeWarning}`
    };
  } catch (err: any) {
    return { success: false, status: 500, error: "Lỗi gọi Facebook Graph API: " + (err?.message || err) };
  }
}
```

- [ ] **Step 2: Thay thân route bằng wrapper mỏng**

Route `POST /api/bots/:botId/facebook-connect` (giữ nguyên response shape cũ để App.tsx không đổi):

```ts
app.post("/api/bots/:botId/facebook-connect", async (req, res) => {
  const result = await connectFacebookPageToBot(req.params.botId, (req.body?.pageAccessToken || "").toString());
  const { status, ...payload } = result;
  return res.status(status).json(payload);
});
```

- [ ] **Step 3: Lint + test + commit**

Run: `npm run lint && npx vitest run`
Expected: cả hai xanh.

```bash
git add server.ts
git commit -m "refactor(facebook): trích connectFacebookPageToBot dùng chung cho OAuth"
```

---

### Task 3: Route OAuth — start / callback / select

**Files:**
- Modify: `server.ts` — thêm import, capture rawBody (dòng 88), 3 route mới (đặt ngay sau route `facebook-disconnect`, ~dòng 2405)

**Interfaces:**
- Consumes: Task 1 (`signOAuthState`, `verifyOAuthState`, `buildOAuthDialogUrl`, `randomToken`, `renderOAuthResultHtml`, `renderPageSelectionHtml`), Task 2 (`connectFacebookPageToBot`), sẵn có (`getPublicBaseUrl`, `getFacebookGraphApiVersion`).
- Produces: endpoint `GET /api/facebook-oauth/start?botId=`, `GET /api/facebook-oauth/callback`, `POST /api/facebook-oauth/select` (Task 5 frontend dùng `start`).

- [ ] **Step 1: Thêm import ở đầu server.ts (cạnh import billing hiện có, ~dòng 10)**

```ts
import {
  signOAuthState, verifyOAuthState, buildOAuthDialogUrl, verifyFacebookSignature,
  groupMessagingEventsByPage, randomToken, renderOAuthResultHtml, renderPageSelectionHtml,
} from "./facebookOauth.js";
```

- [ ] **Step 2: Capture raw body cho verify chữ ký webhook — sửa dòng 88**

Từ:
```ts
app.use(express.json({ limit: "50mb" }));
```
Thành:
```ts
app.use(express.json({
  limit: "50mb",
  verify: (req: any, _res, buf) => { req.rawBody = buf; }, // giữ raw body để verify X-Hub-Signature-256
}));
```

- [ ] **Step 3: Thêm helper creds + pending-selection map + 3 route (sau route `facebook-disconnect`)**

```ts
// ===== Facebook OAuth 1 chạm (app chung BalaBot) =====
function getFacebookAppCreds() {
  const appId = process.env.FACEBOOK_APP_ID || "";
  const appSecret = process.env.FACEBOOK_APP_SECRET || "";
  return { appId, appSecret, configured: !!(appId && appSecret) };
}

// Phiên chọn Page (khi khách quản lý nhiều Fanpage): giữ page tokens server-side, TTL 10'.
const fbOauthPendingSelections = new Map<string, {
  botId: string;
  pages: Array<{ id: string; name: string; access_token: string }>;
  at: number;
}>();
const FB_OAUTH_SELECTION_TTL_MS = 10 * 60 * 1000;

function cleanupFbOauthSelections() {
  const now = Date.now();
  for (const [k, v] of fbOauthPendingSelections) {
    if (now - v.at > FB_OAUTH_SELECTION_TTL_MS) fbOauthPendingSelections.delete(k);
  }
}

// Bước 1: dashboard mở popup vào đây → redirect sang màn cấp quyền của Facebook.
app.get("/api/facebook-oauth/start", async (req, res) => {
  const { appId, appSecret, configured } = getFacebookAppCreds();
  const botId = String(req.query.botId || "").trim();
  if (!configured) {
    return res.status(400).send(renderOAuthResultHtml({ success: false, message: "Server chưa cấu hình FACEBOOK_APP_ID / FACEBOOK_APP_SECRET. Liên hệ quản trị viên BalaBot." }));
  }
  if (!botId) {
    return res.status(400).send(renderOAuthResultHtml({ success: false, message: "Thiếu botId. Hãy mở lại từ trang cấu hình bot." }));
  }
  const redirectUri = `${getPublicBaseUrl(req)}/api/facebook-oauth/callback`;
  const state = signOAuthState(botId, appSecret);
  return res.redirect(buildOAuthDialogUrl({ appId, redirectUri, state, graphVersion: getFacebookGraphApiVersion() }));
});

// Bước 2: Facebook redirect về đây với ?code&state → đổi token → lấy Page → kết nối.
app.get("/api/facebook-oauth/callback", async (req, res) => {
  const { appId, appSecret, configured } = getFacebookAppCreds();
  const fail = (message: string, status = 400) =>
    res.status(status).send(renderOAuthResultHtml({ success: false, message }));

  if (!configured) return fail("Server chưa cấu hình Facebook App.");
  if (req.query.error) {
    return fail("Bạn đã từ chối cấp quyền. Hãy bấm Kết nối Facebook lại và chọn Cho phép để bot đọc/trả lời tin nhắn Fanpage.");
  }
  const st = verifyOAuthState(String(req.query.state || ""), appSecret);
  if (!st) return fail("Phiên kết nối không hợp lệ hoặc đã quá 10 phút. Hãy đóng cửa sổ và bấm Kết nối Facebook lại.");
  const code = String(req.query.code || "");
  if (!code) return fail("Thiếu mã xác thực từ Facebook. Hãy thử lại.");

  const ver = getFacebookGraphApiVersion();
  const redirectUri = `${getPublicBaseUrl(req)}/api/facebook-oauth/callback`;
  try {
    // 1. code → short-lived user token.
    const tokRes = await fetch(
      `https://graph.facebook.com/${ver}/oauth/access_token?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`
    );
    const tok = await tokRes.json();
    if (!tokRes.ok || !tok?.access_token) return fail(tok?.error?.message || "Không đổi được mã xác thực với Facebook.");

    // 2. → long-lived user token (page token sinh từ đây sẽ không hết hạn).
    const llRes = await fetch(
      `https://graph.facebook.com/${ver}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(tok.access_token)}`
    );
    const ll = await llRes.json().catch(() => ({}));
    const userToken = ll?.access_token || tok.access_token;

    // 3. Danh sách Page khách quản lý + Page Access Token từng Page.
    const pagesRes = await fetch(
      `https://graph.facebook.com/${ver}/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(userToken)}`
    );
    const pages = await pagesRes.json();
    if (!pagesRes.ok) return fail(pages?.error?.message || "Không lấy được danh sách Fanpage.");
    const list = (pages?.data || []).filter((p: any) => p?.id && p?.access_token);
    if (!list.length) {
      return fail("Tài khoản của bạn chưa quản lý Fanpage nào, hoặc bạn chưa chọn Page nào ở bước cấp quyền. Hãy thử lại và tick chọn Fanpage.");
    }

    // 1 Page → kết nối luôn. Nhiều Page → cho chọn.
    if (list.length === 1) {
      const result = await connectFacebookPageToBot(st.botId, list[0].access_token);
      return res.status(result.status).send(renderOAuthResultHtml({
        success: result.success,
        message: result.success ? (result.message || `Đã kết nối Fanpage "${result.pageName}".`) : (result.error || "Kết nối thất bại."),
        pageName: result.pageName,
      }));
    }

    cleanupFbOauthSelections();
    const selectionId = randomToken();
    fbOauthPendingSelections.set(selectionId, { botId: st.botId, pages: list, at: Date.now() });
    return res.send(renderPageSelectionHtml({
      selectionId,
      pages: list.map((p: any) => ({ id: p.id, name: p.name || p.id })),
      actionPath: `${getPublicBaseUrl(req)}/api/facebook-oauth/select`,
    }));
  } catch (err: any) {
    return fail("Lỗi gọi Facebook: " + (err?.message || err), 500);
  }
});

// Bước 3 (chỉ khi nhiều Page): nhận Page khách chọn → kết nối.
app.post("/api/facebook-oauth/select", express.urlencoded({ extended: false }), async (req, res) => {
  cleanupFbOauthSelections();
  const selectionId = String(req.body?.selectionId || "");
  const pageId = String(req.body?.pageId || "");
  const pending = fbOauthPendingSelections.get(selectionId);
  if (!pending) {
    return res.status(400).send(renderOAuthResultHtml({ success: false, message: "Phiên chọn Fanpage đã hết hạn. Hãy bấm Kết nối Facebook lại." }));
  }
  const page = pending.pages.find(p => p.id === pageId);
  if (!page) {
    return res.status(400).send(renderOAuthResultHtml({ success: false, message: "Fanpage không hợp lệ. Hãy bấm Kết nối Facebook lại." }));
  }
  fbOauthPendingSelections.delete(selectionId);
  const result = await connectFacebookPageToBot(pending.botId, page.access_token);
  return res.status(result.status).send(renderOAuthResultHtml({
    success: result.success,
    message: result.success ? (result.message || `Đã kết nối Fanpage "${result.pageName}".`) : (result.error || "Kết nối thất bại."),
    pageName: result.pageName,
  }));
});
```

- [ ] **Step 4: Lint + test + smoke test route**

Run: `npm run lint && npx vitest run`
Expected: xanh.

Smoke (không cần Meta app thật):
```bash
npx tsx server.ts &   # hoặc dùng dev server đang chạy
curl -s "http://localhost:3000/api/facebook-oauth/start?botId=x" | head -c 300
```
Expected: HTML chứa "Server chưa cấu hình FACEBOOK_APP_ID" (vì env chưa đặt) — chứng tỏ route sống + render lỗi tiếng Việt.

- [ ] **Step 5: Commit**

```bash
git add server.ts
git commit -m "feat(facebook): luồng OAuth 1 chạm — start/callback/chọn Page, đổi long-lived token"
```

---

### Task 4: Webhook chung theo Page ID + verify chữ ký + token hết hạn

**Files:**
- Modify: `server.ts` — thêm 2 route webhook chung (đặt ngay TRƯỚC route `GET /api/facebook-webhook/:botId`, ~dòng 2408); sửa `sendFacebookTextMessage` (~dòng 2159-2190)
- Modify: `src/types.ts:20`

**Interfaces:**
- Consumes: Task 1 (`groupMessagingEventsByPage`, `verifyFacebookSignature`), sẵn có (`processFacebookIncomingMessage`, `dbGetBots`, `dbUpdateBot`, `getFacebookVerifyToken`).
- Produces: endpoint `GET/POST /api/facebook-webhook` (URL cấu hình 1 lần trên Meta App).

- [ ] **Step 1: Thêm `'expired'` vào type — `src/types.ts:20`**

```ts
  facebookStatus?: 'not_connected' | 'connected' | 'expired';
```

- [ ] **Step 2: Thêm route webhook chung (trước `GET /api/facebook-webhook/:botId`)**

```ts
// Webhook CHUNG cho app Meta của BalaBot (Meta chỉ cho 1 callback URL/app).
// Route theo entry[].id (Page ID) → bot có facebookPageId tương ứng.
app.get("/api/facebook-webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === getFacebookVerifyToken()) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post("/api/facebook-webhook", async (req, res) => {
  // Verify chữ ký khi có app secret (bỏ qua ở môi trường dev chưa cấu hình).
  const { appSecret } = getFacebookAppCreds();
  if (appSecret) {
    const ok = verifyFacebookSignature(
      (req as any).rawBody,
      req.headers["x-hub-signature-256"] as string | undefined,
      appSecret
    );
    if (!ok) {
      console.warn("[Facebook Webhook] Chữ ký X-Hub-Signature-256 không hợp lệ — bỏ qua request.");
      return res.sendStatus(403);
    }
  }

  if (req.body?.object !== "page") return res.sendStatus(404);
  res.status(200).send("EVENT_RECEIVED"); // luôn 200 sớm để Meta không retry

  try {
    const groups = groupMessagingEventsByPage(req.body);
    if (!groups.length) return;
    const allBots = await dbGetBots(bots);
    for (const g of groups) {
      const bot = allBots.find(b => b.facebookPageId === g.pageId);
      if (!bot) {
        console.warn(`[Facebook Webhook] Không tìm thấy bot cho Page ${g.pageId} — bỏ qua.`);
        continue;
      }
      for (const event of g.events) {
        await processFacebookIncomingMessage(bot, event);
      }
    }
  } catch (err) {
    console.error("[Facebook Webhook] Lỗi xử lý webhook chung:", err);
  }
});
```

Lưu ý: middleware scoping ở server.ts:150 match `facebook-webhook/([^/]+)` — path `/api/facebook-webhook` (không segment sau) không bị match, không cần sửa.

- [ ] **Step 3: Đánh dấu token hết hạn trong `sendFacebookTextMessage`**

Trong nhánh lỗi của `sendFacebookTextMessage` (hiện tại ~dòng 2183-2186 `if (!response.ok || data.error)`), thêm TRƯỚC `throw`:

```ts
    if (!response.ok || data.error) {
      // Token bị thu hồi/hết hạn (khách đổi mật khẩu, gỡ app...) → đánh dấu để dashboard nhắc kết nối lại.
      if (data.error?.code === 190 && bot.facebookPageAccessToken) {
        const updates = { facebookStatus: "expired" as const };
        const memBot = bots.find(b => b.id === bot.id);
        if (memBot) Object.assign(memBot, updates);
        await dbUpdateBot(bot.id, updates).catch(() => {});
        console.warn(`[Facebook] Token Page của bot ${bot.id} đã hết hạn/bị thu hồi (code 190).`);
      }
      throw new Error(data.error?.message || `Facebook Send API failed with HTTP ${response.status}`);
    }
```

- [ ] **Step 4: Lint + test**

Run: `npm run lint && npx vitest run`
Expected: xanh.

- [ ] **Step 5: Smoke test webhook chung bằng curl (server dev đang chạy, chưa có FACEBOOK_APP_SECRET → bỏ verify chữ ký)**

```bash
curl -s -X POST http://localhost:3000/api/facebook-webhook \
  -H "Content-Type: application/json" \
  -d '{"object":"page","entry":[{"id":"999999","messaging":[{"sender":{"id":"u1"},"message":{"mid":"m1","text":"hi"}}]}]}'
```
Expected: `EVENT_RECEIVED` + log server "Không tìm thấy bot cho Page 999999".

```bash
curl -s "http://localhost:3000/api/facebook-webhook?hub.mode=subscribe&hub.verify_token=balabot-dev-verify-token&hub.challenge=42"
```
Expected: `42`

- [ ] **Step 6: Commit**

```bash
git add server.ts src/types.ts
git commit -m "feat(facebook): webhook chung route theo Page ID + verify chữ ký + đánh dấu token hết hạn"
```

---

### Task 5: Frontend — nút "Kết nối Facebook" + postMessage listener

**Files:**
- Modify: `src/App.tsx` — handler mới (~sau `handleConnectFacebook`, dòng 428), useEffect listener, UI tab Facebook (dòng 3400-3444)

**Interfaces:**
- Consumes: endpoint `GET /api/facebook-oauth/start?botId=` (Task 3); message `{ type: 'balabot-facebook-connected', success, pageName, message }` từ popup (Task 1 render).
- Produces: không có consumer sau.

- [ ] **Step 1: Thêm handler mở popup (sau `handleDisconnectFacebook`, ~dòng 450)**

```tsx
  const handleOAuthConnectFacebook = () => {
    if (!selectedBotId) return;
    setFacebookActionMsg(null);
    // Cùng origin-path với các fetch('/api/...') hiện có.
    window.open(
      `/api/facebook-oauth/start?botId=${encodeURIComponent(selectedBotId)}`,
      'balabot-fb-oauth',
      'width=650,height=760'
    );
  };
```

- [ ] **Step 2: Thêm listener postMessage (cạnh các useEffect sẵn có của component)**

```tsx
  // Nhận kết quả kết nối Facebook từ popup OAuth.
  useEffect(() => {
    const onFbOauthMessage = (e: MessageEvent) => {
      const data = e.data;
      if (!data || data.type !== 'balabot-facebook-connected') return;
      if (data.success) {
        setFacebookActionMsg({ status: 'success', text: data.pageName ? `Đã kết nối Fanpage "${data.pageName}".` : 'Kết nối Facebook Page thành công.' });
      } else {
        setFacebookActionMsg({ status: 'error', text: data.message || 'Kết nối Facebook thất bại.' });
      }
      fetchFacebookDetails();
    };
    window.addEventListener('message', onFbOauthMessage);
    return () => window.removeEventListener('message', onFbOauthMessage);
  }, [selectedBotId]);
```

- [ ] **Step 3: UI — nút OAuth chính + đưa ô dán token vào "Tùy chọn nâng cao"**

Thay block "Per-bot Page Access Token connect" (dòng 3410-3444) bằng:

```tsx
                  {/* Kết nối 1 chạm qua Facebook OAuth */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Kết nối Fanpage</span>
                    <button
                      type="button"
                      onClick={handleOAuthConnectFacebook}
                      disabled={isConnectingFacebook}
                      className="w-full px-4 py-3 bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-50 text-white font-bold rounded-lg text-sm flex items-center justify-center gap-2"
                    >
                      Kết nối Facebook (1 chạm)
                    </button>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Đăng nhập Facebook, chọn Fanpage, xong — hệ thống tự lấy token và tự đăng ký nhận tin nhắn.
                    </p>
                    {facebookDetails?.facebookStatus === 'connected' && (
                      <button
                        type="button"
                        onClick={handleDisconnectFacebook}
                        disabled={isConnectingFacebook}
                        className="text-[11px] font-bold text-rose-600 hover:text-rose-700 disabled:opacity-50"
                      >
                        Ngắt kết nối Fanpage
                      </button>
                    )}

                    <details className="pt-1">
                      <summary className="text-[11px] font-bold text-slate-500 cursor-pointer select-none">Tùy chọn nâng cao: dán Page Access Token thủ công</summary>
                      <div className="flex gap-2 mt-3">
                        <input
                          type="text"
                          placeholder="Dán Page Access Token của Fanpage..."
                          className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                          value={inputFacebookToken}
                          onChange={(e) => setInputFacebookToken(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={handleConnectFacebook}
                          disabled={isConnectingFacebook || !inputFacebookToken.trim()}
                          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs whitespace-nowrap flex items-center gap-2"
                        >
                          {isConnectingFacebook ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                          Kết nối
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed mt-2">
                        Token được lưu riêng cho từng bot. Khi bấm Kết nối, hệ thống tự xác thực với Facebook và tự đăng ký nhận tin nhắn.
                      </p>
                    </details>
                  </div>
```

- [ ] **Step 4: Hiển thị trạng thái `expired` — sửa block "Trạng thái Page" (dòng 3400-3407)**

```tsx
                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Trạng thái Page</span>
                      <div className={`text-xs font-bold rounded-lg p-3 border ${
                        facebookDetails?.facebookStatus === 'connected' ? 'bg-green-50 text-green-700 border-green-200'
                        : facebookDetails?.facebookStatus === 'expired' ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        {facebookDetails?.facebookStatus === 'connected'
                          ? `Đã kết nối: ${facebookDetails?.facebookPageName || facebookDetails?.facebookPageId || 'Page'}`
                          : facebookDetails?.facebookStatus === 'expired'
                          ? 'Kết nối đã hết hạn — bấm "Kết nối Facebook" để kết nối lại'
                          : 'Chưa kết nối Fanpage'}
                      </div>
                    </div>
```

- [ ] **Step 5: Lint + build + xem thử UI**

Run: `npm run lint && npx vite build`
Expected: build xong không lỗi.

Chạy dev (`npm run dev`) → mở dashboard → tab Facebook: thấy nút xanh Facebook "Kết nối Facebook (1 chạm)", ô token nằm trong "Tùy chọn nâng cao". Bấm nút → popup mở, hiện lỗi tiếng Việt "Server chưa cấu hình FACEBOOK_APP_ID..." (env local chưa đặt) và popup postMessage lỗi về dashboard.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ui): nút Kết nối Facebook 1 chạm — popup OAuth + trạng thái hết hạn"
```

---

### Task 6: Docs, env, deploy

**Files:**
- Modify: `.env.example`
- Create: `docs/facebook-oauth-setup.md`

**Interfaces:**
- Consumes: toàn bộ endpoint đã build.
- Produces: hướng dẫn vận hành cho chủ dự án + khách pilot.

- [ ] **Step 1: Thêm env mới vào `.env.example` (cạnh các biến FACEBOOK_ hiện có)**

```bash
# Facebook OAuth (app chung BalaBot — kết nối Fanpage 1 chạm)
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
```

- [ ] **Step 2: Viết `docs/facebook-oauth-setup.md`**

Nội dung bắt buộc gồm 3 phần (viết tiếng Việt đầy đủ, không placeholder):

1. **Tạo Meta App (làm 1 lần):** developers.facebook.com → Create App → loại Business → thêm sản phẩm Facebook Login + Messenger. Facebook Login → Settings → Valid OAuth Redirect URIs: `https://antiantiai.xyz/balabot/api/facebook-oauth/callback`. Messenger → Webhooks → Callback URL: `https://antiantiai.xyz/balabot/api/facebook-webhook`, Verify Token: giá trị `FACEBOOK_VERIFY_TOKEN` trên Railway, Subscribe fields: `messages`, `messaging_postbacks`. Lấy App ID + App Secret (Settings → Basic) → đặt env `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` trên Railway.
2. **Mời khách pilot làm Tester (mỗi khách 1 lần, khi app còn Development mode):** App Roles → Roles → Add Testers → nhập username/profile FB của khách → khách vào `developers.facebook.com/settings` (mục Requests) bấm Accept → xong, khách bấm "Kết nối Facebook (1 chạm)" trong dashboard BalaBot.
3. **Track dài hạn:** khi có hộ kinh doanh → Meta Business Verification → App Review xin Advanced Access `pages_messaging`, `pages_show_list`, `pages_manage_metadata` → chuyển app Live → khách bất kỳ tự kết nối, bỏ bước Tester.

- [ ] **Step 3: Chạy toàn bộ verify cuối**

Run: `npm run lint && npx vitest run && npm run build`
Expected: cả ba xanh.

- [ ] **Step 4: Commit + deploy backend (Railway auto từ push) + frontend (Pages, thủ công)**

```bash
git add .env.example docs/facebook-oauth-setup.md
git commit -m "docs(facebook): hướng dẫn setup Meta App + env OAuth"
git push origin main
npx wrangler pages deploy dist --project-name=aaa-balabot --branch=main --commit-dirty=true
```

Expected: Railway build xanh; Pages deploy URL trả về; mở `https://antiantiai.xyz/balabot/` thấy nút mới ở tab Facebook.

- [ ] **Step 5: Kiểm thử end-to-end sau khi chủ dự án cấu hình Meta App**

Checklist thủ công (cần Meta App + env đã đặt + 1 tài khoản Tester):
1. Bấm "Kết nối Facebook (1 chạm)" → popup FB login → chọn Page → popup báo "✅ Kết nối thành công" và tự đóng → dashboard hiện "Đã kết nối: <tên Page>".
2. Nhắn tin vào Fanpage từ tài khoản khác → bot trả lời trong Messenger.
3. Tài khoản quản lý ≥2 Page → hiện màn chọn Page → chọn → kết nối đúng Page.
4. Bấm Hủy ở màn cấp quyền → popup báo lỗi tiếng Việt "Bạn đã từ chối cấp quyền...".
5. Webhook Meta App trỏ URL chung `/api/facebook-webhook` verify thành công (Meta báo Complete).

---

## Self-Review

- **Spec coverage:** UX popup (T5), 2 endpoint OAuth + chọn Page (T3), webhook chung theo Page ID + giữ route cũ (T4), env (T6), chữ ký webhook + state HMAC TTL (T1/T3/T4), lỗi tiếng Việt (T1/T3), token thu hồi → expired + UI kết nối lại (T4/T5), giữ luồng dán token làm dự phòng sau "Tùy chọn nâng cao" (T5), unit test state/routing (T1), manual E2E (T6). Đủ.
- **Placeholder:** không còn TBD/`...` trong code các task; docs T2 bê nguyên logic có sẵn kèm chỉ dẫn dòng.
- **Type consistency:** `connectFacebookPageToBot` trả `{success,status,...}` — T3 dùng `result.status`/`result.error`/`result.pageName` khớp; message popup `balabot-facebook-connected` khớp giữa T1 render và T5 listener; `facebookStatus: 'expired'` khớp types.ts và UI.
