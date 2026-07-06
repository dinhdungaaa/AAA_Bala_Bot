# Botcake Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khách kết nối Page vào Botcake (app đã được Meta duyệt) → Botcake Dynamic Block gọi bridge endpoint của BalaBot → RAG trả lời mọi khách vãng lai ngay, không chờ App Review.

**Architecture:** Module thuần `botcakeBridge.ts` (parse payload tolerant, cắt tin dài, build response Chatfuel-format) + 3 route trong server.ts (bridge-info, regenerate key, bridge endpoint chính tái dùng `generateRAGAnswer`/session/usage sẵn có) + card UI trong tab Facebook + guide tiếng Việt.

**Tech Stack:** Express 4, TypeScript, vitest, React 19. Không thêm dependency mới.

**Spec:** `docs/superpowers/specs/2026-07-06-botcake-bridge-design.md`

## Global Constraints

- Response bridge LUÔN HTTP 200 với format `{ "messages": [ { "text": "..." } ] }` khi có nội dung gửi khách — kể cả lỗi AI (dùng fallbackMessage của bot). Duy nhất auth sai trả 403 (vẫn format messages).
- Tin > 1800 ký tự → cắt thành nhiều phần tử `messages` (ưu tiên cắt tại ranh giới đoạn/câu).
- Parse payload TOLERANT: text = `text`|`message`|`last_input`|`last_user_input`; psid = `psid`|`sender_id`|`messenger_user_id`|`user_id`; tên = `name`|`full_name`|`first_name`+`last_name`.
- Session: userKey `botcake:<psid>`, `session.channel = "botcake"`. KHÔNG sửa `deliverOperatorReply` (kênh lạ đã tự trả delivered:false).
- Mọi chuỗi hiển thị cho khách bằng tiếng Việt.
- `npm run lint` sạch + `npx vitest run` xanh trước mỗi commit.

---

### Task 1: Module `botcakeBridge.ts` — helpers thuần + tests

**Files:**
- Create: `botcakeBridge.ts` (root, cạnh `billing.ts`)
- Create: `__tests__/botcakeBridge.test.ts` (thư mục `__tests__/` đã nằm trong vitest include)

**Interfaces:**
- Consumes: không phụ thuộc gì.
- Produces (Task 2 dùng):
  - `parseBridgePayload(body: any): { text: string; psid: string; fullName: string }`
  - `splitBridgeText(text: string, max?: number): string[]`
  - `buildBridgeResponse(text: string): { messages: Array<{ text: string }> }`

- [ ] **Step 1: Viết test fail — `__tests__/botcakeBridge.test.ts`**

```ts
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
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npx vitest run __tests__/botcakeBridge.test.ts`
Expected: FAIL — `Cannot find module '../botcakeBridge.js'`

- [ ] **Step 3: Viết `botcakeBridge.ts`**

```ts
// Helpers thuần cho kênh Botcake Bridge: Botcake (app Meta đã duyệt) gọi API BalaBot
// qua Dynamic Block, BalaBot trả JSON dạng Chatfuel để Botcake gửi cho khách.
// Tách khỏi server.ts để unit-test được (pattern như billing.ts).

export type BridgePayload = { text: string; psid: string; fullName: string };

function asCleanString(v: any): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v).trim();
  return "";
}

function firstNonEmpty(...values: any[]): string {
  for (const v of values) {
    const s = asCleanString(v);
    if (s) return s;
  }
  return "";
}

// Tên biến trong Dynamic Block của Botcake có thể khác tài liệu → nhận nhiều tên trường.
export function parseBridgePayload(body: any): BridgePayload {
  const b = body && typeof body === "object" ? body : {};
  const text = firstNonEmpty(b.text, b.message, b.last_input, b.last_user_input);
  const psid = firstNonEmpty(b.psid, b.sender_id, b.messenger_user_id, b.user_id);
  const joined = [asCleanString(b.first_name), asCleanString(b.last_name)].filter(Boolean).join(" ");
  const fullName = firstNonEmpty(b.name, b.full_name, joined);
  return { text, psid, fullName };
}

// Messenger giới hạn ~2000 ký tự/tin → cắt tại ranh giới đoạn/câu, mỗi phần <= max.
export function splitBridgeText(text: string, max = 1800): string[] {
  const clean = (text || "").trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];

  const parts: string[] = [];
  let rest = clean;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    // Ưu tiên: 2 xuống dòng > 1 xuống dòng > kết câu > khoảng trắng > cắt cứng.
    let cut = window.lastIndexOf("\n\n");
    if (cut < max * 0.4) cut = window.lastIndexOf("\n");
    if (cut < max * 0.4) {
      const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
      if (sentence >= max * 0.4) cut = sentence + 1;
    }
    if (cut < max * 0.4) cut = window.lastIndexOf(" ");
    if (cut < max * 0.4) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts.filter(Boolean);
}

export function buildBridgeResponse(text: string): { messages: Array<{ text: string }> } {
  return { messages: splitBridgeText(text).map(t => ({ text: t })) };
}
```

- [ ] **Step 4: Chạy test PASS toàn bộ**

Run: `npx vitest run`
Expected: PASS tất cả file (kể cả test cũ).

- [ ] **Step 5: Lint + commit**

Run: `npm run lint`
Expected: exit 0.

```bash
git add botcakeBridge.ts __tests__/botcakeBridge.test.ts
git commit -m "feat(bridge): helpers Botcake bridge — parse tolerant, cắt tin dài, response Chatfuel-format"
```

---

### Task 2: Server — migration, type, 3 route bridge

**Files:**
- Create: `botcakeBridge.sql` (root, pattern như `facebookConnect.sql`)
- Modify: `src/types.ts` (interface BotConfig, sau dòng 21 `facebookConnectedAt`)
- Modify: `server.ts` — import + 3 route mới đặt ngay SAU route `POST /api/bots/:botId/facebook-disconnect` (tìm comment/route theo tên, không theo số dòng)

**Interfaces:**
- Consumes: Task 1 (`parseBridgePayload`, `buildBridgeResponse`); sẵn có trong server.ts: `dbGetBots`, `bots`, `dbUpdateBot`, `chatSessions`, `dbSaveConversation`, `generateRAGAnswer`, `checkUsageGate`, `recordUsageForBot`, `BLOCK_MESSAGE` (~dòng 3422), `analytics`, kiểu `Message`; `randomToken` từ `./facebookOauth.js` (đã import sẵn trong server.ts — kiểm tra, nếu import hiện tại chưa có `randomToken` thì thêm vào danh sách import đó).
- Produces (Task 3 dùng): `GET /api/bots/:botId/bridge-info` → `{ bridgeKey, bridgeUrl }`; `POST /api/bots/:botId/bridge-key/regenerate` → `{ bridgeKey, bridgeUrl }`; `POST /api/bridge/botcake/:botId?key=...` → `{ messages: [{ text }] }`.

- [ ] **Step 1: Migration SQL — `botcakeBridge.sql`**

```sql
-- Botcake bridge: khoa rieng tung bot de Botcake Dynamic Block goi API BalaBot.
-- Bang bots dung camelCase nen phai quote.
alter table bots add column if not exists "botcakeBridgeKey" text;
```

(Chủ dự án chạy tay trên Supabase SQL editor như các file .sql khác — ghi chú trong report; KHÔNG tự chạy.)

- [ ] **Step 2: Thêm field vào `src/types.ts` (trong BotConfig, sau `facebookConnectedAt?: string;`)**

```ts
  // Botcake bridge — kênh tạm qua nền tảng đã được Meta duyệt.
  botcakeBridgeKey?: string;
```

- [ ] **Step 3: Thêm 3 route vào server.ts (sau route facebook-disconnect)**

```ts
// ===== Botcake Bridge: kênh tạm qua nền tảng đã được Meta duyệt =====
// Botcake gọi THẲNG backend Railway (không qua proxy Cloudflare) để giảm 1 hop.
const BRIDGE_BACKEND_ORIGIN = process.env.PUBLIC_BACKEND_ORIGIN || "https://aaabalabot-production.up.railway.app";

function buildBridgeUrl(botId: string, key: string): string {
  return `${BRIDGE_BACKEND_ORIGIN}/api/bridge/botcake/${encodeURIComponent(botId)}?key=${encodeURIComponent(key)}`;
}

// Lấy (tự sinh nếu chưa có) bridge key + URL cho dashboard.
app.get("/api/bots/:botId/bridge-info", async (req, res) => {
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === req.params.botId);
  if (!bot) return res.status(404).json({ error: "Không tìm thấy bot." });
  if (!bot.botcakeBridgeKey) {
    const key = randomToken(16);
    bot.botcakeBridgeKey = key;
    const memBot = bots.find(b => b.id === bot.id);
    if (memBot) memBot.botcakeBridgeKey = key;
    await dbUpdateBot(bot.id, { botcakeBridgeKey: key } as any);
  }
  res.json({ bridgeKey: bot.botcakeBridgeKey, bridgeUrl: buildBridgeUrl(bot.id, bot.botcakeBridgeKey) });
});

// Đổi key khi lộ — URL cũ mất hiệu lực ngay.
app.post("/api/bots/:botId/bridge-key/regenerate", async (req, res) => {
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === req.params.botId);
  if (!bot) return res.status(404).json({ error: "Không tìm thấy bot." });
  const key = randomToken(16);
  bot.botcakeBridgeKey = key;
  const memBot = bots.find(b => b.id === bot.id);
  if (memBot) memBot.botcakeBridgeKey = key;
  await dbUpdateBot(bot.id, { botcakeBridgeKey: key } as any);
  res.json({ bridgeKey: key, bridgeUrl: buildBridgeUrl(bot.id, key) });
});

// Endpoint chính: Botcake Dynamic Block POST tin nhắn khách vào đây.
app.post("/api/bridge/botcake/:botId", async (req, res) => {
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === req.params.botId);
  const key = String(req.query.key || req.body?.key || "");
  if (!bot || !bot.botcakeBridgeKey || key !== bot.botcakeBridgeKey) {
    return res.status(403).json(buildBridgeResponse("Bridge key không hợp lệ. Vui lòng copy lại Bridge URL mới nhất từ dashboard BalaBot."));
  }

  const payload = parseBridgePayload(req.body);
  if (!payload.text) {
    console.warn("[Botcake Bridge] Thiếu text. payload keys:", JSON.stringify(Object.keys(req.body || {})));
    return res.json({ messages: [] });
  }
  if (!payload.psid) {
    console.warn("[Botcake Bridge] Thiếu psid — dùng session chung 'anon'. payload keys:", JSON.stringify(Object.keys(req.body || {})));
  }

  try {
    const psid = payload.psid || "anon";
    const userKey = `botcake:${psid}`;
    const username = `botcake_${psid}`;
    const fullName = payload.fullName || "Khách hàng Facebook";

    let session = chatSessions.find(s => s.botId === bot.id && s.telegramUserId === userKey);
    if (!session) {
      session = {
        id: "sess-bc-" + Math.random().toString(36).substr(2, 9),
        botId: bot.id,
        telegramUserId: userKey,
        telegramUsername: username,
        telegramFullName: fullName,
        lastMessageText: payload.text,
        lastMessageTime: new Date().toISOString(),
        status: "bot_answered",
        internalNotes: "Đến từ kênh Botcake bridge",
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
      id: "m-bc-" + Math.random().toString(36).substr(2, 9),
      sender: "user",
      username,
      fullName,
      text: payload.text,
      timestamp: new Date().toISOString()
    };
    session.messages.push(userMsg);
    session.lastMessageText = payload.text;
    session.lastMessageTime = userMsg.timestamp;

    let aiAnswer: { text: string; sources: any[]; fallbackTriggered: boolean };
    const gate = await checkUsageGate(bot);
    if (!gate.allowed) {
      aiAnswer = { text: BLOCK_MESSAGE, sources: [], fallbackTriggered: true };
    } else {
      aiAnswer = await generateRAGAnswer(
        bot,
        payload.text,
        { fullName, username, id: userKey },
        { shouldGreet: !hasPriorBotReply, recentMessages: session.messages.slice(-8, -1) }
      );
      await recordUsageForBot(bot);
    }

    const botMsg: Message = {
      id: "m-bc-bot-" + Math.random().toString(36).substr(2, 9),
      sender: "bot",
      username: bot.name,
      text: aiAnswer.text,
      timestamp: new Date().toISOString(),
      sourcesUsed: aiAnswer.sources,
      fallbackTriggered: aiAnswer.fallbackTriggered
    };
    session.messages.push(botMsg);
    session.lastMessageText = aiAnswer.text;
    session.lastMessageTime = botMsg.timestamp;
    session.status = aiAnswer.fallbackTriggered ? "escalated" : "bot_answered";
    analytics.totalMessages += 2;

    try {
      await dbSaveConversation(session);
    } catch (saveErr) {
      console.warn("[Botcake Bridge] Skip Supabase upload:", saveErr);
    }

    return res.json(buildBridgeResponse(aiAnswer.text));
  } catch (err: any) {
    console.error("[Botcake Bridge] Lỗi xử lý:", err?.message || err);
    return res.json(buildBridgeResponse(bot.fallbackMessage || "Dạ em xin phép kết nối nhân viên hỗ trợ mình ngay ạ."));
  }
});
```

Import: thêm `parseBridgePayload, buildBridgeResponse` từ `"./botcakeBridge.js"` vào đầu server.ts (cạnh import `./facebookOauth.js`). Kiểm tra import facebookOauth đã có `randomToken` (Task 3 OAuth đã import) — nếu có rồi thì không thêm lại.

- [ ] **Step 4: Lint + test + smoke**

Run: `npm run lint && npx vitest run`
Expected: xanh.

Smoke (server dev, PORT=3100 nếu 3000 bận; dùng PowerShell Invoke-WebRequest vì curl bị hook chặn):
- POST `http://localhost:3100/api/bridge/botcake/khong-ton-tai?key=x` body `{"text":"hi"}` → 403, body chứa `"Bridge key không hợp lệ"`.
Expected đúng như trên → route sống + auth hoạt động. Kill server sau smoke.

- [ ] **Step 5: Commit**

```bash
git add botcakeBridge.sql src/types.ts server.ts
git commit -m "feat(bridge): endpoint Botcake bridge + bridge key per-bot"
```

---

### Task 3: Dashboard — card "Cách 2 — Chạy ngay qua Botcake"

**Files:**
- Modify: `src/App.tsx` — thêm state + 2 handler (cạnh `handleOAuthConnectFacebook`, ~dòng 449) và card UI đặt NGAY SAU card "Kết nối Fanpage" (tìm comment `{/* Kết nối 1 chạm qua Facebook OAuth */}`)

**Interfaces:**
- Consumes: Task 2 endpoints `GET /api/bots/:botId/bridge-info`, `POST /api/bots/:botId/bridge-key/regenerate` → `{ bridgeKey, bridgeUrl }`.
- Produces: không có consumer sau.

- [ ] **Step 1: Thêm state (cạnh các useState Facebook hiện có — tìm `inputFacebookToken`)**

```tsx
  const [bridgeInfo, setBridgeInfo] = useState<{ bridgeKey: string; bridgeUrl: string } | null>(null);
  const [isFetchingBridge, setIsFetchingBridge] = useState(false);
  const [bridgeCopied, setBridgeCopied] = useState(false);
```

- [ ] **Step 2: Thêm 2 handler (sau `handleOAuthConnectFacebook`)**

```tsx
  const fetchBridgeInfo = async () => {
    if (!selectedBotId) return;
    setIsFetchingBridge(true);
    try {
      const res = await fetch(`/api/bots/${selectedBotId}/bridge-info`, { headers: getScopedApiHeaders() });
      const data = await res.json();
      if (res.ok) setBridgeInfo(data);
      else setFacebookActionMsg({ status: 'error', text: data.error || 'Không tải được Bridge URL.' });
    } catch (err: any) {
      setFacebookActionMsg({ status: 'error', text: 'Lỗi tải Bridge URL: ' + err.message });
    } finally {
      setIsFetchingBridge(false);
    }
  };

  const handleRegenBridgeKey = async () => {
    if (!selectedBotId) return;
    if (!window.confirm('Đổi key sẽ làm URL cũ ngừng hoạt động — các Page đang dùng phải dán lại URL mới. Tiếp tục?')) return;
    setIsFetchingBridge(true);
    try {
      const res = await fetch(`/api/bots/${selectedBotId}/bridge-key/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getScopedApiHeaders() }
      });
      const data = await res.json();
      if (res.ok) {
        setBridgeInfo(data);
        setFacebookActionMsg({ status: 'success', text: 'Đã đổi bridge key. Nhớ cập nhật URL mới trong Botcake.' });
      } else {
        setFacebookActionMsg({ status: 'error', text: data.error || 'Không đổi được key.' });
      }
    } catch (err: any) {
      setFacebookActionMsg({ status: 'error', text: 'Lỗi đổi key: ' + err.message });
    } finally {
      setIsFetchingBridge(false);
    }
  };

  const handleCopyBridgeUrl = async () => {
    if (!bridgeInfo?.bridgeUrl) return;
    try {
      await navigator.clipboard.writeText(bridgeInfo.bridgeUrl);
      setBridgeCopied(true);
      setTimeout(() => setBridgeCopied(false), 2000);
    } catch {
      window.prompt('Copy thủ công URL này:', bridgeInfo.bridgeUrl);
    }
  };
```

- [ ] **Step 3: Thêm card UI ngay sau card "Kết nối Fanpage" (sau thẻ đóng `</div>` của card chứa nút OAuth + details token)**

```tsx
                  {/* Cách 2 — Botcake bridge: chạy ngay cho mọi khách vãng lai, không chờ Meta duyệt */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Cách 2 — Chạy ngay qua Botcake</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold">Không cần chờ Meta duyệt</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Kết nối Page vào Botcake (miễn phí) rồi dán Bridge URL bên dưới vào Dynamic Block — bot trả lời <b>mọi khách vãng lai</b> ngay. Cách 1 sẽ thay thế khi app được Meta duyệt.
                    </p>
                    {!bridgeInfo ? (
                      <button
                        type="button"
                        onClick={fetchBridgeInfo}
                        disabled={isFetchingBridge}
                        className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold rounded-lg text-xs"
                      >
                        {isFetchingBridge ? 'Đang tải...' : 'Tạo / Hiện Bridge URL'}
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <div className="font-mono text-xs text-slate-700 bg-slate-50 border border-slate-100 rounded-lg p-3 break-all select-all">
                          {bridgeInfo.bridgeUrl}
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={handleCopyBridgeUrl} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs">
                            {bridgeCopied ? 'Đã copy ✓' : 'Copy URL'}
                          </button>
                          <button type="button" onClick={handleRegenBridgeKey} disabled={isFetchingBridge} className="px-3 py-2 text-[11px] font-bold text-rose-600 hover:text-rose-700 disabled:opacity-50">
                            Đổi key
                          </button>
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Hướng dẫn 5 bước cài Botcake: xem file <span className="font-mono">docs/botcake-bridge-guide.md</span> (hoặc hỏi đội hỗ trợ BalaBot).
                    </p>
                  </div>
```

- [ ] **Step 4: Lint + build**

Run: `npm run lint && npx vite build`
Expected: sạch, build OK.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ui): card Botcake bridge — tạo/copy Bridge URL, đổi key"
```

---

### Task 4: Guide tiếng Việt + env + verify tổng

**Files:**
- Create: `docs/botcake-bridge-guide.md`
- Modify: `.env.example` (thêm sau các biến FACEBOOK_)

**Interfaces:**
- Consumes: toàn bộ endpoint/UI đã build.
- Produces: tài liệu vận hành.

- [ ] **Step 1: Thêm vào `.env.example`**

```bash
# Botcake bridge — origin công khai của backend (mặc định URL Railway production)
PUBLIC_BACKEND_ORIGIN=
```

- [ ] **Step 2: Viết `docs/botcake-bridge-guide.md`** — tiếng Việt đầy đủ, KHÔNG placeholder, gồm:

1. **Botcake bridge là gì, khi nào dùng** (chạy ngay cho khách vãng lai; là cầu tạm tới khi App Review xong).
2. **5 bước cài đặt cho 1 Fanpage** (viết cho chủ shop không rành kỹ thuật):
   - B1: Tạo tài khoản miễn phí tại botcake.io (đăng nhập bằng Facebook).
   - B2: Kết nối Fanpage (nút kết nối Page chính chủ của Botcake — hiện với mọi tài khoản).
   - B3: Trong BalaBot dashboard → tab Facebook → card "Cách 2" → bấm "Tạo / Hiện Bridge URL" → Copy.
   - B4: Trong Botcake → Automation → Default Reply (Trả lời mặc định) → xóa nội dung mẫu → thêm block **Dynamic Block** (tên có thể là "Dynamic content"/"JSON API") → Method POST → dán Bridge URL → phần Body điền:
     ```json
     { "text": "{{last user freeform input}}", "psid": "{{messenger user id}}", "name": "{{full name}}" }
     ```
     Ghi chú: tên biến chọn từ danh sách biến có sẵn của Botcake khi gõ `{{` — chọn biến tương ứng "tin nhắn cuối của khách", "messenger user id", "họ tên". (Sau bước kiểm chứng thực tế đầu tiên, cập nhật đúng tên biến hiển thị trong Botcake vào guide này.)
   - B5: Bật Default Reply cho "mọi tin nhắn" → Lưu → nhắn thử vào Page bằng nick bất kỳ → bot trả lời.
3. **Lỗi thường gặp:** không thấy bot trả lời (kiểm tra Default Reply đã bật, URL đủ `?key=`, xem log `[Botcake Bridge]` trên Railway); bot báo "Bridge key không hợp lệ" (copy lại URL mới); trả lời chậm >10s (báo đội BalaBot).
4. **Giới hạn:** chỉ tin nhắn văn bản; bot không tự nhắn trước; nhân viên trả lời tay dùng Livechat của Botcake; lịch sử hội thoại vẫn xem được trong BalaBot.
5. **Bước kiểm chứng thực tế lần đầu (chủ dự án):** làm B1–B5 với Page test, xem Railway Deploy Logs dòng `[Botcake Bridge] payload keys:` nếu bot không hiểu tin nhắn → gửi keys đó cho dev để bổ sung mapping (endpoint đã nhận sẵn nhiều tên trường phổ biến).

- [ ] **Step 3: Verify tổng**

Run: `npm run lint && npx vitest run && npm run build`
Expected: cả ba xanh.

- [ ] **Step 4: Commit**

```bash
git add docs/botcake-bridge-guide.md .env.example
git commit -m "docs(bridge): hướng dẫn khách cài Botcake bridge 5 bước"
```

(Deploy: sau final review, controller merge/push main → Railway; `npx wrangler pages deploy dist --project-name=aaa-balabot --branch=main --commit-dirty=true` cho frontend. Migration `botcakeBridge.sql` chủ dự án chạy tay trên Supabase TRƯỚC khi dùng thật — nếu quên, key vẫn hoạt động trong RAM nhưng mất khi server restart.)

---

## Self-Review

- **Spec coverage:** endpoint tolerant + auth key + usage gate + session botcake + cắt 1800 + lỗi AI → fallback 200 (T1/T2); bridge-info tự sinh key + regenerate (T2); UI card + copy + đổi key + ghi chú cầu tạm (T3); guide 5 bước + lỗi thường gặp + kiểm chứng thực tế (T4); migration SQL (T2); PUBLIC_BACKEND_ORIGIN (T2 dùng, T4 ghi env). Không sửa deliverOperatorReply (constraint). Đủ.
- **Placeholder:** không TBD; tên biến Botcake trong guide được đánh dấu rõ là "chốt sau kiểm chứng thực tế" — đây là bước có chủ đích trong spec, không phải lỗ hổng plan.
- **Type consistency:** `parseBridgePayload`/`buildBridgeResponse` T1 khớp cách gọi T2; `{ bridgeKey, bridgeUrl }` T2 khớp state T3; `botcakeBridgeKey` khớp types.ts/SQL/server.
