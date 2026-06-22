# Zalo Group Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép chatbot hiện có trả lời khách hàng trong nhóm chat Zalo 24/7, chỉ khi bị @mention hoặc bị reply, dùng tài khoản Zalo cá nhân tự động hoá qua `zca-js`.

**Architecture:** Một module cô lập `zaloGroupBot.ts` chạy chung process Express trên Render. Module nhận một object `deps` (dependency injection) chứa `generateRAGAnswer`, `postProcessBotReply`, `chatSessions`, `dbSaveConversation`, `dbGetBots`, `analytics`, và Supabase client — nhờ vậy phần logic thuần (trigger, rate-limit, session) test được mà không cần Zalo thật. Vòng đời `zca-js` (login QR, listener, reconnect) được bọc "tường lửa lỗi" để không bao giờ làm sập API. Mọi thứ tắt mặc định sau cờ `ZALO_GROUP_BOT_ENABLED`.

**Tech Stack:** Node 18+, TypeScript (ESM), Express 4, `zca-js` (unofficial Zalo), Supabase JS, Vitest (mới, cho unit test logic thuần), React 19 (admin UI).

## Global Constraints

- Ngôn ngữ trả lời người dùng: tiếng Việt; văn phong giữ nguyên qua `postProcessBotReply`.
- Cờ bật/tắt: `ZALO_GROUP_BOT_ENABLED` — **mặc định tắt**. Khi tắt, hành vi hệ thống không đổi so với hiện tại.
- Listener `zca-js` **không bao giờ** throw ra process chính; mọi lỗi log + xử lý nội bộ.
- Bot **chỉ** trả lời khi bị @mention hoặc khi tin là reply vào tin bot đã gửi. Không có ngoại lệ.
- Chỉ xử lý **text**. Bỏ qua ảnh/sticker/file/voice.
- Một tài khoản Zalo bot duy nhất (schema để ngỏ nhiều account sau).
- Types dùng chung từ `./src/types.js`: `BotConfig`, `Message`, `ChatSession`. KHÔNG định nghĩa lại.
- Conversation key cho nhóm: chuỗi `zalo:<groupId>` lưu vào trường `ChatSession.telegramUserId` (trường này đã được dùng làm khoá user đa kênh, ví dụ `facebook:<id>`).
- Phụ thuộc giữ tối thiểu; không thêm thư viện ngoài `zca-js` (runtime) và `vitest` (devDependency).

### Chữ ký hàm có sẵn (consume từ codebase, KHÔNG sửa)

```ts
// server.ts
async function generateRAGAnswer(
  bot: BotConfig,
  query: string,
  userInfo?: { fullName?: string; username?: string; id?: string },
  replyOptions?: { shouldGreet?: boolean; recentMessages?: Message[] }
): Promise<{ text: string; sources: any[]; fallbackTriggered: boolean }>;

function postProcessBotReply(text: string, options?: { shouldGreet?: boolean; recentMessages?: Message[] }): string;
function getRequestUserEmail(req: express.Request): string;
function requireOwnerAdmin(req: express.Request, res: express.Response): boolean; // trả false + đã gửi 403 nếu không phải owner
let chatSessions: ChatSession[];
let bots: BotConfig[];
const analytics: AnalyticsSummary; // có .totalMessages, .totalUsers

// supabaseService.ts (đã export)
function getSupabaseClient(): SupabaseClient | null;     // null nếu chưa cấu hình
async function dbGetBots(localFallback: BotConfig[]): Promise<BotConfig[]>;
async function dbSaveConversation(convo: ChatSession): Promise<boolean>;
```

### Hình dạng type tham chiếu (từ src/types.ts)

```ts
interface ChatSession {
  id: string;
  botId: string;
  telegramUserId: string;     // dùng làm khoá đa kênh: "zalo:<groupId>"
  telegramUsername: string;
  telegramFullName: string;
  lastMessageText: string;
  lastMessageTime: string;
  status: string;             // "bot_answered" | "escalated" | ...
  internalNotes?: string;
  messages: Message[];
}
interface Message {
  id: string;
  sender: "user" | "bot";
  username?: string;
  fullName?: string;
  text: string;
  timestamp: string;
  sourcesUsed?: any[];
  fallbackTriggered?: boolean;
}
```

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `zaloGroupBot/types.ts` (Create) | Type nội bộ module: `ZaloDeps`, `ZaloIncomingEvent`, `GroupBinding`, `ZaloSessionRecord`, `ZaloRuntimeStatus`. |
| `zaloGroupBot/triggers.ts` (Create) | Logic thuần: `isBotMentioned`, `isReplyToBot`, `stripMention`, `MessageDedupe`. Test được, không phụ thuộc Zalo. |
| `zaloGroupBot/rateLimiter.ts` (Create) | Logic thuần: `RateLimiter` per-group. Test được. |
| `zaloGroupBot/store.ts` (Create) | Đọc/ghi `zalo_sessions` + `zalo_group_bindings` qua Supabase, fallback in-memory. |
| `zaloGroupBot/handler.ts` (Create) | `handleZaloGroupMessage(deps, event)`: nối trigger → RAG → session → save. Test bằng deps giả. |
| `zaloGroupBot/client.ts` (Create) | Vòng đời `zca-js`: login QR, listener, reconnect, tường lửa lỗi. `initZaloGroupBot`, `startQrLogin`, `getRuntimeStatus`, `logout`. |
| `zaloGroupBot/index.ts` (Create) | Re-export public API của module. |
| `zaloGroupBot.sql` (Create) | SQL migration tạo 2 bảng Supabase. |
| `server.ts` (Modify) | Thêm `/health`; mount API admin Zalo; gọi `initZaloGroupBot` trong boot sau `app.listen`. |
| `src/App.tsx` (Modify) | Panel admin "Zalo Group": QR login, trạng thái, danh sách group, gán bot, bật/tắt. |
| `package.json` (Modify) | Thêm `zca-js` (deps) + `vitest` (devDeps) + script `test`. |
| `vitest.config.ts` (Create) | Cấu hình vitest tối thiểu. |
| `zaloGroupBot/__tests__/*.test.ts` (Create) | Unit test cho triggers, rateLimiter, handler. |

> **Lưu ý zca-js:** API thật của `zca-js` có thể khác chút theo phiên bản. Tất cả tương tác `zca-js` được cô lập trong `client.ts`. Nếu tên hàm/sự kiện lệch với phiên bản cài, chỉ sửa trong `client.ts` và phép chuẩn hoá event ở đó về kiểu `ZaloIncomingEvent` mà `handler.ts` mong đợi — các task khác không phụ thuộc API zca-js.

---

## Task 1: Dependencies, test runner, env flag, SQL migration

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `zaloGroupBot.sql`
- Modify: `.env.example`

**Interfaces:**
- Produces: script `npm test` chạy vitest; biến env `ZALO_GROUP_BOT_ENABLED`, `ZALO_RATE_LIMIT_PER_MIN`, `ZALO_ACCOUNT_LABEL`; 2 bảng Supabase `zalo_sessions`, `zalo_group_bindings`.

- [ ] **Step 1: Thêm phụ thuộc và script test vào `package.json`**

Trong `"dependencies"` thêm:
```json
"zca-js": "^2.0.0"
```
Trong `"devDependencies"` thêm:
```json
"vitest": "^2.1.0"
```
Trong `"scripts"` thêm:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Cài đặt**

Run: `npm install`
Expected: cài xong không lỗi; `node_modules/zca-js` và `node_modules/vitest` tồn tại.

- [ ] **Step 3: Tạo `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["zaloGroupBot/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 4: Tạo `zaloGroupBot.sql` (chạy thủ công trên Supabase SQL editor)**

```sql
-- Bảng phiên đăng nhập Zalo (1 dòng cho mỗi tài khoản bot)
create table if not exists zalo_sessions (
  id text primary key,
  account_label text not null default 'default',
  credentials jsonb,
  status text not null default 'needs_login',  -- active | needs_login | error
  last_error text,
  updated_at timestamptz not null default now()
);

-- Ánh xạ group -> bot
create table if not exists zalo_group_bindings (
  group_id text primary key,
  group_name text,
  bot_id text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- [ ] **Step 5: Bổ sung `.env.example`**

Thêm các dòng:
```
# Zalo Group Bot (Huong B - khong chinh thuc, dung nick phu)
ZALO_GROUP_BOT_ENABLED=false
ZALO_ACCOUNT_LABEL=default
ZALO_RATE_LIMIT_PER_MIN=5
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts zaloGroupBot.sql .env.example
git commit -m "chore: add zca-js, vitest, zalo env flags and SQL migration"
```

---

## Task 2: Module types

**Files:**
- Create: `zaloGroupBot/types.ts`

**Interfaces:**
- Produces: `ZaloDeps`, `ZaloIncomingEvent`, `GroupBinding`, `ZaloSessionRecord`, `ZaloRuntimeStatus`, `ZaloSendFn`.

- [ ] **Step 1: Tạo `zaloGroupBot/types.ts`**

```ts
import type { BotConfig, Message, ChatSession } from "../src/types.js";

// Event nhóm đã CHUẨN HOÁ (client.ts dịch event zca-js thô sang kiểu này).
export interface ZaloIncomingEvent {
  groupId: string;          // threadId của nhóm
  messageId: string;        // id tin nhắn (để dedupe)
  senderId: string;         // uid người gửi
  senderName: string;       // tên hiển thị người gửi
  text: string;             // nội dung text (rỗng nếu không phải text)
  mentionedUids: string[];  // danh sách uid được @mention trong tin
  quotedMessageId?: string; // nếu tin này là reply, id tin được trích
}

export type ZaloSendFn = (groupId: string, text: string) => Promise<string | null>;
// trả về messageId của tin bot vừa gửi (để theo dõi reply-to-bot), hoặc null nếu lỗi.

export interface ZaloDeps {
  botUid: () => string | null;                 // uid của chính tài khoản bot (để nhận biết @mention)
  send: ZaloSendFn;
  generateRAGAnswer: (
    bot: BotConfig, query: string,
    userInfo?: { fullName?: string; username?: string; id?: string },
    replyOptions?: { shouldGreet?: boolean; recentMessages?: Message[] }
  ) => Promise<{ text: string; sources: any[]; fallbackTriggered: boolean }>;
  postProcessBotReply: (text: string, options?: { shouldGreet?: boolean; recentMessages?: Message[] }) => string;
  getBots: () => Promise<BotConfig[]>;
  getBinding: (groupId: string) => Promise<GroupBinding | null>;
  chatSessions: ChatSession[];
  saveConversation: (convo: ChatSession) => Promise<boolean>;
  analytics: { totalMessages: number; totalUsers: number };
  rememberSentMessage: (messageId: string) => void;  // ghi nhớ msgId bot gửi (reply-to-bot)
  isBotMessageId: (messageId: string) => boolean;
  ratePerMin: number;
}

export interface GroupBinding {
  group_id: string;
  group_name?: string;
  bot_id: string;
  enabled: boolean;
}

export interface ZaloSessionRecord {
  id: string;
  account_label: string;
  credentials: any | null;
  status: "active" | "needs_login" | "error";
  last_error?: string | null;
  updated_at?: string;
}

export interface ZaloRuntimeStatus {
  enabled: boolean;
  loginState: "active" | "needs_login" | "error" | "logging_in";
  accountLabel: string;
  accountName: string | null;
  listenerConnected: boolean;
  lastError: string | null;
}
```

- [ ] **Step 2: Kiểm tra biên dịch type**

Run: `npx tsc --noEmit`
Expected: PASS (không lỗi mới từ file này).

- [ ] **Step 3: Commit**

```bash
git add zaloGroupBot/types.ts
git commit -m "feat: add zalo group bot module types"
```

---

## Task 3: Trigger detection (logic thuần, TDD)

**Files:**
- Create: `zaloGroupBot/triggers.ts`
- Test: `zaloGroupBot/__tests__/triggers.test.ts`

**Interfaces:**
- Consumes: `ZaloIncomingEvent` (Task 2).
- Produces:
  - `isBotMentioned(event: ZaloIncomingEvent, botUid: string): boolean`
  - `isReplyToBot(event: ZaloIncomingEvent, isBotMessageId: (id: string) => boolean): boolean`
  - `stripMention(text: string, botName: string): string`
  - `class MessageDedupe { seen(id: string): boolean }` — `seen` trả true nếu đã thấy (giới hạn 1000).

- [ ] **Step 1: Viết test thất bại `zaloGroupBot/__tests__/triggers.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { isBotMentioned, isReplyToBot, stripMention, MessageDedupe } from "../triggers.js";
import type { ZaloIncomingEvent } from "../types.js";

function ev(p: Partial<ZaloIncomingEvent>): ZaloIncomingEvent {
  return { groupId: "g1", messageId: "m1", senderId: "u1", senderName: "Khach",
    text: "", mentionedUids: [], ...p };
}

describe("isBotMentioned", () => {
  it("true khi botUid nam trong mentionedUids", () => {
    expect(isBotMentioned(ev({ mentionedUids: ["bot99", "u2"] }), "bot99")).toBe(true);
  });
  it("false khi khong duoc nhac", () => {
    expect(isBotMentioned(ev({ mentionedUids: ["u2"] }), "bot99")).toBe(false);
  });
});

describe("isReplyToBot", () => {
  it("true khi quotedMessageId la tin cua bot", () => {
    expect(isReplyToBot(ev({ quotedMessageId: "b1" }), (id) => id === "b1")).toBe(true);
  });
  it("false khi khong reply", () => {
    expect(isReplyToBot(ev({}), () => true)).toBe(false);
  });
  it("false khi reply vao tin nguoi khac", () => {
    expect(isReplyToBot(ev({ quotedMessageId: "x9" }), (id) => id === "b1")).toBe(false);
  });
});

describe("stripMention", () => {
  it("xoa @ten-bot o dau cau", () => {
    expect(stripMention("@BalaBot gia bao nhieu?", "BalaBot")).toBe("gia bao nhieu?");
  });
  it("giu nguyen neu khong co mention", () => {
    expect(stripMention("gia bao nhieu?", "BalaBot")).toBe("gia bao nhieu?");
  });
});

describe("MessageDedupe", () => {
  it("lan dau false, lan sau true", () => {
    const d = new MessageDedupe();
    expect(d.seen("a")).toBe(false);
    expect(d.seen("a")).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npm test`
Expected: FAIL — không import được `../triggers.js`.

- [ ] **Step 3: Viết `zaloGroupBot/triggers.ts`**

```ts
import type { ZaloIncomingEvent } from "./types.js";

export function isBotMentioned(event: ZaloIncomingEvent, botUid: string): boolean {
  if (!botUid) return false;
  return event.mentionedUids.includes(botUid);
}

export function isReplyToBot(
  event: ZaloIncomingEvent,
  isBotMessageId: (id: string) => boolean
): boolean {
  if (!event.quotedMessageId) return false;
  return isBotMessageId(event.quotedMessageId);
}

export function stripMention(text: string, botName: string): string {
  if (!text) return "";
  let out = text;
  if (botName) {
    const escaped = botName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`@${escaped}\\b`, "gi"), " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

export class MessageDedupe {
  private set = new Set<string>();
  seen(id: string): boolean {
    if (this.set.has(id)) return true;
    this.set.add(id);
    if (this.set.size > 1000) {
      const oldest = this.set.values().next().value;
      if (oldest) this.set.delete(oldest);
    }
    return false;
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npm test`
Expected: PASS — tất cả test triggers xanh.

- [ ] **Step 5: Commit**

```bash
git add zaloGroupBot/triggers.ts zaloGroupBot/__tests__/triggers.test.ts
git commit -m "feat: add zalo trigger detection with tests"
```

---

## Task 4: Rate limiter (logic thuần, TDD)

**Files:**
- Create: `zaloGroupBot/rateLimiter.ts`
- Test: `zaloGroupBot/__tests__/rateLimiter.test.ts`

**Interfaces:**
- Produces: `class RateLimiter { constructor(maxPerMinute: number); allow(groupId: string, now?: number): boolean }`.

- [ ] **Step 1: Viết test thất bại `zaloGroupBot/__tests__/rateLimiter.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { RateLimiter } from "../rateLimiter.js";

describe("RateLimiter", () => {
  it("cho phep toi da N tin trong 60s roi chan", () => {
    const rl = new RateLimiter(2);
    const t = 1_000_000;
    expect(rl.allow("g1", t)).toBe(true);
    expect(rl.allow("g1", t + 1)).toBe(true);
    expect(rl.allow("g1", t + 2)).toBe(false); // qua gioi han
  });
  it("reset sau 60s", () => {
    const rl = new RateLimiter(1);
    const t = 1_000_000;
    expect(rl.allow("g1", t)).toBe(true);
    expect(rl.allow("g1", t + 500)).toBe(false);
    expect(rl.allow("g1", t + 60_001)).toBe(true);
  });
  it("dem doc lap theo tung group", () => {
    const rl = new RateLimiter(1);
    const t = 1_000_000;
    expect(rl.allow("g1", t)).toBe(true);
    expect(rl.allow("g2", t)).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npm test`
Expected: FAIL — không import được `../rateLimiter.js`.

- [ ] **Step 3: Viết `zaloGroupBot/rateLimiter.ts`**

```ts
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private maxPerMinute: number) {}

  allow(groupId: string, now: number = Date.now()): boolean {
    const windowStart = now - 60_000;
    const arr = (this.hits.get(groupId) || []).filter((t) => t > windowStart);
    if (arr.length >= this.maxPerMinute) {
      this.hits.set(groupId, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(groupId, arr);
    return true;
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add zaloGroupBot/rateLimiter.ts zaloGroupBot/__tests__/rateLimiter.test.ts
git commit -m "feat: add per-group rate limiter with tests"
```

---

## Task 5: Supabase store (sessions + bindings)

**Files:**
- Create: `zaloGroupBot/store.ts`

**Interfaces:**
- Consumes: `getSupabaseClient` (supabaseService), types Task 2.
- Produces:
  - `loadSession(accountLabel: string): Promise<ZaloSessionRecord | null>`
  - `saveSession(rec: ZaloSessionRecord): Promise<void>`
  - `getBinding(groupId: string): Promise<GroupBinding | null>`
  - `listBindings(): Promise<GroupBinding[]>`
  - `upsertBinding(b: GroupBinding): Promise<void>`

- [ ] **Step 1: Viết `zaloGroupBot/store.ts`**

```ts
import { getSupabaseClient } from "../supabaseService.js";
import type { ZaloSessionRecord, GroupBinding } from "./types.js";

// Fallback in-memory khi Supabase chua cau hinh (degrade muot, giong code hien tai).
const memSessions = new Map<string, ZaloSessionRecord>();
const memBindings = new Map<string, GroupBinding>();

export async function loadSession(accountLabel: string): Promise<ZaloSessionRecord | null> {
  const sb = getSupabaseClient();
  if (!sb) return memSessions.get(accountLabel) || null;
  const { data, error } = await sb.from("zalo_sessions").select("*").eq("account_label", accountLabel).maybeSingle();
  if (error) { console.warn("[Zalo Store] loadSession error:", error.message); return null; }
  return (data as ZaloSessionRecord) || null;
}

export async function saveSession(rec: ZaloSessionRecord): Promise<void> {
  rec.updated_at = new Date().toISOString();
  const sb = getSupabaseClient();
  if (!sb) { memSessions.set(rec.account_label, rec); return; }
  const { error } = await sb.from("zalo_sessions").upsert(rec, { onConflict: "id" });
  if (error) console.warn("[Zalo Store] saveSession error:", error.message);
}

export async function getBinding(groupId: string): Promise<GroupBinding | null> {
  const sb = getSupabaseClient();
  if (!sb) return memBindings.get(groupId) || null;
  const { data, error } = await sb.from("zalo_group_bindings").select("*").eq("group_id", groupId).maybeSingle();
  if (error) { console.warn("[Zalo Store] getBinding error:", error.message); return null; }
  return (data as GroupBinding) || null;
}

export async function listBindings(): Promise<GroupBinding[]> {
  const sb = getSupabaseClient();
  if (!sb) return Array.from(memBindings.values());
  const { data, error } = await sb.from("zalo_group_bindings").select("*").order("updated_at", { ascending: false });
  if (error) { console.warn("[Zalo Store] listBindings error:", error.message); return []; }
  return (data as GroupBinding[]) || [];
}

export async function upsertBinding(b: GroupBinding): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) { memBindings.set(b.group_id, b); return; }
  const { error } = await sb.from("zalo_group_bindings")
    .upsert({ ...b, updated_at: new Date().toISOString() }, { onConflict: "group_id" });
  if (error) console.warn("[Zalo Store] upsertBinding error:", error.message);
}
```

- [ ] **Step 2: Kiểm tra biên dịch**

Run: `npx tsc --noEmit`
Expected: PASS (không lỗi mới).

- [ ] **Step 3: Commit**

```bash
git add zaloGroupBot/store.ts
git commit -m "feat: add zalo supabase store for sessions and bindings"
```

---

## Task 6: Message handler (nối trigger → RAG → session, TDD với deps giả)

**Files:**
- Create: `zaloGroupBot/handler.ts`
- Test: `zaloGroupBot/__tests__/handler.test.ts`

**Interfaces:**
- Consumes: `ZaloDeps`, `ZaloIncomingEvent` (Task 2); `isBotMentioned`, `isReplyToBot`, `stripMention`, `MessageDedupe` (Task 3); `RateLimiter` (Task 4).
- Produces:
  - `createZaloMessageHandler(deps: ZaloDeps): (event: ZaloIncomingEvent) => Promise<{ replied: boolean; reason?: string }>`

Hành vi: trả `{ replied:false, reason }` khi bỏ qua; `{ replied:true }` khi đã trả lời. KHÔNG bao giờ throw.

- [ ] **Step 1: Viết test thất bại `zaloGroupBot/__tests__/handler.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { createZaloMessageHandler } from "../handler.js";
import type { ZaloDeps, ZaloIncomingEvent, GroupBinding } from "../types.js";
import type { ChatSession } from "../../src/types.js";

function baseDeps(over: Partial<ZaloDeps> = {}): { deps: ZaloDeps; sent: string[]; sessions: ChatSession[] } {
  const sent: string[] = [];
  const sessions: ChatSession[] = [];
  const binding: GroupBinding = { group_id: "g1", bot_id: "bot-1", enabled: true };
  const deps: ZaloDeps = {
    botUid: () => "BOT_UID",
    send: async (_g, t) => { sent.push(t); return "sent-id"; },
    generateRAGAnswer: async () => ({ text: "Da, gia 100k a.", sources: [], fallbackTriggered: false }),
    postProcessBotReply: (t) => t,
    getBots: async () => [{ id: "bot-1", name: "BalaBot" } as any],
    getBinding: async () => binding,
    chatSessions: sessions,
    saveConversation: async () => true,
    analytics: { totalMessages: 0, totalUsers: 0 },
    rememberSentMessage: () => {},
    isBotMessageId: () => false,
    ratePerMin: 5,
    ...over,
  };
  return { deps, sent, sessions };
}

function ev(p: Partial<ZaloIncomingEvent>): ZaloIncomingEvent {
  return { groupId: "g1", messageId: "m" + Math.random(), senderId: "u1", senderName: "Khach Hang",
    text: "@BalaBot gia bao nhieu?", mentionedUids: ["BOT_UID"], ...p };
}

describe("createZaloMessageHandler", () => {
  it("tra loi khi duoc @mention va gui qua send", async () => {
    const { deps, sent } = baseDeps();
    const h = createZaloMessageHandler(deps);
    const r = await h(ev({}));
    expect(r.replied).toBe(true);
    expect(sent).toEqual(["Da, gia 100k a."]);
  });

  it("im lang khi khong mention va khong reply", async () => {
    const { deps, sent } = baseDeps();
    const h = createZaloMessageHandler(deps);
    const r = await h(ev({ text: "alo", mentionedUids: [] }));
    expect(r.replied).toBe(false);
    expect(sent).toEqual([]);
  });

  it("im lang khi group chua bind", async () => {
    const { deps, sent } = baseDeps({ getBinding: async () => null });
    const h = createZaloMessageHandler(deps);
    const r = await h(ev({}));
    expect(r.replied).toBe(false);
    expect(sent).toEqual([]);
  });

  it("im lang khi binding disabled", async () => {
    const { deps, sent } = baseDeps({ getBinding: async () => ({ group_id: "g1", bot_id: "bot-1", enabled: false }) });
    const h = createZaloMessageHandler(deps);
    expect((await h(ev({}))).replied).toBe(false);
    expect(sent).toEqual([]);
  });

  it("dedupe: cung messageId khong tra loi 2 lan", async () => {
    const { deps, sent } = baseDeps();
    const h = createZaloMessageHandler(deps);
    const e = ev({ messageId: "dup1" });
    await h(e);
    await h(e);
    expect(sent.length).toBe(1);
  });

  it("tra loi khi reply vao tin bot", async () => {
    const { deps, sent } = baseDeps({ isBotMessageId: (id) => id === "botmsg" });
    const h = createZaloMessageHandler(deps);
    const r = await h(ev({ text: "the con ship?", mentionedUids: [], quotedMessageId: "botmsg" }));
    expect(r.replied).toBe(true);
    expect(sent.length).toBe(1);
  });

  it("luu session vao chatSessions voi key zalo:<groupId>", async () => {
    const { deps, sessions } = baseDeps();
    const h = createZaloMessageHandler(deps);
    await h(ev({}));
    expect(sessions.length).toBe(1);
    expect(sessions[0].telegramUserId).toBe("zalo:g1");
    expect(sessions[0].messages.some((m) => m.sender === "user")).toBe(true);
    expect(sessions[0].messages.some((m) => m.sender === "bot")).toBe(true);
  });

  it("khong throw khi generateRAGAnswer loi", async () => {
    const { deps, sent } = baseDeps({ generateRAGAnswer: async () => { throw new Error("boom"); } });
    const h = createZaloMessageHandler(deps);
    const r = await h(ev({}));
    expect(r.replied).toBe(false);
    expect(sent).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npm test`
Expected: FAIL — không import được `../handler.js`.

- [ ] **Step 3: Viết `zaloGroupBot/handler.ts`**

```ts
import type { ZaloDeps, ZaloIncomingEvent } from "./types.js";
import type { ChatSession, Message } from "../src/types.js";
import { isBotMentioned, isReplyToBot, stripMention, MessageDedupe } from "./triggers.js";
import { RateLimiter } from "./rateLimiter.js";

function rid(prefix: string): string {
  return prefix + Math.random().toString(36).substr(2, 9);
}

export function createZaloMessageHandler(
  deps: ZaloDeps
): (event: ZaloIncomingEvent) => Promise<{ replied: boolean; reason?: string }> {
  const dedupe = new MessageDedupe();
  const limiter = new RateLimiter(deps.ratePerMin);

  return async function handle(event) {
    try {
      if (!event.text || !event.text.trim()) return { replied: false, reason: "non_text" };
      if (dedupe.seen(event.messageId)) return { replied: false, reason: "duplicate" };

      const binding = await deps.getBinding(event.groupId);
      if (!binding || !binding.enabled) return { replied: false, reason: "no_binding" };

      const botUid = deps.botUid() || "";
      const mentioned = isBotMentioned(event, botUid);
      const repliedToBot = isReplyToBot(event, deps.isBotMessageId);
      if (!mentioned && !repliedToBot) return { replied: false, reason: "not_addressed" };

      const bots = await deps.getBots();
      const bot = bots.find((b) => b.id === binding.bot_id);
      if (!bot) return { replied: false, reason: "bot_not_found" };

      if (!limiter.allow(event.groupId)) return { replied: false, reason: "rate_limited" };

      const question = stripMention(event.text, (bot as any).name || "");
      if (!question) return { replied: false, reason: "empty_after_strip" };

      const userKey = `zalo:${event.groupId}`;
      let session = deps.chatSessions.find((s) => s.botId === bot.id && s.telegramUserId === userKey);
      if (!session) {
        session = {
          id: "sess-zalo-" + rid(""),
          botId: bot.id,
          telegramUserId: userKey,
          telegramUsername: `zalo_group_${event.groupId}`,
          telegramFullName: binding.group_name || `Nhom Zalo ${event.groupId}`,
          lastMessageText: question,
          lastMessageTime: new Date().toISOString(),
          status: "bot_answered",
          internalNotes: "Den tu kenh Zalo Group",
          messages: [],
        };
        deps.chatSessions.unshift(session);
      }

      const hasPriorBotReply = session.messages.some((m) => m.sender === "bot");
      const userMsg: Message = {
        id: rid("m-zalo-"),
        sender: "user",
        username: event.senderName,
        fullName: event.senderName,
        text: question,
        timestamp: new Date().toISOString(),
      };
      session.messages.push(userMsg);
      session.lastMessageText = question;
      session.lastMessageTime = userMsg.timestamp;

      const ai = await deps.generateRAGAnswer(
        bot,
        question,
        { fullName: event.senderName, username: event.senderName, id: event.senderId },
        { shouldGreet: !hasPriorBotReply, recentMessages: session.messages.slice(-8, -1) }
      );

      const botMsg: Message = {
        id: rid("m-zalo-bot-"),
        sender: "bot",
        username: (bot as any).name,
        text: ai.text,
        timestamp: new Date().toISOString(),
        sourcesUsed: ai.sources,
        fallbackTriggered: ai.fallbackTriggered,
      };
      session.messages.push(botMsg);
      session.lastMessageText = ai.text;
      session.lastMessageTime = botMsg.timestamp;
      session.status = ai.fallbackTriggered ? "escalated" : "bot_answered";

      deps.analytics.totalMessages += 2;

      const sentId = await deps.send(event.groupId, ai.text);
      if (sentId) deps.rememberSentMessage(sentId);

      try {
        await deps.saveConversation(session);
      } catch (saveErr) {
        console.warn("[Zalo Handler] Skip Supabase save:", saveErr);
      }

      return { replied: true };
    } catch (err) {
      console.error("[Zalo Handler] Unexpected error (swallowed):", err);
      return { replied: false, reason: "error" };
    }
  };
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npm test`
Expected: PASS — toàn bộ test handler xanh.

- [ ] **Step 5: Commit**

```bash
git add zaloGroupBot/handler.ts zaloGroupBot/__tests__/handler.test.ts
git commit -m "feat: add zalo group message handler with tests"
```

---

## Task 7: zca-js client lifecycle (login QR, listener, reconnect, firewall)

**Files:**
- Create: `zaloGroupBot/client.ts`
- Create: `zaloGroupBot/index.ts`

**Interfaces:**
- Consumes: `zca-js`; store (Task 5); handler (Task 6); types (Task 2).
- Produces (export từ `index.ts`):
  - `initZaloGroupBot(injected): Promise<void>` — gọi lúc boot; no-op nếu cờ tắt.
  - `startQrLogin(): Promise<{ qr: string | null; error?: string }>` — bắt đầu login, trả QR (data URL hoặc chuỗi).
  - `getQrLoginResult(): { state: "pending" | "success" | "failed"; error?: string }`
  - `getRuntimeStatus(): ZaloRuntimeStatus`
  - `logoutZalo(): Promise<void>`
  - `listGroupBindings()`, `setGroupBinding(b)` — re-export từ store cho API.

> Phần này không unit-test (phụ thuộc Zalo thật) → verify thủ công ở Task 9. Toàn bộ tương tác zca-js cô lập tại đây; nếu API zca-js phiên bản cài khác, chỉ sửa file này.

- [ ] **Step 1: Viết `zaloGroupBot/client.ts`**

```ts
import { Zalo, ThreadType } from "zca-js";
import type {
  ZaloDeps, ZaloIncomingEvent, ZaloRuntimeStatus, ZaloSessionRecord,
} from "./types.js";
import { loadSession, saveSession, getBinding } from "./store.js";
import { createZaloMessageHandler } from "./handler.js";

interface InjectedDeps {
  generateRAGAnswer: ZaloDeps["generateRAGAnswer"];
  postProcessBotReply: ZaloDeps["postProcessBotReply"];
  getBots: ZaloDeps["getBots"];
  chatSessions: ZaloDeps["chatSessions"];
  saveConversation: ZaloDeps["saveConversation"];
  analytics: ZaloDeps["analytics"];
}

const ACCOUNT_LABEL = process.env.ZALO_ACCOUNT_LABEL || "default";
const RATE = parseInt(process.env.ZALO_RATE_LIMIT_PER_MIN || "5", 10);

let api: any = null;                 // zca-js API object
let selfUid: string | null = null;
let selfName: string | null = null;
let listenerConnected = false;
let loginState: ZaloRuntimeStatus["loginState"] = "needs_login";
let lastError: string | null = null;
let qrPayload: string | null = null;
let qrResult: { state: "pending" | "success" | "failed"; error?: string } = { state: "pending" };
let injected: InjectedDeps | null = null;

const recentBotMsgIds = new Set<string>();
function rememberSentMessage(id: string) {
  recentBotMsgIds.add(id);
  if (recentBotMsgIds.size > 1000) {
    const oldest = recentBotMsgIds.values().next().value;
    if (oldest) recentBotMsgIds.delete(oldest);
  }
}
function isBotMessageId(id: string) { return recentBotMsgIds.has(id); }

function buildDeps(): ZaloDeps {
  if (!injected) throw new Error("Zalo not initialized");
  return {
    botUid: () => selfUid,
    send: async (groupId, text) => {
      try {
        const chunks = text.match(/[\s\S]{1,1800}/g) || [text];
        let lastId: string | null = null;
        for (const chunk of chunks) {
          // Delay nhan hoa 1-3s truoc khi gui (giam rui ro phat hien bot).
          await new Promise((r) => setTimeout(r, 1000 + Math.floor(Math.random() * 2000)));
          const res = await api.sendMessage(chunk, groupId, ThreadType.Group);
          lastId = res?.message?.msgId?.toString() || res?.msgId?.toString() || lastId;
        }
        return lastId;
      } catch (e: any) {
        console.error("[Zalo Client] send error:", e?.message || e);
        return null;
      }
    },
    generateRAGAnswer: injected.generateRAGAnswer,
    postProcessBotReply: injected.postProcessBotReply,
    getBots: injected.getBots,
    getBinding,
    chatSessions: injected.chatSessions,
    saveConversation: injected.saveConversation,
    analytics: injected.analytics,
    rememberSentMessage,
    isBotMessageId,
    ratePerMin: RATE,
  };
}

// Chuan hoa event tho cua zca-js -> ZaloIncomingEvent.
function normalizeEvent(raw: any): ZaloIncomingEvent | null {
  try {
    const threadType = raw?.type ?? raw?.threadType;
    if (threadType !== ThreadType.Group) return null;          // chi xu ly nhom
    const groupId = (raw?.threadId ?? raw?.data?.threadId ?? "").toString();
    const data = raw?.data ?? raw;
    const messageId = (data?.msgId ?? data?.cliMsgId ?? "").toString();
    const senderId = (data?.uidFrom ?? "").toString();
    const senderName = (data?.dName ?? "Khach hang Zalo").toString();
    const content = data?.content;
    const text = typeof content === "string" ? content : (content?.text ?? "");
    const mentions = Array.isArray(data?.mentions) ? data.mentions : [];
    const mentionedUids = mentions.map((m: any) => (m?.uid ?? "").toString()).filter(Boolean);
    const quotedMessageId = (data?.quote?.globalMsgId ?? data?.quote?.cliMsgId ?? "")?.toString() || undefined;
    if (!groupId || !messageId) return null;
    return { groupId, messageId, senderId, senderName, text: String(text || ""), mentionedUids, quotedMessageId };
  } catch {
    return null;
  }
}

async function startListening(handler: (e: ZaloIncomingEvent) => Promise<any>) {
  try {
    api.listener.on("message", (raw: any) => {
      const ev = normalizeEvent(raw);
      if (!ev) return;
      handler(ev).catch((e) => console.error("[Zalo Client] handler error:", e));
    });
    api.listener.onError?.((e: any) => {
      console.error("[Zalo Client] listener error:", e);
      listenerConnected = false;
      scheduleReconnect();
    });
    api.listener.onClosed?.(() => {
      console.warn("[Zalo Client] listener closed");
      listenerConnected = false;
      scheduleReconnect();
    });
    api.listener.start();
    listenerConnected = true;
    loginState = "active";
    console.log("[Zalo Client] listener started");
  } catch (e: any) {
    lastError = e?.message || String(e);
    listenerConnected = false;
    console.error("[Zalo Client] startListening failed:", lastError);
  }
}

let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectDelay = 5000;
function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      const rec = await loadSession(ACCOUNT_LABEL);
      if (rec?.credentials) {
        await loginWithCredentials(rec.credentials);
      }
    } catch (e: any) {
      console.error("[Zalo Client] reconnect failed:", e?.message || e);
    }
    reconnectDelay = Math.min(reconnectDelay * 2, 60_000);
  }, reconnectDelay);
}

async function bootApi(loggedIn: any) {
  api = loggedIn;
  try {
    const ctx = api.getContext?.() || {};
    selfUid = (ctx.uid ?? ctx.userId ?? null)?.toString() || selfUid;
    selfName = ctx.displayName ?? selfName;
  } catch { /* optional */ }
  reconnectDelay = 5000;
  await startListening(createZaloMessageHandler(buildDeps()));
}

async function loginWithCredentials(credentials: any) {
  const zalo = new Zalo();
  const loggedIn = await zalo.login(credentials); // cookie/imei/userAgent
  await bootApi(loggedIn);
  await saveSession({
    id: ACCOUNT_LABEL, account_label: ACCOUNT_LABEL, credentials,
    status: "active", last_error: null,
  } as ZaloSessionRecord);
}

export async function initZaloGroupBot(deps: InjectedDeps): Promise<void> {
  injected = deps;
  if (process.env.ZALO_GROUP_BOT_ENABLED !== "true") {
    console.log("[Zalo Client] disabled (ZALO_GROUP_BOT_ENABLED != true)");
    return;
  }
  try {
    const rec = await loadSession(ACCOUNT_LABEL);
    if (rec?.credentials && rec.status === "active") {
      await loginWithCredentials(rec.credentials);
    } else {
      loginState = "needs_login";
      console.log("[Zalo Client] no active session, waiting for QR login via admin");
    }
  } catch (e: any) {
    lastError = e?.message || String(e);
    loginState = "error";
    console.error("[Zalo Client] init error (swallowed):", lastError);
  }
}

export async function startQrLogin(): Promise<{ qr: string | null; error?: string }> {
  if (process.env.ZALO_GROUP_BOT_ENABLED !== "true") {
    return { qr: null, error: "ZALO_GROUP_BOT_ENABLED chua bat" };
  }
  try {
    loginState = "logging_in";
    qrResult = { state: "pending" };
    qrPayload = null;
    const zalo = new Zalo();
    // loginQR goi callback voi data QR; khi nguoi dung quet xong, promise resolve voi api da dang nhap.
    const loginPromise = zalo.loginQR(undefined, (qrData: any) => {
      qrPayload = qrData?.data?.image || qrData?.image || qrData?.data || null;
    });
    loginPromise
      .then(async (loggedIn: any) => {
        await bootApi(loggedIn);
        const credentials = await api.getCookie?.();
        const ctx = api.getContext?.() || {};
        await saveSession({
          id: ACCOUNT_LABEL, account_label: ACCOUNT_LABEL,
          credentials: { cookie: credentials, imei: ctx.imei, userAgent: ctx.userAgent },
          status: "active", last_error: null,
        } as ZaloSessionRecord);
        qrResult = { state: "success" };
      })
      .catch((e: any) => {
        lastError = e?.message || String(e);
        loginState = "error";
        qrResult = { state: "failed", error: lastError };
        console.error("[Zalo Client] QR login failed:", lastError);
      });
    // Cho payload QR xuat hien (toi da ~8s).
    for (let i = 0; i < 40 && !qrPayload; i++) await new Promise((r) => setTimeout(r, 200));
    return { qr: qrPayload };
  } catch (e: any) {
    return { qr: null, error: e?.message || String(e) };
  }
}

export function getQrLoginResult() { return qrResult; }

export function getRuntimeStatus(): ZaloRuntimeStatus {
  return {
    enabled: process.env.ZALO_GROUP_BOT_ENABLED === "true",
    loginState,
    accountLabel: ACCOUNT_LABEL,
    accountName: selfName,
    listenerConnected,
    lastError,
  };
}

export async function logoutZalo(): Promise<void> {
  try { api?.listener?.stop?.(); } catch { /* ignore */ }
  api = null; selfUid = null; selfName = null; listenerConnected = false;
  loginState = "needs_login";
  await saveSession({
    id: ACCOUNT_LABEL, account_label: ACCOUNT_LABEL, credentials: null,
    status: "needs_login", last_error: null,
  } as ZaloSessionRecord);
}
```

- [ ] **Step 2: Viết `zaloGroupBot/index.ts`**

```ts
export {
  initZaloGroupBot, startQrLogin, getQrLoginResult, getRuntimeStatus, logoutZalo,
} from "./client.js";
export { listBindings, upsertBinding } from "./store.js";
export type { ZaloRuntimeStatus, GroupBinding } from "./types.js";
```

- [ ] **Step 3: Kiểm tra biên dịch**

Run: `npx tsc --noEmit`
Expected: PASS. Nếu lỗi do tên export của `zca-js` khác phiên bản cài: mở `node_modules/zca-js` xem export thật (`Zalo`, `ThreadType`, `loginQR`, `login`, `sendMessage`, `listener`) và chỉnh **chỉ trong `client.ts`** cho khớp; giữ nguyên `normalizeEvent` trả đúng `ZaloIncomingEvent`.

- [ ] **Step 4: Commit**

```bash
git add zaloGroupBot/client.ts zaloGroupBot/index.ts
git commit -m "feat: add zca-js client lifecycle with reconnect and error firewall"
```

---

## Task 8: Admin API endpoints + /health trong server.ts

**Files:**
- Modify: `server.ts` (thêm import gần dòng 8; thêm routes; thêm `/health`)

**Interfaces:**
- Consumes: exports từ `zaloGroupBot/index.js`; `requireOwnerAdmin`, `dbGetBots`, `dbSaveConversation`, `bots`, `chatSessions`, `analytics`, `generateRAGAnswer`, `postProcessBotReply` (đã có trong server.ts).
- Produces routes: `GET /health`, `GET /api/zalo/status`, `POST /api/zalo/login/start`, `GET /api/zalo/login/result`, `POST /api/zalo/logout`, `GET /api/zalo/groups`, `POST /api/zalo/groups/:groupId/binding`, `POST /api/zalo/simulate`.

- [ ] **Step 1: Thêm import ở đầu `server.ts`** (ngay sau import supabaseService, quanh dòng 8–20)

```ts
import {
  initZaloGroupBot, startQrLogin, getQrLoginResult, getRuntimeStatus,
  logoutZalo, listBindings, upsertBinding,
} from "./zaloGroupBot/index.js";
```

- [ ] **Step 2: Thêm `/health` và các route Zalo** (đặt cạnh các route facebook-webhook, sau dòng ~2119)

```ts
// Health check cho uptime pinger (giu Render thuc khi chay listener Zalo).
app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), zalo: getRuntimeStatus() });
});

// ===== Zalo Group Bot admin API (owner-only) =====
app.get("/api/zalo/status", (req, res) => {
  if (!requireOwnerAdmin(req, res)) return;
  res.json(getRuntimeStatus());
});

app.post("/api/zalo/login/start", async (req, res) => {
  if (!requireOwnerAdmin(req, res)) return;
  const r = await startQrLogin();
  res.json(r);
});

app.get("/api/zalo/login/result", (req, res) => {
  if (!requireOwnerAdmin(req, res)) return;
  res.json(getQrLoginResult());
});

app.post("/api/zalo/logout", async (req, res) => {
  if (!requireOwnerAdmin(req, res)) return;
  await logoutZalo();
  res.json({ ok: true });
});

app.get("/api/zalo/groups", async (req, res) => {
  if (!requireOwnerAdmin(req, res)) return;
  const bindings = await listBindings();
  const allBots = await dbGetBots(bots);
  res.json({ bindings, bots: allBots.map((b) => ({ id: b.id, name: b.name })) });
});

app.post("/api/zalo/groups/:groupId/binding", async (req, res) => {
  if (!requireOwnerAdmin(req, res)) return;
  const { botId, enabled, groupName } = req.body || {};
  if (!botId) return res.status(400).json({ error: "Thieu botId" });
  await upsertBinding({
    group_id: req.params.groupId,
    group_name: groupName,
    bot_id: botId,
    enabled: enabled !== false,
  });
  res.json({ ok: true });
});

// Test duong RAG ma khong can Zalo that.
app.post("/api/zalo/simulate", async (req, res) => {
  if (!requireOwnerAdmin(req, res)) return;
  const { botId, text, senderName } = req.body || {};
  const allBots = await dbGetBots(bots);
  const bot = allBots.find((b) => b.id === botId);
  if (!bot) return res.status(404).json({ error: "Bot not found" });
  try {
    const ai = await generateRAGAnswer(
      bot, String(text || ""),
      { fullName: senderName || "Khach test", username: senderName || "tester", id: "zalo-sim" },
      { shouldGreet: true, recentMessages: [] }
    );
    res.json({ reply: postProcessBotReply(ai.text, { shouldGreet: true }), sources: ai.sources });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Zalo simulation failed" });
  }
});
```

- [ ] **Step 3: Kiểm tra biên dịch + khởi động server (cờ tắt)**

Run: `npx tsc --noEmit`
Expected: PASS.
Run: `npm run dev` (để mặc định `ZALO_GROUP_BOT_ENABLED` chưa set)
Expected: log `BalaBot Server running ...` và `[Zalo Client] disabled (...)`; server không crash. Dừng bằng Ctrl+C.

- [ ] **Step 4: Verify `/health` và guard owner**

Run: `curl -s http://localhost:3000/health`
Expected: JSON `{ "ok": true, ... "zalo": { "enabled": false, ... } }`.
Run: `curl -s -X POST http://localhost:3000/api/zalo/login/start`
Expected: 403 (không phải owner) — xác nhận guard hoạt động.

> Ghi chú: PORT thực tế đọc từ env (`PORT`); thay `3000` cho khớp log khởi động nếu khác.

- [ ] **Step 5: Commit**

```bash
git add server.ts
git commit -m "feat: add zalo admin api endpoints and health check"
```

---

## Task 9: Wire init vào boot + verify E2E thủ công

**Files:**
- Modify: `server.ts` (trong callback `app.listen`, quanh dòng 4237–4246)

**Interfaces:**
- Consumes: `initZaloGroupBot` (Task 7), `generateRAGAnswer`, `postProcessBotReply`, `dbGetBots`, `dbSaveConversation`, `chatSessions`, `analytics`, `bots`.

- [ ] **Step 1: Gọi `initZaloGroupBot` sau khi server lắng nghe** (thêm vào trong callback `app.listen`, sau `startSchedulerEngine();`)

```ts
    // Khoi dong Zalo Group Bot (no-op neu ZALO_GROUP_BOT_ENABLED != true).
    await initZaloGroupBot({
      generateRAGAnswer,
      postProcessBotReply,
      getBots: () => dbGetBots(bots),
      chatSessions,
      saveConversation: dbSaveConversation,
      analytics,
    });
```

- [ ] **Step 2: Kiểm tra biên dịch**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Verify đường simulate (không cần Zalo thật)**

Tạm bật quyền owner để test: gọi `/api/zalo/simulate` với header email owner mà server dùng (xem `getRequestUserEmail` trong `server.ts` để biết header — ví dụ `x-user-email`).
Run:
```bash
curl -s -X POST http://localhost:3000/api/zalo/simulate \
  -H "content-type: application/json" \
  -H "x-user-email: ox102.crypto@gmail.com" \
  -d '{"botId":"<MOT_BOT_ID_CO_THAT>","text":"gia bao nhieu?","senderName":"Khach"}'
```
Expected: JSON `{ "reply": "<cau tra loi RAG>", ... }`.

- [ ] **Step 4: Verify E2E thật (thủ công, cần nick Zalo phụ)**

1. Đặt env `ZALO_GROUP_BOT_ENABLED=true` rồi `npm run dev`.
2. Đăng nhập owner trên UI; mở panel Zalo (Task 10) — hoặc gọi `POST /api/zalo/login/start` và lấy QR.
3. Quét QR bằng app Zalo của nick phụ.
4. `GET /api/zalo/status` → `loginState: "active"`, `listenerConnected: true`.
5. Add nick phụ vào một group test; tạo binding group→bot qua `POST /api/zalo/groups/:groupId/binding` (lấy groupId từ log khi có tin nhắn đến).
6. Trong group: @mention bot → nhận trả lời. Reply vào tin bot → nhận trả lời. Tin thường → **im lặng**.
7. Kiểm tra hội thoại xuất hiện trong CRM/sessions (key `zalo:<groupId>`).

- [ ] **Step 5: Commit**

```bash
git add server.ts
git commit -m "feat: wire zalo group bot into server boot"
```

---

## Task 10: Admin UI panel trong App.tsx

**Files:**
- Modify: `src/App.tsx` (thêm panel "Zalo Group" cạnh panel tích hợp Telegram/Facebook hiện có)

**Interfaces:**
- Consumes: API Task 8 (`/api/zalo/status`, `/login/start`, `/login/result`, `/logout`, `/groups`, `/groups/:id/binding`).

> Codebase dùng React 19 + fetch trực tiếp. Theo đúng pattern panel Facebook/Telegram đang có trong `App.tsx` (tìm chuỗi `facebook-webhook` hoặc panel "Messenger" để đặt cạnh và tái dùng style/headers auth hiện hành).

- [ ] **Step 1: Tìm panel tích hợp hiện có làm mẫu**

Run: `grep -n "facebook-webhook\|Messenger\|telegram-webhook" src/App.tsx`
Expected: thấy block JSX panel tích hợp + cách gọi fetch kèm header auth (email owner). Dùng đúng helper/headers đó.

- [ ] **Step 2: Thêm state + hàm gọi API** (trong component chứa panel tích hợp)

```tsx
const [zaloStatus, setZaloStatus] = useState<any>(null);
const [zaloQr, setZaloQr] = useState<string | null>(null);
const [zaloGroups, setZaloGroups] = useState<{ bindings: any[]; bots: any[] }>({ bindings: [], bots: [] });

// Dung dung helper fetch + headers auth nhu cac panel khac trong file nay.
const loadZalo = async () => {
  const s = await fetch("/api/zalo/status", { headers: authHeaders() }).then((r) => r.json());
  setZaloStatus(s);
  const g = await fetch("/api/zalo/groups", { headers: authHeaders() }).then((r) => r.json());
  setZaloGroups(g);
};

const startZaloLogin = async () => {
  const r = await fetch("/api/zalo/login/start", { method: "POST", headers: authHeaders() }).then((x) => x.json());
  setZaloQr(r.qr || null);
  const poll = setInterval(async () => {
    const res = await fetch("/api/zalo/login/result", { headers: authHeaders() }).then((x) => x.json());
    if (res.state === "success" || res.state === "failed") {
      clearInterval(poll);
      setZaloQr(null);
      await loadZalo();
    }
  }, 2000);
};

const saveZaloBinding = async (groupId: string, botId: string, enabled: boolean, groupName?: string) => {
  await fetch(`/api/zalo/groups/${encodeURIComponent(groupId)}/binding`, {
    method: "POST",
    headers: { ...authHeaders(), "content-type": "application/json" },
    body: JSON.stringify({ botId, enabled, groupName }),
  });
  await loadZalo();
};
```

> `authHeaders()` là tên đại diện — thay bằng cơ chế gắn email owner thực tế mà các panel khác trong `App.tsx` đang dùng (tìm ở Step 1).

- [ ] **Step 3: Thêm JSX panel** (đặt cạnh panel Messenger)

```tsx
<section className="integration-card">
  <h3>Zalo Group (khong chinh thuc)</h3>
  <p>Bot tra loi trong nhom Zalo khi duoc @nhac hoac reply. Dung nick phu, co rui ro khoa nick.</p>

  <div>Trang thai: {zaloStatus?.loginState || "?"} | Listener: {String(zaloStatus?.listenerConnected)}</div>
  {zaloStatus?.lastError && <div style={{ color: "crimson" }}>Loi: {zaloStatus.lastError}</div>}

  {zaloStatus?.loginState !== "active" && (
    <button onClick={startZaloLogin}>Dang nhap Zalo (quet QR)</button>
  )}
  {zaloStatus?.loginState === "active" && (
    <button onClick={() => fetch("/api/zalo/logout", { method: "POST", headers: authHeaders() }).then(loadZalo)}>
      Dang xuat
    </button>
  )}
  {zaloQr && <img src={zaloQr} alt="Quet QR bang app Zalo" style={{ width: 220 }} />}

  <h4>Gan bot cho tung nhom</h4>
  {zaloGroups.bindings.map((b) => (
    <div key={b.group_id}>
      <span>{b.group_name || b.group_id}</span>
      <select defaultValue={b.bot_id} onChange={(e) => saveZaloBinding(b.group_id, e.target.value, b.enabled, b.group_name)}>
        {zaloGroups.bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
      </select>
      <label>
        <input type="checkbox" defaultChecked={b.enabled}
          onChange={(e) => saveZaloBinding(b.group_id, b.bot_id, e.target.checked, b.group_name)} /> Bat
      </label>
    </div>
  ))}
</section>
```

- [ ] **Step 4: Gọi `loadZalo()` khi mở tab tích hợp**

Thêm `useEffect(() => { loadZalo(); }, []);` (hoặc gọi trong handler mở tab, theo pattern các panel khác).

- [ ] **Step 5: Build + kiểm tra UI**

Run: `npm run build`
Expected: build vite + esbuild thành công, không lỗi type.
Verify thủ công: `npm run dev`, đăng nhập owner, mở panel Zalo → thấy trạng thái, nút đăng nhập, danh sách binding.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add zalo group admin panel to UI"
```

---

## Task 11: Tài liệu vận hành (keep-alive + hướng dẫn)

**Files:**
- Create: `docs/zalo-group-bot-ops.md`
- Modify: `README.md` (thêm 1 mục trỏ tới ops)

**Interfaces:** Không có code; tài liệu.

- [ ] **Step 1: Tạo `docs/zalo-group-bot-ops.md`**

```markdown
# Zalo Group Bot — Vận hành

## Bật tính năng
1. Chạy `zaloGroupBot.sql` trên Supabase (tạo `zalo_sessions`, `zalo_group_bindings`).
2. Đặt env trên Render: `ZALO_GROUP_BOT_ENABLED=true`, `ZALO_ACCOUNT_LABEL=default`, `ZALO_RATE_LIMIT_PER_MIN=5`.
3. Deploy lại. Mở admin → panel "Zalo Group" → "Đăng nhập Zalo" → quét QR bằng **nick phụ**.

## Keep-alive (BẮT BUỘC cho 24/7)
WebSocket listener là kết nối outbound → Render free vẫn ngủ sau ~15 phút không có request inbound.
Chọn một:
- **Render trả phí** (instance always-on), HOẶC
- **Uptime pinger** (UptimeRobot / cron-job.org) gọi `https://<domain>/health` mỗi 5 phút.

## Rủi ro
- Tự động hoá tài khoản Zalo cá nhân **vi phạm ToS Zalo**, có thể bị khoá nick. Dùng nick phụ.
- Khi phiên hỏng: `GET /api/zalo/status` trả `loginState: "needs_login"` → đăng nhập lại bằng QR.

## Giới hạn hiện tại
- Chỉ nhóm, chỉ text, chỉ trả lời khi @mention hoặc reply. Một tài khoản bot.
```

- [ ] **Step 2: Thêm vào `README.md`**

Thêm dòng:
```markdown
- Zalo Group Bot (không chính thức): xem `docs/zalo-group-bot-ops.md`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/zalo-group-bot-ops.md README.md
git commit -m "docs: add zalo group bot ops guide"
```

---

## Self-Review (đã thực hiện khi viết plan)

**Spec coverage:**
- §1 Bối cảnh/quyết định → Global Constraints + Task 1 (env flag).
- §2 Kiến trúc (module cùng process, deps injection) → Task 2, 6, 7, 9.
- §2 Bảng Supabase → Task 1 (SQL) + Task 5 (store).
- §2 API admin → Task 8. Panel UI → Task 10.
- §3 Luồng dữ liệu + key `zalo:<groupId>` → Task 6 (handler + test).
- §4 Trigger @mention/reply + dedupe → Task 3 + Task 6.
- §5 An toàn: rate-limit → Task 4; delay 1–3s → Task 7 (`send`); auth lỗi → Task 7 (`needs_login`, reconnect tách auth/mạng); cờ tắt mặc định → Task 1+9.
- §6 Keep-alive Render → Task 8 (`/health`) + Task 11 (ops).
- §7 Graceful degradation → Task 5 (mem fallback), Task 6 (swallow), Task 7 (firewall).
- §8 Test: simulate → Task 8; unit → Task 3/4/6; E2E thủ công → Task 9.
- §9 Phụ thuộc → Task 1.
- §11 Tiêu chí thành công 1–7 → phủ bởi Task 6 (test), Task 9 (E2E), Task 1+9 (cờ tắt).

**Placeholder scan:** Mã trong từng step là mã thật. Hai chỗ phụ thuộc môi trường được nêu rõ cách xác định thay vì để mơ hồ: tên export `zca-js` (Task 7 Step 3) và `authHeaders()`/header auth UI (Task 10 Step 1–2) — đều có lệnh `grep`/hướng dẫn cụ thể để chốt giá trị thật.

**Type consistency:** `ZaloIncomingEvent`, `ZaloDeps`, `GroupBinding`, `ZaloSessionRecord`, `ZaloRuntimeStatus` định nghĩa một lần ở Task 2 và dùng nhất quán ở Task 3/5/6/7. Khoá hội thoại `zalo:<groupId>` thống nhất giữa spec §3, Task 6 (handler + test). Chữ ký `generateRAGAnswer`/`postProcessBotReply` khớp đúng codebase (đã đọc tại `server.ts:3116` và `server.ts:2699`).
