# Website Chat Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chủ shop dán 1 dòng script vào website của họ → bong bóng chat chạy đúng logic RAG/sales-assistant production, hội thoại về tab Hội thoại (kênh `web`), tôn trọng takeover, tính quota.

**Architecture:** Loader JS vanilla vẽ bubble + iframe; frame HTML tự chứa gọi 3 API công khai (`config`/`chat`/`messages`) gated bằng `widgetKey` per-bot + rate-limit IP; dashboard có tab Website để bật/tùy biến/copy mã nhúng. Spec: `docs/superpowers/specs/2026-07-09-website-widget-design.md`.

**Tech Stack:** Express (server.ts monolith), vanilla JS/HTML template strings (KHÔNG React trong widget), Vitest, Supabase (migration SQL chạy tay).

## Global Constraints

- Đường public đi qua prefix `/api/widget/...` (qua proxy `/balabot/api/*` sẵn có — KHÔNG sửa worker Cloudflare).
- Widget key format: `wk_` + 24 hex, sinh bằng `randomToken` (đã import trong server.ts từ `./facebookOauth.js`).
- Rate-limit chat: 8 tin/phút/IP. Tin nhắn cắt tối đa 2000 ký tự. Polling 5000ms. Lịch sử trả tối đa 50 tin.
- Màu mặc định `#059669`; lời chào mặc định `"Dạ em chào anh/chị! Anh/chị cần em tư vấn gì ạ? 😊"`; title mặc định = `bot.name`.
- userKey phiên web: `web:<visitorId>`; visitorId hợp lệ: `/^[\w-]{6,64}$/`.
- MỌI giá trị chủ shop nhập (title/greeting/color) khi render vào HTML phải qua `escapeWidgetHtml` (chống XSS trên site khách).
- Response lỗi/từ chối bằng tiếng Việt lịch sự; không lộ thông tin nội bộ.
- Sau mỗi task: `npx tsc --noEmit` sạch + `npx vitest run` xanh toàn bộ rồi mới commit. Commit thẳng lên `main` (quy ước dự án).
- KHÔNG deploy (push/wrangler) trong các task — deploy là bước cuối do controller thực hiện.

---

### Task 1: Module thuần `widget/embed.ts` (helpers + TDD)

**Files:**
- Create: `widget/embed.ts`
- Test: `widget/__tests__/embed.test.ts`

**Interfaces:**
- Consumes: không gì (module thuần).
- Produces (Task 2/3/4/5 dùng):
  - `escapeWidgetHtml(s: string): string`
  - `isValidWidgetKey(botKey: string | undefined, given: string | undefined): boolean`
  - `isValidVisitorId(v: string | undefined): boolean`
  - `clampWidgetText(text: unknown, max?: number): string` (mặc định max 2000; trim; không phải string → "")
  - `filterMessagesAfter(messages: Array<{sender: string; text: string; timestamp: string}>, after?: string): Array<{sender: string; text: string; timestamp: string}>` (chỉ sender `bot`/`agent`/`user`; nếu `after` là ISO hợp lệ thì chỉ tin `timestamp > after`; luôn cắt còn 50 tin cuối; chỉ giữ 3 field)
  - `resolveWidgetConfig(bot: {name: string; widgetColor?: string; widgetTitle?: string; widgetGreeting?: string}): { title: string; color: string; greeting: string }` (fallback theo Global Constraints; color phải khớp `/^#[0-9a-fA-F]{6}$/` không thì về mặc định)
  - `buildEmbedSnippet(baseUrl: string, botId: string, key: string): string` → chuỗi `<script src="{baseUrl}/api/widget/loader.js" data-bot="{botId}" data-key="{key}" async></script>`

- [ ] **Step 1: Viết test trước**

```ts
// widget/__tests__/embed.test.ts
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
```

- [ ] **Step 2: Chạy để thấy FAIL** — `npx vitest run widget` → lỗi "Cannot find module '../embed.js'".

- [ ] **Step 3: Viết `widget/embed.ts`**

```ts
// Helpers thuần cho widget chat nhúng website — không side effect, test được độc lập.

export function escapeWidgetHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// widgetKey rỗng/thiếu = tính năng đang TẮT → mọi request đều bị từ chối.
export function isValidWidgetKey(botKey: string | undefined, given: string | undefined): boolean {
  if (!botKey || !given) return false;
  return botKey === given;
}

export function isValidVisitorId(v: string | undefined): boolean {
  return !!v && /^[\w-]{6,64}$/.test(v);
}

export function clampWidgetText(text: unknown, max = 2000): string {
  if (typeof text !== "string") return "";
  return text.trim().slice(0, max);
}

const ALLOWED_SENDERS = new Set(["user", "bot", "agent"]);

export function filterMessagesAfter(
  messages: Array<{ sender: string; text: string; timestamp: string }>,
  after?: string
): Array<{ sender: string; text: string; timestamp: string }> {
  const afterMs = after ? new Date(after).getTime() : NaN;
  const filtered = (messages || []).filter(m =>
    ALLOWED_SENDERS.has(m.sender) &&
    (Number.isNaN(afterMs) || new Date(m.timestamp).getTime() > afterMs)
  );
  return filtered.slice(-50).map(m => ({ sender: m.sender, text: m.text, timestamp: m.timestamp }));
}

export const WIDGET_DEFAULT_COLOR = "#059669";
export const WIDGET_DEFAULT_GREETING = "Dạ em chào anh/chị! Anh/chị cần em tư vấn gì ạ? 😊";

export function resolveWidgetConfig(bot: {
  name: string; widgetColor?: string; widgetTitle?: string; widgetGreeting?: string;
}): { title: string; color: string; greeting: string } {
  const color = bot.widgetColor && /^#[0-9a-fA-F]{6}$/.test(bot.widgetColor)
    ? bot.widgetColor : WIDGET_DEFAULT_COLOR;
  return {
    title: (bot.widgetTitle || "").trim() || bot.name,
    color,
    greeting: (bot.widgetGreeting || "").trim() || WIDGET_DEFAULT_GREETING,
  };
}

export function buildEmbedSnippet(baseUrl: string, botId: string, key: string): string {
  return `<script src="${baseUrl}/api/widget/loader.js" data-bot="${botId}" data-key="${key}" async></script>`;
}
```

- [ ] **Step 4: Chạy PASS** — `npx vitest run widget` → toàn bộ xanh; `npx tsc --noEmit` sạch.

- [ ] **Step 5: Commit**

```bash
git add widget/embed.ts widget/__tests__/embed.test.ts
git commit -m "feat(widget): helpers thuần cho widget nhúng website (key/visitor/messages/config)"
```

---

### Task 2: Loader JS + Frame HTML (template, TDD mức chuỗi)

**Files:**
- Create: `widget/loaderJs.ts`, `widget/frameHtml.ts`
- Test: `widget/__tests__/templates.test.ts`

**Interfaces:**
- Consumes: `escapeWidgetHtml`, `WIDGET_DEFAULT_COLOR` từ `./embed.js`.
- Produces:
  - `buildLoaderJs(): string` — JS thuần chạy trên trang shop.
  - `buildFrameHtml(opts: { botId: string; widgetKey: string; visitorId: string; title: string; color: string; greeting: string }): string` — trang HTML đầy đủ (`<!doctype html>`…).

- [ ] **Step 1: Viết test trước**

```ts
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
```

- [ ] **Step 2: Chạy FAIL** — `npx vitest run widget` → module chưa tồn tại.

- [ ] **Step 3: Viết `widget/loaderJs.ts`** — trả về MỘT chuỗi JS tĩnh (viết bằng string thường nối `\n`, KHÔNG dùng backtick bên trong nội dung JS để test "không backtick" pass). Logic bắt buộc (viết đầy đủ, đây là khung hành vi):
  1. `var s = document.currentScript; var botId = s.getAttribute("data-bot"); var key = s.getAttribute("data-key");` — thiếu 1 trong 2 → return.
  2. `var base = s.src.replace(/\/api\/widget\/loader\.js.*$/, "");` — suy ra gốc `https://…/balabot`.
  3. visitorId: đọc `localStorage.getItem("balabot-visitor-" + botId)`; chưa có → tạo `"wv-" + <22 ký tự từ 2 lần Math.random().toString(36).slice(2)>` rồi `setItem`. Bọc try/catch (Safari private mode) — lỗi thì dùng id tạm trong biến.
  4. `fetch(base + "/api/widget/" + botId + "/config?key=" + encodeURIComponent(key))` → `!res.ok` → return (không vẽ gì). Lấy `color` từ JSON.
  5. Vẽ button 56×56 fixed `right:20px;bottom:20px;border-radius:50%;z-index:2147483000`, background = color, chứa SVG icon chat trắng inline; hover scale nhẹ.
  6. Click: toggle iframe `position:fixed;right:20px;bottom:88px;width:380px;height:560px;max-width:calc(100vw - 32px);max-height:calc(100vh - 110px);border:0;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.22);z-index:2147483000` — src = `base + "/api/widget/" + botId + "/frame?key=" + encodeURIComponent(key) + "&visitor=" + encodeURIComponent(visitorId)`. Đóng = remove iframe, đổi icon nút thành dấu ×/quay lại icon chat.
  7. Toàn bộ bọc IIFE, `"use strict"`, không polyfill, không global leak (chỉ 1 biến namespace `window.__balabotWidget` chống nạp 2 lần: đã có → return).

- [ ] **Step 4: Viết `widget/frameHtml.ts`** — export `buildFrameHtml(opts)` trả template string HTML hoàn chỉnh:
  - `<head>`: meta viewport; `<style>` nội tuyến: header `background:{color}`, vùng tin `overflow-y:auto`, bubble khách phải nền `{color}` chữ trắng, bubble bot trái nền `#f1f5f9`, ô nhập + nút gửi nền `{color}`. Font hệ thống.
  - Body: header (title đã `escapeWidgetHtml`), `<div id="msgs">`, form `<input id="inp" placeholder="Nhập tin nhắn...">` + button Gửi.
  - `<script>` nội tuyến (dùng JSON.stringify để nhúng an toàn botId/key/visitor/greeting vào biến JS):
    - `var API = "/balabot/api/widget/" + BOT + "/";` — chú ý: frame được phục vụ qua proxy nên đường tương đối `/balabot/api/...` đúng trên antiantiai.xyz; để chạy được cả khi gọi thẳng Railway, tính API từ `location.pathname.replace(/\/frame.*$/, "")` (lấy đúng gốc hiện tại) — bắt buộc dùng cách này.
    - Khởi động: GET `messages?key&visitor` → render; nếu 0 tin → render greeting như tin bot (chỉ hiển thị, không lưu).
    - `lastTs` = timestamp tin cuối đã render; `setInterval(poll, 5000)` gọi `messages?after=lastTs` → append tin mới (dùng để nhận tin operator + đồng bộ đa tab).
    - Gửi: append bubble khách ngay, hiện "..." typing; POST `chat` body `{key: KEY, visitor: VISITOR, text}`; response `{reply, humanTakeover}` → bỏ typing, append reply (nếu có); `humanTakeover` true và reply rỗng → hiện dòng nhỏ "Nhân viên đang hỗ trợ anh/chị trực tiếp ạ."; lỗi mạng/timeout 30s → "Mạng chậm, anh/chị thử lại giúp em ạ." Render text bằng `textContent` (không innerHTML với dữ liệu động) rồi thay `\n` bằng `<br>` qua tạo node — đơn giản nhất: `el.innerText = text`.
    - Auto scroll xuống cuối sau mỗi append.

- [ ] **Step 5: Chạy PASS** — `npx vitest run widget` xanh; `npx tsc --noEmit` sạch.

- [ ] **Step 6: Commit**

```bash
git add widget/loaderJs.ts widget/frameHtml.ts widget/__tests__/templates.test.ts
git commit -m "feat(widget): loader bubble + frame chat tự chứa (vanilla, escape XSS)"
```

---

### Task 3: Types + SQL + endpoints công khai + mối nối hệ thống

**Files:**
- Modify: `src/types.ts` (interface BotConfig), `server.ts`, `supabaseService.ts` (getSQLSchema)
- Create: `widget.sql`

**Interfaces:**
- Consumes: Task 1 (`isValidWidgetKey, isValidVisitorId, clampWidgetText, filterMessagesAfter, resolveWidgetConfig`), Task 2 (`buildLoaderJs, buildFrameHtml`); sẵn có trong server.ts: `generateRAGAnswer(bot, query, userInfo?, replyOptions?)`, `checkUsageGate(bot)` → `{allowed}`, `recordUsageForBot(bot)`, `BLOCK_MESSAGE`, `isHumanTakeoverActive(session)`, `absorbMessageDuringTakeover(session)`, `dbGetBots(bots)`, `dbSaveConversation(session)`, mảng `chatSessions`, `analytics`.
- Produces: 5 route `/api/widget/...` cho Task 5 nhúng thử; field `widgetKey/widgetColor/widgetTitle/widgetGreeting` trên BotConfig cho Task 4.

- [ ] **Step 1: `src/types.ts`** — thêm vào cuối interface `BotConfig` (sau `notifyTelegramChatId?: string;`):

```ts
  // Widget chat nhúng website của chủ shop. widgetKey rỗng/null = tính năng tắt.
  widgetKey?: string | null;
  widgetColor?: string;
  widgetTitle?: string;
  widgetGreeting?: string;
```

- [ ] **Step 2: Tạo `widget.sql`**

```sql
-- Chạy tay trên Supabase SQL Editor (DB gốc; khách BYO chạy lại SQL Schema).
-- Widget chat nhúng website: khóa nhúng + tùy biến giao diện per-bot.
alter table bots add column if not exists "widgetKey" text;
alter table bots add column if not exists "widgetColor" text;
alter table bots add column if not exists "widgetTitle" text;
alter table bots add column if not exists "widgetGreeting" text;
```

- [ ] **Step 3: `supabaseService.ts`** — trong `getSQLSchema()`, section "10. NÂNG CẤP CỘT MỚI", thêm ngay sau dòng `ALTER TABLE bots ADD COLUMN IF NOT EXISTS "facebookConnectedAt" TEXT;`:

```sql
ALTER TABLE bots ADD COLUMN IF NOT EXISTS "widgetKey" TEXT;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS "widgetColor" TEXT;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS "widgetTitle" TEXT;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS "widgetGreeting" TEXT;
```

- [ ] **Step 4: `server.ts` — BYO scope regex.** Trong `getRequestConfig`, thay dòng regex hiện tại:

```ts
  const botMatch = req.path.match(/^\/api\/(?:bots|telegram-webhook|facebook-webhook|widget|bridge\/botcake(?:-async)?)\/([^/]+)/);
```

(chỉ thêm `widget` vào nhóm; giữ nguyên phần còn lại. Lưu ý `/api/widget/loader.js` sẽ match botId="loader.js" → tra map không có → null, vô hại.)

- [ ] **Step 5: `server.ts` — import + rate limit + 5 endpoints.** Thêm import đầu file:

```ts
import { isValidWidgetKey, isValidVisitorId, clampWidgetText, filterMessagesAfter, resolveWidgetConfig } from "./widget/embed.js";
import { buildLoaderJs } from "./widget/loaderJs.js";
import { buildFrameHtml } from "./widget/frameHtml.js";
```

Đặt block endpoints NGAY SAU block `/api/site-assistant` (sau handler `app.post("/api/site-assistant/lead", ...)`) để nhóm các API công khai:

```ts
// ===== WIDGET CHAT NHÚNG WEBSITE (công khai, gate bằng widgetKey per-bot) =====
const widgetRate = new Map<string, { n: number; reset: number }>();
function widgetAllow(ip: string): boolean {
  const now = Date.now();
  const r = widgetRate.get(ip);
  if (!r || now > r.reset) { widgetRate.set(ip, { n: 1, reset: now + 60_000 }); return true; }
  r.n += 1;
  return r.n <= 8;
}

// Tìm bot + kiểm widget key. Trả null nếu không hợp lệ (caller tự trả 403).
async function findWidgetBot(botId: string, key: string): Promise<BotConfig | null> {
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === botId);
  if (!bot || !isValidWidgetKey(bot.widgetKey || undefined, key)) return null;
  return bot;
}

let widgetLoaderCache: string | null = null;
app.get("/api/widget/loader.js", (_req, res) => {
  if (!widgetLoaderCache) widgetLoaderCache = buildLoaderJs();
  res.set("Content-Type", "application/javascript; charset=utf-8");
  res.set("Cache-Control", "public, max-age=300");
  res.send(widgetLoaderCache);
});

app.get("/api/widget/:botId/config", async (req, res) => {
  const bot = await findWidgetBot(req.params.botId, String(req.query.key || ""));
  if (!bot) return res.status(403).json({ error: "Widget chưa được bật cho bot này." });
  res.json(resolveWidgetConfig(bot));
});

app.get("/api/widget/:botId/frame", async (req, res) => {
  const key = String(req.query.key || "");
  const visitor = String(req.query.visitor || "");
  const bot = await findWidgetBot(req.params.botId, key);
  if (!bot || !isValidVisitorId(visitor)) {
    return res.status(403).set("Content-Type", "text/html; charset=utf-8")
      .send("<!doctype html><meta charset='utf-8'><p style='font-family:sans-serif;padding:24px'>Widget chưa được bật hoặc liên kết không hợp lệ.</p>");
  }
  const cfg = resolveWidgetConfig(bot);
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(buildFrameHtml({ botId: bot.id, widgetKey: key, visitorId: visitor, ...cfg }));
});

app.get("/api/widget/:botId/messages", async (req, res) => {
  const bot = await findWidgetBot(req.params.botId, String(req.query.key || ""));
  const visitor = String(req.query.visitor || "");
  if (!bot || !isValidVisitorId(visitor)) return res.status(403).json({ messages: [] });
  const userKey = `web:${visitor}`;
  const session = chatSessions.find(s => s.botId === bot.id && s.telegramUserId === userKey);
  const msgs = session ? filterMessagesAfter(session.messages as any, String(req.query.after || "") || undefined) : [];
  res.json({ messages: msgs, humanTakeover: isHumanTakeoverActive(session) });
});

app.post("/api/widget/:botId/chat", async (req, res) => {
  const ip = (req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?").toString().split(",")[0].trim();
  if (!widgetAllow(ip)) return res.status(429).json({ reply: "Anh/chị nhắn hơi nhanh ạ, chờ em chút rồi thử lại nhé.", humanTakeover: false });

  const { key, visitor } = req.body || {};
  const text = clampWidgetText(req.body?.text);
  const bot = await findWidgetBot(req.params.botId, String(key || ""));
  if (!bot || !isValidVisitorId(String(visitor || ""))) return res.status(403).json({ error: "Widget chưa được bật cho bot này." });
  if (!text) return res.status(400).json({ error: "Thiếu nội dung tin nhắn." });

  const userKey = `web:${visitor}`;
  let session = chatSessions.find(s => s.botId === bot.id && s.telegramUserId === userKey);
  if (!session) {
    session = {
      id: "sess-web-" + Math.random().toString(36).substr(2, 9),
      botId: bot.id,
      telegramUserId: userKey,
      telegramUsername: `web_${visitor}`,
      telegramFullName: "Khách website",
      lastMessageText: text,
      lastMessageTime: new Date().toISOString(),
      status: "bot_answered",
      internalNotes: "Đến từ widget website",
      messages: [],
    };
    chatSessions.unshift(session);
    analytics.totalUsers += 1;
  }
  session.channel = "web" as any;
  session.channelChatId = String(visitor);
  session.channelIsGroup = false;
  session.channelSenderId = String(visitor);

  const hasPriorBotReply = session.messages.some(m => m.sender === "bot");
  const userMsg: Message = {
    id: "m-web-" + Math.random().toString(36).substr(2, 9),
    sender: "user", username: `web_${visitor}`, fullName: "Khách website", text,
    timestamp: new Date().toISOString(),
  };
  session.messages.push(userMsg);
  session.lastMessageText = text;
  session.lastMessageTime = userMsg.timestamp;

  if (isHumanTakeoverActive(session)) {
    await absorbMessageDuringTakeover(session);
    return res.json({ reply: "", humanTakeover: true });
  }

  let ai: { text: string; sources: any[]; fallbackTriggered: boolean };
  const gate = await checkUsageGate(bot);
  if (!gate.allowed) {
    ai = { text: BLOCK_MESSAGE, sources: [], fallbackTriggered: true };
  } else {
    ai = await generateRAGAnswer(bot, text,
      { fullName: "Khách website", username: `web_${visitor}`, id: userKey },
      { shouldGreet: !hasPriorBotReply, recentMessages: session.messages.slice(-8, -1) });
    await recordUsageForBot(bot);
  }

  const botMsg: Message = {
    id: "m-web-bot-" + Math.random().toString(36).substr(2, 9),
    sender: "bot", username: bot.name, text: ai.text,
    timestamp: new Date().toISOString(),
    sourcesUsed: ai.sources, fallbackTriggered: ai.fallbackTriggered,
  };
  session.messages.push(botMsg);
  session.lastMessageText = ai.text;
  session.lastMessageTime = botMsg.timestamp;
  session.status = ai.fallbackTriggered ? "escalated" : "bot_answered";
  analytics.totalMessages += 2;
  try { await dbSaveConversation(session); } catch (e) { console.warn("[Widget] Skip Supabase:", e); }

  res.json({ reply: ai.text, humanTakeover: false });
});
```

Lưu ý kiểu: `session.channel` trong `ChatSession` là union `'telegram' | 'facebook' | 'zalo' | 'botcake'` — **mở rộng union trong `src/types.ts` thành `'telegram' | 'facebook' | 'zalo' | 'botcake' | 'web'`** rồi BỎ `as any` ở dòng gán channel. Đồng thời cập nhật comment của field.

- [ ] **Step 6: `deliverOperatorReply` (server.ts)** — thêm suy luận + nhánh web:
  - Trong khối `if (!channel) {`, thêm sau nhánh botcake:
    ```ts
      else if (key.startsWith("web:")) { channel = "web" as any; chatId = chatId || key.slice("web:".length); isGroup = false; }
    ```
  - Trước nhánh `if (channel === "zalo")`, thêm:
    ```ts
    if ((channel as string) === "web") {
      // Widget nhận tin qua polling GET /messages — không có kênh push. Tin đã nằm
      // trong session.messages nên coi như giao thành công.
      return { delivered: true, channel: "web" };
    }
    ```
  (Nếu union đã mở rộng ở Step 5 thì bỏ các `as any`/`as string` — dùng so sánh thẳng.)

- [ ] **Step 7: Kiểm tra** — `npx tsc --noEmit` sạch; `npx vitest run` xanh. Smoke test tay local: `npm run dev` (hoặc script chạy server hiện có) rồi:
  - `curl http://localhost:3000/api/widget/loader.js` → JS, có `document.currentScript`.
  - `curl "http://localhost:3000/api/widget/bot-khong-ton-tai/config?key=x"` → 403 JSON.

- [ ] **Step 8: Commit**

```bash
git add src/types.ts widget.sql supabaseService.ts server.ts
git commit -m "feat(widget): API công khai chat/messages/config/frame/loader + nối takeover & BYO scope"
```

---

### Task 4: Endpoints cấu hình widget cho chủ bot

**Files:**
- Modify: `server.ts`

**Interfaces:**
- Consumes: `randomToken` (đã import từ `./facebookOauth.js`), `dbUpdateBot`, mảng `bots`, middleware chủ sở hữu (tự áp vì route nằm dưới `/api/bots/:botId/`).
- Produces cho Task 5 (UI):
  - `POST /api/bots/:botId/widget-config` body `{ enable?: boolean; disable?: boolean; widgetColor?: string; widgetTitle?: string; widgetGreeting?: string }` → `{ success, bot: { widgetKey, widgetColor, widgetTitle, widgetGreeting } }`
  - `POST /api/bots/:botId/widget-key/regenerate` → `{ success, widgetKey }`

- [ ] **Step 1: Thêm 2 route** (đặt cạnh `POST /api/bots/:botId/assistant-config` cho cùng nhóm):

```ts
// Bật/tắt + tùy biến widget website. enable lần đầu tự sinh widgetKey.
app.post("/api/bots/:botId/widget-config", async (req, res) => {
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === req.params.botId);
  if (!bot) return res.status(404).json({ error: "Bot không tồn tại." });

  const { enable, disable, widgetColor, widgetTitle, widgetGreeting } = req.body || {};
  const updates: Partial<BotConfig> = {};
  if (enable && !bot.widgetKey) updates.widgetKey = "wk_" + randomToken(12); // 24 hex
  if (disable) updates.widgetKey = null;
  if (typeof widgetColor === "string") updates.widgetColor = /^#[0-9a-fA-F]{6}$/.test(widgetColor) ? widgetColor : "";
  if (typeof widgetTitle === "string") updates.widgetTitle = widgetTitle.trim().slice(0, 60);
  if (typeof widgetGreeting === "string") updates.widgetGreeting = widgetGreeting.trim().slice(0, 300);

  const idx = bots.findIndex(b => b.id === bot.id);
  if (idx !== -1) bots[idx] = { ...bots[idx], ...updates };
  await dbUpdateBot(bot.id, updates);
  const merged = { ...bot, ...updates };
  res.json({ success: true, bot: {
    widgetKey: merged.widgetKey || null,
    widgetColor: merged.widgetColor || "",
    widgetTitle: merged.widgetTitle || "",
    widgetGreeting: merged.widgetGreeting || "",
  }});
});

// Đổi khóa: mã nhúng cũ trên site shop chết ngay (thu hồi khi bị nhúng trộm).
app.post("/api/bots/:botId/widget-key/regenerate", async (req, res) => {
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === req.params.botId);
  if (!bot) return res.status(404).json({ error: "Bot không tồn tại." });
  const widgetKey = "wk_" + randomToken(12);
  const idx = bots.findIndex(b => b.id === bot.id);
  if (idx !== -1) bots[idx] = { ...bots[idx], widgetKey };
  await dbUpdateBot(bot.id, { widgetKey });
  res.json({ success: true, widgetKey });
});
```

Kiểm tra chữ ký `randomToken` trong `facebookOauth.ts` trước khi dùng: nếu tham số là số BYTE (`randomToken(n)` → 2n hex) thì `randomToken(12)` = 24 hex như constraint; nếu khác, chỉnh tham số cho ra đúng 24 ký tự hex.

- [ ] **Step 2: Kiểm tra** — `npx tsc --noEmit`; `npx vitest run` xanh. Smoke: gọi widget-config với header `x-balabot-user-id` sai chủ → phải 403 (middleware); đúng chủ → nhận widgetKey `wk_` + 24 hex.

- [ ] **Step 3: Commit**

```bash
git add server.ts
git commit -m "feat(widget): endpoint bật/tắt/tùy biến + đổi khóa widget cho chủ bot"
```

---

### Task 5: Dashboard — tab "Website" (App.tsx)

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 4 endpoints; `buildEmbedSnippet` KHÔNG import vào App.tsx (frontend tự dựng chuỗi — giữ widget/ thuần backend); `getScopedApiHeaders` + fetch interceptor sẵn có (tự đính header).

**Các mối phải khớp pattern sẵn có trong App.tsx (đọc code lân cận trước khi sửa):**
1. Union `activeTab` (khai báo `useState<'dashboard' | 'config' | ...>`) — thêm `'website'`.
2. Sidebar: thêm nút "🌐 Website" ngay sau nút kênh Zalo, copy đúng markup/class của nút Zalo (đổi icon `Globe` từ lucide-react — đã có import lucide trong file, thêm `Globe` vào danh sách import nếu chưa có).
3. Tiêu đề topbar: thêm `{activeTab === 'website' && 'Kết nối Website'}` cạnh các dòng tương tự.
4. Nội dung tab: block `{activeTab === 'website' && bots.length > 0 && (...)}` đặt cạnh block tab zalo.

- [ ] **Step 1: State + fetch config khi mở tab**

```tsx
// Widget website states (đặt cạnh các state kênh khác)
const [widgetCfg, setWidgetCfg] = useState<{ widgetKey: string | null; widgetColor: string; widgetTitle: string; widgetGreeting: string } | null>(null);
const [widgetSaving, setWidgetSaving] = useState(false);

useEffect(() => {
  if (activeTab !== 'website' || !selectedBotId) return;
  const bot = bots.find(b => b.id === selectedBotId);
  setWidgetCfg({
    widgetKey: (bot as any)?.widgetKey || null,
    widgetColor: (bot as any)?.widgetColor || '',
    widgetTitle: (bot as any)?.widgetTitle || '',
    widgetGreeting: (bot as any)?.widgetGreeting || '',
  });
}, [activeTab, selectedBotId, bots]);

const saveWidgetConfig = async (body: Record<string, unknown>) => {
  setWidgetSaving(true);
  try {
    const res = await fetch(`/api/bots/${selectedBotId}/widget-config`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const d = await res.json();
    if (d.success) { setWidgetCfg(d.bot); fetchBots(sbUser?.id); }
    else alert(d.error || 'Lưu thất bại');
  } finally { setWidgetSaving(false); }
};
```

(`bots` đã là BotConfig có field mới sau Task 3 → bỏ `as any` nếu type import cho phép.)

- [ ] **Step 2: UI tab** — thẻ trắng bo góc chuẩn dự án (`bg-white rounded-xl border border-slate-200 shadow-xs p-6`):
  - **Chưa bật** (`!widgetCfg?.widgetKey`): mô tả 1 đoạn ("Dán 1 dòng mã vào website là khách nhắn được với bot — chạy đúng bộ não đang dùng cho Telegram/Messenger") + nút emerald "Bật widget & tạo mã nhúng" → `saveWidgetConfig({ enable: true })`.
  - **Đã bật**: 
    - 3 ô tùy biến: input màu (`type="color"`, value `widgetCfg.widgetColor || '#059669'`), input tên hiển thị (placeholder = tên bot), textarea lời chào (placeholder mặc định) + nút "Lưu tùy biến" → `saveWidgetConfig({ widgetColor, widgetTitle, widgetGreeting })`.
    - Ô mã nhúng chỉ-đọc (textarea mono, 3 dòng) với giá trị:
      ```tsx
      const embedCode = `<script src="${window.location.origin}${window.location.pathname.startsWith('/balabot') ? '/balabot' : ''}/api/widget/loader.js" data-bot="${selectedBotId}" data-key="${widgetCfg.widgetKey}" async></script>`;
      ```
      cùng nút "📋 Copy mã" (`navigator.clipboard.writeText(embedCode)` + đổi nhãn "✓ Đã copy" 2 giây).
    - Hướng dẫn 3 bước ngắn: Copy mã → dán trước `</body>` (hoặc mục "Mã tùy chỉnh/Custom code" của WordPress/Haravan/LadiPage) → tải lại trang thấy bong bóng chat.
    - Hàng nút nguy hiểm: "🔄 Đổi khóa" (confirm: "Mã nhúng cũ trên website sẽ ngừng hoạt động, shop phải dán lại mã mới. Tiếp tục?") → POST `/api/bots/${selectedBotId}/widget-key/regenerate` → cập nhật `widgetCfg.widgetKey`; "Tắt widget" (confirm) → `saveWidgetConfig({ disable: true })`.

- [ ] **Step 3: Kiểm tra** — `npx tsc --noEmit` sạch; `npm run build` xanh; `npx vitest run` xanh (không test UI mới — theo lệ dự án App.tsx không có unit test).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(widget): tab Website — bật widget, tùy biến, copy mã nhúng, đổi khóa"
```

---

### Task 6 (controller, sau final review): Deploy + việc owner

- Push main (Railway tự deploy backend) + `npx wrangler pages deploy dist --project-name=aaa-balabot --branch=main --commit-dirty=true`.
- Owner chạy `widget.sql` trên DB gốc.
- UAT theo spec mục 6: dán snippet vào file HTML tĩnh, chat 3 lượt, để SĐT → lead + Telegram notify, operator trả lời → widget nhận ≤5s, Đổi khóa → widget cũ chết, Tắt → bong bóng biến mất.
