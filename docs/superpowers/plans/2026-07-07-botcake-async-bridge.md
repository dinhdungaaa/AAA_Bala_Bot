# Botcake Async Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botcake gọi BalaBot rồi nhận 200 ngay; BalaBot chạy RAG ở nền và đẩy câu trả lời lại cho khách qua Botcake send_flow API — hết vấn đề timeout.

**Architecture:** Endpoint async trả 200 tức thì + xử lý nền fire-and-forget gọi `sendBotcakeFlow`; config per-bot (pageId/accessToken/replyFlowId); UI + guide. Tái dùng `generateRAGAnswer`, `parseBridgePayload`, session/usage sẵn có.

**Tech Stack:** Express 4, TypeScript, vitest, React 19. Không thêm dependency.

**Spec:** `docs/superpowers/specs/2026-07-07-botcake-async-bridge-design.md`

## Global Constraints

- Endpoint async LUÔN trả HTTP 200 `{"messages":[]}` ngay (kể cả auth sai / thiếu text / thiếu config) — xử lý nền chạy SAU khi đã trả response, lỗi nền chỉ log.
- Xử lý nền KHÔNG dùng cờ `fast` (async không cần vội — giữ chất lượng đầy đủ, thinking bật như mặc định).
- send_flow: `POST https://botcake.io/api/public_api/v1/pages/{pageId}/flows/send_flow`, header `access-token: <token>` + `Content-Type: application/json`, body `{ psid, flow_id: <replyFlowId>, payload: { bot_reply: <text> } }`. LOG status + response body để chẩn đoán.
- Parse payload tolerant dùng `parseBridgePayload` (Task 1 của bản sync, đã có trong `botcakeBridge.ts`).
- accessToken KHÔNG bao giờ trả ra client (chỉ trả cờ `hasAccessToken`); body config rỗng accessToken → giữ giá trị cũ.
- Session channel = "botcake" (tái dùng), userKey `botcake:<psid>`.
- Mọi chuỗi cho khách/chủ shop bằng tiếng Việt.
- `npm run lint` sạch + `npx vitest run` xanh trước mỗi commit.

---

### Task 1: `sendBotcakeFlow` + migration + types + unit test

**Files:**
- Create: `botcakeAsync.ts` (root) — hàm build request thuần để test được
- Create: `__tests__/botcakeAsync.test.ts`
- Create: `botcakeAsync.sql` (root)
- Modify: `src/types.ts` (BotConfig, sau `botcakeBridgeKey?: string;`)

**Interfaces:**
- Consumes: không.
- Produces (Task 2 dùng): `buildSendFlowRequest(opts: { pageId: string; accessToken: string; replyFlowId: string; psid: string; text: string }): { url: string; headers: Record<string,string>; body: string }`

- [ ] **Step 1: Viết test fail — `__tests__/botcakeAsync.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildSendFlowRequest } from "../botcakeAsync.js";

describe("buildSendFlowRequest", () => {
  const base = { pageId: "P1", accessToken: "TOK", replyFlowId: "F9", psid: "u123", text: "Chào bạn" };

  it("URL đúng endpoint public_api theo pageId", () => {
    const r = buildSendFlowRequest(base);
    expect(r.url).toBe("https://botcake.io/api/public_api/v1/pages/P1/flows/send_flow");
  });

  it("header access-token + content-type", () => {
    const r = buildSendFlowRequest(base);
    expect(r.headers["access-token"]).toBe("TOK");
    expect(r.headers["Content-Type"]).toBe("application/json");
  });

  it("body chứa psid, flow_id, payload.bot_reply", () => {
    const r = buildSendFlowRequest(base);
    const parsed = JSON.parse(r.body);
    expect(parsed.psid).toBe("u123");
    expect(parsed.flow_id).toBe("F9");
    expect(parsed.payload.bot_reply).toBe("Chào bạn");
  });

  it("encode pageId vào URL an toàn", () => {
    const r = buildSendFlowRequest({ ...base, pageId: "a/b?c" });
    expect(r.url).toContain("pages/a%2Fb%3Fc/flows/send_flow");
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npx vitest run __tests__/botcakeAsync.test.ts`
Expected: FAIL — `Cannot find module '../botcakeAsync.js'`

- [ ] **Step 3: Viết `botcakeAsync.ts`**

```ts
// Build request gọi Botcake Public API send_flow — đẩy câu trả lời của bot lại cho
// khách theo PSID (bất đồng bộ, không phụ thuộc timeout của Dynamic Block).
// Tách khỏi server.ts để unit-test; server.ts dùng để fetch thật.
export function buildSendFlowRequest(opts: {
  pageId: string;
  accessToken: string;
  replyFlowId: string;
  psid: string;
  text: string;
}): { url: string; headers: Record<string, string>; body: string } {
  const url = `https://botcake.io/api/public_api/v1/pages/${encodeURIComponent(opts.pageId)}/flows/send_flow`;
  const headers = {
    "access-token": opts.accessToken,
    "Content-Type": "application/json",
  };
  const body = JSON.stringify({
    psid: opts.psid,
    flow_id: opts.replyFlowId,
    payload: { bot_reply: opts.text },
  });
  return { url, headers, body };
}
```

- [ ] **Step 4: Migration `botcakeAsync.sql`**

```sql
-- Botcake async bridge: cau hinh de BalaBot goi nguoc send_flow API cua Botcake.
-- Bang bots dung camelCase nen phai quote.
alter table bots add column if not exists "botcakePageId" text;
alter table bots add column if not exists "botcakeAccessToken" text;
alter table bots add column if not exists "botcakeReplyFlowId" text;
```

(Chủ dự án chạy tay trên Supabase — ghi trong report; KHÔNG tự chạy.)

- [ ] **Step 5: Thêm 3 field vào `src/types.ts` (sau `botcakeBridgeKey?: string;`)**

```ts
  // Botcake async bridge — cấu hình gọi ngược send_flow API.
  botcakePageId?: string;
  botcakeAccessToken?: string;
  botcakeReplyFlowId?: string;
```

- [ ] **Step 6: Chạy test PASS + lint**

Run: `npx vitest run && npm run lint`
Expected: tất cả xanh; lint exit 0.

- [ ] **Step 7: Commit**

```bash
git add botcakeAsync.ts __tests__/botcakeAsync.test.ts botcakeAsync.sql src/types.ts
git commit -m "feat(async): buildSendFlowRequest + migration + type cấu hình Botcake async"
```

---

### Task 2: Endpoint async + xử lý nền + config route

**Files:**
- Modify: `server.ts` — import `buildSendFlowRequest`; thêm `sendBotcakeFlow`, `processBotcakeAsync`, route `POST /api/bridge/botcake-async/:botId`, route `POST /api/bots/:botId/botcake-config`, mở rộng `GET /api/bots/:botId/bridge-info`. Đặt CỤM này ngay sau route `POST /api/bridge/botcake/:botId` hiện có (tìm theo path).

**Interfaces:**
- Consumes: Task 1 (`buildSendFlowRequest`); sẵn có: `parseBridgePayload`, `buildBridgeResponse` (từ `./botcakeBridge.js`, đã import), `dbGetBots`, `bots`, `dbUpdateBot`, `chatSessions`, `dbSaveConversation`, `generateRAGAnswer`, `checkUsageGate`, `recordUsageForBot`, `BLOCK_MESSAGE`, `analytics`, type `Message`, `BRIDGE_BACKEND_ORIGIN` (đã khai báo ở bản sync).
- Produces (Task 3 dùng): `POST /api/bots/:botId/botcake-config` nhận `{pageId, accessToken, replyFlowId}`; `GET /api/bots/:botId/bridge-info` trả thêm `{ asyncBridgeUrl, botcakePageId, botcakeReplyFlowId, hasAccessToken }`.

- [ ] **Step 1: Thêm `sendBotcakeFlow` + `processBotcakeAsync` + route async (sau route sync `/api/bridge/botcake/:botId`)**

```ts
// Gọi Botcake Public API để đẩy 1 đoạn text lại cho khách theo PSID.
async function sendBotcakeFlow(bot: BotConfig, psid: string, text: string): Promise<boolean> {
  if (!bot.botcakePageId || !bot.botcakeAccessToken || !bot.botcakeReplyFlowId) {
    console.warn(`[Botcake Async] Bot ${bot.id} thiếu cấu hình gửi lại (pageId/accessToken/replyFlowId).`);
    return false;
  }
  const req = buildSendFlowRequest({
    pageId: bot.botcakePageId,
    accessToken: bot.botcakeAccessToken,
    replyFlowId: bot.botcakeReplyFlowId,
    psid,
    text,
  });
  try {
    const res = await fetch(req.url, { method: "POST", headers: req.headers, body: req.body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false || data?.error) {
      console.warn(`[Botcake Async] send_flow thất bại (HTTP ${res.status}):`, JSON.stringify(data).slice(0, 500));
      return false;
    }
    console.log(`[Botcake Async] Đã gửi trả lời cho psid ${psid} (bot ${bot.id}).`);
    return true;
  } catch (err: any) {
    console.error("[Botcake Async] Lỗi gọi send_flow:", err?.message || err);
    return false;
  }
}

// Xử lý nền: chạy SAU khi đã trả 200 cho Botcake. Không throw ra ngoài.
async function processBotcakeAsync(bot: BotConfig, psid: string, text: string, fullName: string): Promise<void> {
  try {
    const userKey = `botcake:${psid}`;
    const username = `botcake_${psid}`;
    const name = fullName || "Khách hàng Facebook";

    let session = chatSessions.find(s => s.botId === bot.id && s.telegramUserId === userKey);
    if (!session) {
      session = {
        id: "sess-bca-" + Math.random().toString(36).substr(2, 9),
        botId: bot.id,
        telegramUserId: userKey,
        telegramUsername: username,
        telegramFullName: name,
        lastMessageText: text,
        lastMessageTime: new Date().toISOString(),
        status: "bot_answered",
        internalNotes: "Đến từ kênh Botcake (async)",
        messages: []
      };
      chatSessions.unshift(session);
    }
    session.channel = "botcake";
    session.channelChatId = psid;
    session.channelIsGroup = false;
    session.channelSenderId = psid;

    const hasPriorBotReply = session.messages.some(msg => msg.sender === "bot");
    const userMsg: Message = {
      id: "m-bca-" + Math.random().toString(36).substr(2, 9),
      sender: "user", username, fullName: name, text,
      timestamp: new Date().toISOString()
    };
    session.messages.push(userMsg);
    session.lastMessageText = text;
    session.lastMessageTime = userMsg.timestamp;

    let aiAnswer: { text: string; sources: any[]; fallbackTriggered: boolean };
    const gate = await checkUsageGate(bot);
    if (!gate.allowed) {
      aiAnswer = { text: BLOCK_MESSAGE, sources: [], fallbackTriggered: true };
    } else {
      aiAnswer = await generateRAGAnswer(
        bot, text,
        { fullName: name, username, id: userKey },
        { shouldGreet: !hasPriorBotReply, recentMessages: session.messages.slice(-8, -1) }
      );
      await recordUsageForBot(bot);
    }

    const botMsg: Message = {
      id: "m-bca-bot-" + Math.random().toString(36).substr(2, 9),
      sender: "bot", username: bot.name, text: aiAnswer.text,
      timestamp: new Date().toISOString(),
      sourcesUsed: aiAnswer.sources, fallbackTriggered: aiAnswer.fallbackTriggered
    };
    session.messages.push(botMsg);
    session.lastMessageText = aiAnswer.text;
    session.lastMessageTime = botMsg.timestamp;
    session.status = aiAnswer.fallbackTriggered ? "escalated" : "bot_answered";
    analytics.totalMessages += 2;

    await sendBotcakeFlow(bot, psid, aiAnswer.text);
    try { await dbSaveConversation(session); } catch (e) { console.warn("[Botcake Async] Skip Supabase:", e); }
  } catch (err: any) {
    console.error("[Botcake Async] Lỗi xử lý nền:", err?.message || err);
    try { await sendBotcakeFlow(bot, psid, bot.fallbackMessage || "Dạ em xin phép kết nối nhân viên hỗ trợ mình ngay ạ."); } catch {}
  }
}

// Endpoint async: Botcake POST vào đây, nhận 200 ngay, bot trả lời sau qua send_flow.
app.post("/api/bridge/botcake-async/:botId", async (req, res) => {
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === req.params.botId);
  const key = String(req.query.key || req.body?.key || "");
  const ack = () => res.json({ messages: [] });

  if (!bot || !bot.botcakeBridgeKey || key !== bot.botcakeBridgeKey) {
    console.warn("[Botcake Async] Key không hợp lệ hoặc bot không tồn tại:", req.params.botId);
    return ack();
  }
  const payload = parseBridgePayload(req.body);
  if (!payload.text || !payload.psid) {
    console.warn("[Botcake Async] Thiếu text/psid. keys:", JSON.stringify(Object.keys(req.body || {})));
    return ack();
  }
  if (!bot.botcakePageId || !bot.botcakeAccessToken || !bot.botcakeReplyFlowId) {
    console.warn(`[Botcake Async] Bot ${bot.id} chưa cấu hình gửi lại — không thể trả lời.`);
    return ack();
  }
  // Trả 200 NGAY rồi xử lý nền (không await → Botcake không phải chờ).
  ack();
  void processBotcakeAsync(bot, payload.psid, payload.text, payload.fullName);
});
```

- [ ] **Step 2: Route lưu cấu hình + mở rộng bridge-info**

Thêm route config (cạnh cụm trên):
```ts
app.post("/api/bots/:botId/botcake-config", async (req, res) => {
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === req.params.botId);
  if (!bot) return res.status(404).json({ error: "Không tìm thấy bot." });
  const pageId = String(req.body?.pageId || "").trim();
  const replyFlowId = String(req.body?.replyFlowId || "").trim();
  const accessToken = String(req.body?.accessToken || "").trim();
  const updates: any = { botcakePageId: pageId, botcakeReplyFlowId: replyFlowId };
  // accessToken rỗng trong body → giữ token cũ (không ghi đè bằng rỗng).
  if (accessToken) updates.botcakeAccessToken = accessToken;
  const memBot = bots.find(b => b.id === bot.id);
  if (memBot) Object.assign(memBot, updates);
  await dbUpdateBot(bot.id, updates);
  res.json({ success: true });
});
```

Tìm route `GET /api/bots/:botId/bridge-info` (bản sync) và thêm vào object `res.json(...)` các trường:
```ts
    asyncBridgeUrl: `${BRIDGE_BACKEND_ORIGIN}/api/bridge/botcake-async/${encodeURIComponent(bot.id)}?key=${encodeURIComponent(bot.botcakeBridgeKey)}`,
    botcakePageId: bot.botcakePageId || "",
    botcakeReplyFlowId: bot.botcakeReplyFlowId || "",
    hasAccessToken: !!bot.botcakeAccessToken,
```
(Đảm bảo `bot.botcakeBridgeKey` đã được sinh trước đó trong chính route bridge-info — nó đã có logic tự sinh key; giữ nguyên, chỉ thêm các trường trên vào response sau khi key tồn tại.)

- [ ] **Step 3: Lint + test + smoke**

Run: `npm run lint && npx vitest run`
Expected: xanh.

Smoke (server dev PORT=3100, PowerShell Invoke-WebRequest):
- POST `/api/bridge/botcake-async/khong-ton-tai?key=x` body `{"text":"hi","psid":"u1"}` → 200 body `{"messages":[]}` + log "Key không hợp lệ".
Expected đúng vậy → route sống, trả 200 ngay, không xử lý. Kill server.

- [ ] **Step 4: Commit**

```bash
git add server.ts
git commit -m "feat(async): endpoint botcake-async trả 200 ngay + xử lý nền gọi send_flow + route config"
```

---

### Task 3: Dashboard — Async URL + 3 ô cấu hình

**Files:**
- Modify: `src/App.tsx` — trong card "Kết nối Fanpage qua Botcake" (tìm text đó); thêm state + handler lưu config; UI async lên trên, bọc URL sync cũ vào `<details>`.

**Interfaces:**
- Consumes: `GET /api/bots/:botId/bridge-info` (nay trả thêm `asyncBridgeUrl, botcakePageId, botcakeReplyFlowId, hasAccessToken`); `POST /api/bots/:botId/botcake-config`.
- Produces: không.

- [ ] **Step 1: Thêm state (cạnh `bridgeInfo` đã có)**

```tsx
  const [botcakePageId, setBotcakePageId] = useState('');
  const [botcakeAccessToken, setBotcakeAccessToken] = useState('');
  const [botcakeReplyFlowId, setBotcakeReplyFlowId] = useState('');
  const [savingBotcakeCfg, setSavingBotcakeCfg] = useState(false);
```

- [ ] **Step 2: Nạp giá trị khi có bridgeInfo — sửa `fetchBridgeInfo` (chỗ `setBridgeInfo(data)`)**

Ngay sau `setBridgeInfo(data);` thêm:
```tsx
        setBotcakePageId(data.botcakePageId || '');
        setBotcakeReplyFlowId(data.botcakeReplyFlowId || '');
        setBotcakeAccessToken(''); // không nhận token cũ về; để trống = giữ nguyên khi lưu
```

- [ ] **Step 3: Handler lưu cấu hình (cạnh `handleRegenBridgeKey`)**

```tsx
  const handleSaveBotcakeConfig = async () => {
    if (!selectedBotId) return;
    setSavingBotcakeCfg(true);
    try {
      const res = await fetch(`/api/bots/${selectedBotId}/botcake-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getScopedApiHeaders() },
        body: JSON.stringify({ pageId: botcakePageId.trim(), accessToken: botcakeAccessToken.trim(), replyFlowId: botcakeReplyFlowId.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFacebookActionMsg({ status: 'success', text: 'Đã lưu cấu hình Botcake. Nhắn thử để kiểm tra.' });
        fetchBridgeInfo();
      } else {
        setFacebookActionMsg({ status: 'error', text: data.error || 'Không lưu được cấu hình.' });
      }
    } catch (err: any) {
      setFacebookActionMsg({ status: 'error', text: 'Lỗi lưu cấu hình: ' + err.message });
    } finally {
      setSavingBotcakeCfg(false);
    }
  };
```

- [ ] **Step 4: UI — thay phần hiển thị URL trong card Botcake**

Trong khối `{bridgeInfo && (...)}` (chỗ đang hiện `bridgeInfo.bridgeUrl` + Copy + Đổi key), thay bằng:
```tsx
                      <div className="space-y-3">
                        <div>
                          <span className="text-[11px] font-bold text-slate-600">Bridge URL (async — khuyến nghị)</span>
                          <div className="font-mono text-xs text-slate-700 bg-slate-50 border border-slate-100 rounded-lg p-3 break-all select-all mt-1">
                            {(bridgeInfo as any).asyncBridgeUrl || bridgeInfo.bridgeUrl}
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <button type="button" onClick={() => { navigator.clipboard?.writeText((bridgeInfo as any).asyncBridgeUrl || bridgeInfo.bridgeUrl); setBridgeCopied(true); setTimeout(() => setBridgeCopied(false), 2000); }} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs">
                              {bridgeCopied ? 'Đã copy ✓' : 'Copy URL'}
                            </button>
                            <button type="button" onClick={handleRegenBridgeKey} disabled={isFetchingBridge} className="px-3 py-2 text-[11px] font-bold text-rose-600 hover:text-rose-700 disabled:opacity-50">Đổi key</button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2 pt-2 border-t border-slate-100">
                          <span className="text-[11px] font-bold text-slate-600">Cấu hình gửi trả lời (Botcake API)</span>
                          <input value={botcakePageId} onChange={e => setBotcakePageId(e.target.value)} placeholder="Page ID (Botcake)" className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                          <input value={botcakeReplyFlowId} onChange={e => setBotcakeReplyFlowId(e.target.value)} placeholder="Flow ID của flow trả lời" className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                          <input type="password" value={botcakeAccessToken} onChange={e => setBotcakeAccessToken(e.target.value)} placeholder={(bridgeInfo as any).hasAccessToken ? '••• access-token đã lưu (để trống nếu giữ nguyên)' : 'Access token (Botcake → Cài đặt → API)'} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                          <button type="button" onClick={handleSaveBotcakeConfig} disabled={savingBotcakeCfg} className="px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold rounded-lg text-xs">
                            {savingBotcakeCfg ? 'Đang lưu...' : 'Lưu cấu hình Botcake'}
                          </button>
                        </div>

                        <details>
                          <summary className="text-[11px] font-bold text-slate-500 cursor-pointer select-none">Cách cũ (đồng bộ — có thể chậm, không khuyến nghị)</summary>
                          <div className="font-mono text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-3 break-all select-all mt-2">
                            {bridgeInfo.bridgeUrl}
                          </div>
                        </details>
                      </div>
```

- [ ] **Step 5: Lint + build**

Run: `npm run lint && npx vite build`
Expected: sạch, build OK.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ui): Botcake async — hiện async URL + 3 ô cấu hình gửi trả lời"
```

---

### Task 4: Guide async + env note + verify tổng

**Files:**
- Create: `docs/botcake-async-guide.md`

**Interfaces:**
- Consumes: toàn bộ endpoint/UI đã build.
- Produces: tài liệu.

- [ ] **Step 1: Viết `docs/botcake-async-guide.md`** — tiếng Việt đầy đủ, không placeholder, cho chủ shop:

1. **Vì sao dùng cách async** (bản đồng bộ cũ chờ ~5s không kịp bot nghĩ ~6-11s; async gửi trả lời sau nên luôn tới khách).
2. **Chuẩn bị trong Botcake:**
   - Tạo tài khoản + kết nối Page (như cũ).
   - Tạo **custom field** `bot_reply` (User Field, kiểu Chuỗi ký tự) nếu chưa có.
   - Tạo một **Flow trả lời** riêng: 1 khối Văn bản duy nhất chứa biến `{{bot_reply}}` → Lưu.
     Lấy **Flow ID** của flow này (thường nằm trên URL khi mở flow, hoặc trong danh sách flow → chi tiết).
   - Lấy **Page ID** và tạo **Access Token**: Botcake → Cài đặt (Settings) → API → Generate Token.
3. **Nhập vào BalaBot:** dashboard → tab Facebook → card "Kết nối Fanpage qua Botcake" →
   dán **Page ID**, **Flow ID**, **Access Token** → "Lưu cấu hình Botcake". Copy **Bridge URL (async)**.
4. **Cấu hình Default Reply trong Botcake:** Automation → Tin nhắn mặc định → Dynamic Block (JSON API):
   - Method POST, URL = Bridge URL (async) vừa copy.
   - Body: `{ "text": "{{last_text_input}}", "psid": "{{psid}}", "name": "{{user_full_name}}" }`
     (chọn biến thật của Botcake khi gõ `{{`, giống bản cũ).
   - **KHÔNG cần Save Respond, KHÔNG cần khối văn bản** — bot sẽ tự gửi trả lời qua flow riêng.
   - Bật "Gửi không giới hạn" + "Ngay lập tức" + Kích hoạt.
5. **Test:** nick FB khác nhắn vào Page → chờ vài giây → bot trả lời.
6. **Lỗi thường gặp:** không thấy trả lời → xem Railway Deploy Logs, tìm `[Botcake Async]`:
   - "chưa cấu hình gửi lại" → thiếu Page ID/Flow ID/Access Token.
   - "send_flow thất bại (HTTP ...)" → sai token/page_id/flow_id, hoặc format payload — gửi dòng log cho dev.
   - Không có dòng nào → Botcake chưa gọi (kiểm tra Default Reply đã bật, URL đủ `?key=`).
7. **Bước kiểm chứng lần đầu (chủ dự án):** làm đủ với Page test; đọc log `[Botcake Async] Đã gửi...`
   xác nhận send_flow trả ok. Nếu payload map field khác `bot_reply`, báo dev sửa `buildSendFlowRequest`.

- [ ] **Step 2: Verify tổng**

Run: `npm run lint && npx vitest run && npm run build`
Expected: cả ba xanh.

- [ ] **Step 3: Commit**

```bash
git add docs/botcake-async-guide.md
git commit -m "docs(async): hướng dẫn cài Botcake async bridge"
```

(Deploy: sau final review, controller merge/push main → Railway + wrangler pages deploy. Chủ dự án chạy `botcakeAsync.sql` trên Supabase trước khi dùng thật.)

---

## Self-Review

- **Spec coverage:** endpoint async trả 200 ngay + xử lý nền (T2); sendBotcakeFlow gọi API + log (T1 build/T2 fetch); config per-bot pageId/accessToken/replyFlowId + migration + type (T1/T2); bridge-info mở rộng + không lộ token (T2); UI async URL + 3 ô + ẩn sync cũ (T3); guide async + kiểm chứng (T4); tái dùng generateRAGAnswer không fast (T2); parse tolerant (T2 dùng parseBridgePayload). Đủ.
- **Placeholder:** không TBD; các chi tiết API "kiểm chứng thực tế" là bước có chủ đích (docs Botcake không đọc máy được), code log đầy đủ để chỉnh nhanh — không phải lỗ hổng plan.
- **Type consistency:** `buildSendFlowRequest` T1 khớp cách gọi trong `sendBotcakeFlow` T2; field `botcakePageId/botcakeAccessToken/botcakeReplyFlowId` khớp types.ts/SQL/route/UI; response bridge-info (`asyncBridgeUrl/hasAccessToken/...`) khớp cách đọc ở T3.
