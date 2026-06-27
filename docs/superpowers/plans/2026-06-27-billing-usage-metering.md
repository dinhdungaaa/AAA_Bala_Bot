# Billing & Usage Metering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đo số tin AI mỗi khách dùng/tháng, chặn khi vượt hạn mức (cảnh báo → ân hạn → chặn), hiển thị mức dùng cho khách + admin. Thanh toán thủ công.

**Architecture:** Bảng Supabase `usage_counters` đếm theo `(ownerKey=bot.userId, yearMonth)`. Hàm thuần `usageVerdict`/`currentYearMonth` (test được). Mỗi kênh thật gọi `checkUsageGate` trước khi sinh câu trả lời và `recordUsageForBot` sau khi gửi thành công. Lỗi DB → fail-open.

**Tech Stack:** TypeScript ESM, Express, Supabase (service-role), Vitest, React (App.tsx).

## Global Constraints
- Đếm CHỈ tin bot trả lời ở kênh thật: Telegram, Facebook, Zalo, Botpress. KHÔNG đếm playground/eval/simulate/welcome.
- Ngưỡng: `warn` khi count ≥ limit×0.8; `blocked` khi count ≥ limit×1.1 (ân hạn +10%).
- Blocked → KHÔNG gọi AI, KHÔNG tăng counter, trả câu thông báo cấu hình được.
- Lỗi Supabase khi đọc/ghi usage → **fail-open** (vẫn trả lời), chỉ log.
- `ownerKey = bot.userId`; bot.userId rỗng → bỏ qua đo dùng.
- Hạn mức hiệu lực = `customer.messageLimit` nếu có, else `PLAN_LIMITS[tier].messages`, else free (150).
- yearMonth tính theo UTC+7, định dạng `"YYYY-MM"`.
- Imports dùng đuôi `.js`. Mọi test chạy `npx vitest run`.

---

### Task 1: Pure config + verdict functions

**Files:**
- Modify: `src/types.ts`
- Modify: `server.ts`
- Test: `rag/__tests__/billing.test.ts` (mới — đặt cùng chỗ test hiện có để vitest tự nhặt)

**Interfaces:**
- Produces: `PLAN_LIMITS`, `currentYearMonth(d?: Date): string`, `usageVerdict(count: number, limit: number): 'ok'|'warn'|'blocked'`, types `UsageCounter`, `PlanLimit`, mở rộng `tier`.

- [ ] **Step 1: Mở rộng type `tier` + thêm types (src/types.ts)**

Trong `SaasCustomer`, đổi:
```ts
tier: 'free' | 'pro' | 'enterprise';
```
thành:
```ts
tier: 'free' | 'starter' | 'pro' | 'business' | 'enterprise';
```
Thêm cuối file:
```ts
export interface UsageCounter {
  ownerKey: string;
  yearMonth: string;     // "YYYY-MM"
  messageCount: number;
  updatedAt: string;
}
export interface PlanLimit { messages: number; bots: number; channels: number | 'all'; }
```

- [ ] **Step 2: Viết test trước (rag/__tests__/billing.test.ts)**

```ts
import { describe, it, expect } from "vitest";
import { usageVerdict, currentYearMonth, PLAN_LIMITS } from "../../billing.js";

describe("usageVerdict", () => {
  it("ok khi duoi 80%", () => expect(usageVerdict(79, 100)).toBe("ok"));
  it("warn khi >=80% va <110%", () => {
    expect(usageVerdict(80, 100)).toBe("warn");
    expect(usageVerdict(109, 100)).toBe("warn");
  });
  it("blocked khi >=110% (het an han)", () => {
    expect(usageVerdict(110, 100)).toBe("blocked");
    expect(usageVerdict(999, 100)).toBe("blocked");
  });
  it("limit 0 hoac am -> ok (khong chan)", () => expect(usageVerdict(50, 0)).toBe("ok"));
});

describe("currentYearMonth", () => {
  it("dinh dang YYYY-MM theo UTC+7", () => {
    // 2026-06-30 23:00 UTC = 2026-07-01 06:00 UTC+7 -> thang 07
    expect(currentYearMonth(new Date("2026-06-30T23:00:00Z"))).toBe("2026-07");
    expect(currentYearMonth(new Date("2026-06-30T16:00:00Z"))).toBe("2026-06");
  });
});

describe("PLAN_LIMITS", () => {
  it("co du 5 goi voi messages hop le", () => {
    for (const t of ["free","starter","pro","business","enterprise"] as const) {
      expect(typeof PLAN_LIMITS[t].messages).toBe("number");
    }
    expect(PLAN_LIMITS.free.messages).toBe(150);
  });
});
```

- [ ] **Step 3: Chạy test (đỏ)**
Run: `npx vitest run rag/__tests__/billing.test.ts`
Expected: FAIL — `../../billing.js` chưa tồn tại.

- [ ] **Step 4: Tạo `billing.ts` (gốc dự án) với logic thuần**

```ts
import type { PlanLimit } from "./src/types.js";

export const PLAN_LIMITS: Record<"free"|"starter"|"pro"|"business"|"enterprise", PlanLimit> = {
  free:       { messages: 150,    bots: 1,         channels: 1 },
  starter:    { messages: 3000,   bots: 3,         channels: "all" },
  pro:        { messages: 10000,  bots: 10,        channels: "all" },
  business:   { messages: 30000,  bots: Infinity,  channels: "all" },
  enterprise: { messages: 250000, bots: Infinity,  channels: "all" },
};

export function currentYearMonth(d: Date = new Date()): string {
  const vn = new Date(d.getTime() + 7 * 3600 * 1000); // UTC+7
  return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function usageVerdict(count: number, limit: number): "ok" | "warn" | "blocked" {
  if (!limit || limit <= 0) return "ok";
  if (count >= limit * 1.1) return "blocked";
  if (count >= limit * 0.8) return "warn";
  return "ok";
}
```

- [ ] **Step 5: Chạy test (xanh)**
Run: `npx vitest run rag/__tests__/billing.test.ts` → PASS. Rồi `npx tsc --noEmit -p tsconfig.json` → OK.

- [ ] **Step 6: Commit**
```bash
git add src/types.ts billing.ts rag/__tests__/billing.test.ts
git commit -m "feat(billing): plan limits + usage verdict pure functions"
```

---

### Task 2: Supabase usage layer + migration

**Files:**
- Create: `usageCounters.sql`
- Modify: `supabaseService.ts`

**Interfaces:**
- Produces: `dbGetUsage(ownerKey, yearMonth): Promise<number>`, `dbIncrementUsage(ownerKey, yearMonth): Promise<void>`, `dbGetUsageBulk(yearMonth): Promise<Record<string, number>>`.

- [ ] **Step 1: Tạo `usageCounters.sql`**
```sql
create table if not exists usage_counters (
  "ownerKey" text not null,
  "yearMonth" text not null,
  "messageCount" integer not null default 0,
  "updatedAt" timestamptz not null default now(),
  primary key ("ownerKey", "yearMonth")
);
alter table usage_counters enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='usage_counters' and policyname='usage_counters_no_client_access') then
    create policy usage_counters_no_client_access on usage_counters using (false) with check (false);
  end if;
end $$;
-- Tăng atomic, tránh race đọc-cộng-ghi:
create or replace function increment_usage(p_owner text, p_month text)
returns void language sql as $$
  insert into usage_counters ("ownerKey","yearMonth","messageCount","updatedAt")
  values (p_owner, p_month, 1, now())
  on conflict ("ownerKey","yearMonth")
  do update set "messageCount" = usage_counters."messageCount" + 1, "updatedAt" = now();
$$;
```

- [ ] **Step 2: Thêm import type (supabaseService.ts)**
Thêm `UsageCounter` vào dòng import từ `./src/types`.

- [ ] **Step 3: Thêm 3 hàm DB (cuối supabaseService.ts)** — theo đúng pattern fail-open hiện có
```ts
export async function dbGetUsage(ownerKey: string, yearMonth: string): Promise<number> {
  const client = getSupabaseClient();
  if (!client || !ownerKey) return 0;
  try {
    const { data, error } = await client.from("usage_counters")
      .select("messageCount").eq("ownerKey", ownerKey).eq("yearMonth", yearMonth).maybeSingle();
    if (error) { console.warn("dbGetUsage error:", error.message); return 0; }
    return (data as any)?.messageCount ?? 0;
  } catch (e: any) { console.warn("dbGetUsage failed:", e?.message || e); return 0; }
}

export async function dbIncrementUsage(ownerKey: string, yearMonth: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client || !ownerKey) return;
  try {
    const { error } = await client.rpc("increment_usage", { p_owner: ownerKey, p_month: yearMonth });
    if (error) console.warn("dbIncrementUsage error:", error.message);
  } catch (e: any) { console.warn("dbIncrementUsage failed:", e?.message || e); }
}

export async function dbGetUsageBulk(yearMonth: string): Promise<Record<string, number>> {
  const client = getSupabaseClient();
  if (!client) return {};
  try {
    const { data, error } = await client.from("usage_counters")
      .select("ownerKey,messageCount").eq("yearMonth", yearMonth);
    if (error) { console.warn("dbGetUsageBulk error:", error.message); return {}; }
    const out: Record<string, number> = {};
    for (const r of (data as any[]) || []) out[r.ownerKey] = r.messageCount;
    return out;
  } catch (e: any) { console.warn("dbGetUsageBulk failed:", e?.message || e); return {}; }
}
```

- [ ] **Step 4: tsc + commit**
Run: `npx tsc --noEmit -p tsconfig.json` → OK.
```bash
git add usageCounters.sql supabaseService.ts
git commit -m "feat(billing): usage_counters table + DB layer (atomic increment, fail-open)"
```

---

### Task 3: Server orchestration (resolve limit, record, gate)

**Files:**
- Modify: `server.ts`
- Test: `rag/__tests__/billing-gate.test.ts`

**Interfaces:**
- Consumes: `PLAN_LIMITS`, `currentYearMonth`, `usageVerdict` từ `billing.js`; `dbGetUsage`, `dbIncrementUsage` từ supabaseService.
- Produces: `resolveLimitForOwner(ownerKey, customers): number` (thuần, test được); `recordUsageForBot(bot)`, `checkUsageGate(bot): Promise<{ allowed, verdict, count, limit }>`.

- [ ] **Step 1: Test cho resolveLimitForOwner (rag/__tests__/billing-gate.test.ts)**
```ts
import { describe, it, expect } from "vitest";
import { resolveLimitForOwner } from "../../billingResolve.js";

const customers = [
  { id: "u1", email: "a@x.com", tier: "starter", messageLimit: 0 },
  { id: "u2", email: "b@x.com", tier: "pro", messageLimit: 5000 },
] as any[];

describe("resolveLimitForOwner", () => {
  it("dung messageLimit khi >0", () => expect(resolveLimitForOwner("u2", customers)).toBe(5000));
  it("rot ve PLAN_LIMITS theo tier khi messageLimit=0", () => expect(resolveLimitForOwner("u1", customers)).toBe(3000));
  it("khop theo email", () => expect(resolveLimitForOwner("b@x.com", customers)).toBe(5000));
  it("khong thay -> free 150", () => expect(resolveLimitForOwner("zzz", customers)).toBe(150));
});
```

- [ ] **Step 2: Chạy test (đỏ)** — `billingResolve.js` chưa có.

- [ ] **Step 3: Tạo `billingResolve.ts` (thuần)**
```ts
import { PLAN_LIMITS } from "./billing.js";
type C = { id?: string; email?: string; tier?: string; messageLimit?: number };
export function resolveLimitForOwner(ownerKey: string, customers: C[]): number {
  const c = customers.find(x => x.id === ownerKey || (x.email && x.email.toLowerCase() === String(ownerKey).toLowerCase()));
  if (c?.messageLimit && c.messageLimit > 0) return c.messageLimit;
  const tier = (c?.tier as keyof typeof PLAN_LIMITS) || "free";
  return (PLAN_LIMITS[tier] || PLAN_LIMITS.free).messages;
}
```

- [ ] **Step 4: Chạy test (xanh).**

- [ ] **Step 5: Thêm orchestration vào server.ts** (gần các helper RAG)
```ts
import { currentYearMonth, usageVerdict } from "./billing.js";
import { resolveLimitForOwner } from "./billingResolve.js";
import { dbGetUsage, dbIncrementUsage, dbGetUsageBulk } from "./supabaseService.js";

const BLOCK_MESSAGE = "Dạ hệ thống tạm đạt giới hạn phục vụ trong tháng, mong anh/chị thông cảm và liên hệ lại sau ạ.";

async function checkUsageGate(bot: BotConfig): Promise<{ allowed: boolean; verdict: "ok"|"warn"|"blocked"; count: number; limit: number }> {
  const ownerKey = bot.userId || "";
  if (!ownerKey) return { allowed: true, verdict: "ok", count: 0, limit: 0 };
  const limit = resolveLimitForOwner(ownerKey, saasCustomers);
  const count = await dbGetUsage(ownerKey, currentYearMonth());     // fail-open: trả 0 nếu lỗi
  const verdict = usageVerdict(count, limit);
  return { allowed: verdict !== "blocked", verdict, count, limit };
}

async function recordUsageForBot(bot: BotConfig): Promise<void> {
  const ownerKey = bot.userId || "";
  if (!ownerKey) return;
  await dbIncrementUsage(ownerKey, currentYearMonth());
}
```
*(Lưu ý: `saasCustomers` là danh sách CRM in-memory đã có. Nếu cần dữ liệu mới nhất từ profiles, mở rộng sau.)*

- [ ] **Step 6: tsc + commit**
```bash
git add billingResolve.ts rag/__tests__/billing-gate.test.ts server.ts
git commit -m "feat(billing): owner limit resolve + usage gate/record orchestration"
```

---

### Task 4: Wire gate+record vào Telegram, Facebook, Botpress

**Files:** Modify `server.ts`

- [ ] **Step 1: Telegram** — trong handler webhook, NGAY TRƯỚC lời gọi `generateRAGAnswer` cho tin thường (không phải /start), chèn:
```ts
const gate = await checkUsageGate(bot);
if (!gate.allowed) {
  await sendTelegramMessage(bot.telegramToken, chatId, BLOCK_MESSAGE); // dùng hàm gửi TG hiện có
  return;
}
```
Và NGAY SAU khi gửi câu trả lời AI thành công: `await recordUsageForBot(bot);`

- [ ] **Step 2: Facebook** — trong `processFacebookIncomingMessage`, nhánh `else` (không phải /start), trước `generateRAGAnswer`:
```ts
const gate = await checkUsageGate(bot);
if (!gate.allowed) {
  if (options?.sendReply !== false) await sendFacebookTextMessage(bot, senderId, BLOCK_MESSAGE);
  return null;
}
```
Sau khi gửi `aiAnswer.text` thành công: `await recordUsageForBot(bot);`

- [ ] **Step 3: Botpress** — trong `/api/integrations/botpress/reply`, trước `generateRAGAnswer`:
```ts
const gate = await checkUsageGate(bot);
if (!gate.allowed) return res.json({ reply: BLOCK_MESSAGE, text: BLOCK_MESSAGE, sources: [], fallbackTriggered: true, blocked: true });
```
Sau khi tạo `aiAnswer`: `await recordUsageForBot(bot);`

- [ ] **Step 4: tsc + build + commit**
Run: `npx tsc --noEmit -p tsconfig.json` → OK; `npm run build`.
```bash
git add server.ts
git commit -m "feat(billing): enforce usage gate + record on Telegram/Facebook/Botpress"
```

---

### Task 5: Wire vào Zalo (qua deps)

**Files:** Modify `zaloGroupBot/types.ts`, `zaloGroupBot/client.ts`, `zaloGroupBot/handler.ts`, `zaloGroupBot/__tests__/handler.test.ts`

**Interfaces:**
- Consumes: `checkUsageGate`, `recordUsageForBot` từ server.
- Produces: `ZaloDeps.checkUsage`, `ZaloDeps.recordUsage`, `ZaloDeps.blockMessage`.

- [ ] **Step 1: Mở rộng ZaloDeps (types.ts)**
```ts
checkUsage: (bot: BotConfig) => Promise<{ allowed: boolean }>;
recordUsage: (bot: BotConfig) => Promise<void>;
blockMessage: string;
```

- [ ] **Step 2: Test trước (handler.test.ts)** — thêm vào baseDeps:
```ts
checkUsage: async () => ({ allowed: true }),
recordUsage: async () => {},
blockMessage: "het han muc",
```
Thêm 2 test:
```ts
it("chan khi het han muc: khong goi RAG, gui block message", async () => {
  const ragSpy = vi.fn();
  const { deps, sent } = baseDeps({ checkUsage: async () => ({ allowed: false }), generateRAGAnswer: ragSpy as any });
  const h = createZaloMessageHandler(deps);
  const r = await h(ev({}));
  expect(ragSpy).not.toHaveBeenCalled();
  expect(sent).toEqual(["het han muc"]);
  expect(r.replied).toBe(false);
});
it("record usage sau khi tra loi thanh cong", async () => {
  const rec = vi.fn();
  const { deps } = baseDeps({ recordUsage: rec as any });
  const h = createZaloMessageHandler(deps);
  await h(ev({}));
  expect(rec).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3: Chạy test (đỏ).**

- [ ] **Step 4: Sửa handler.ts** — sau khi qua các cổng mention/binding/rate, TRƯỚC `deps.sendTyping`/`generateRAGAnswer`:
```ts
const gate = await deps.checkUsage(bot);
if (!gate.allowed) {
  await deps.send(event.groupId, deps.blockMessage);
  return { replied: false, reason: "usage_blocked" };
}
```
Và NGAY SAU `const sentId = await deps.send(...)` (gửi câu trả lời thành công): `await deps.recordUsage(bot);`

- [ ] **Step 5: client.ts buildDeps** — thêm:
```ts
checkUsage: injected.checkUsage,
recordUsage: injected.recordUsage,
blockMessage: BLOCK_MESSAGE_ZALO,  // hằng chuỗi, hoặc nhận từ injected
```
Và `InjectedDeps` + `initZaloGroupBot` truyền `checkUsage`/`recordUsage` từ server (server bọc `checkUsageGate`/`recordUsageForBot`). Cập nhật chỗ gọi `initZaloGroupBot` ở server.ts để truyền 2 hàm này + `blockMessage`.

- [ ] **Step 6: Chạy test (xanh) + tsc.**
Run: `npx vitest run` → tất cả pass; `npx tsc --noEmit -p tsconfig.json` → OK.

- [ ] **Step 7: Commit**
```bash
git add zaloGroupBot/ server.ts
git commit -m "feat(billing): enforce usage gate + record in Zalo group bot"
```

---

### Task 6: Endpoint usage khách + UI

**Files:** Modify `server.ts`, `src/App.tsx`

- [ ] **Step 1: Endpoint `GET /api/usage/me` (server.ts)**
```ts
app.get("/api/usage/me", async (req, res) => {
  const ownerKey = (req.query.userId as string) || "";
  if (!ownerKey) return res.json({ count: 0, limit: 0, tier: "free", verdict: "ok" });
  const limit = resolveLimitForOwner(ownerKey, saasCustomers);
  const count = await dbGetUsage(ownerKey, currentYearMonth());
  const cust = saasCustomers.find(c => c.id === ownerKey || c.email?.toLowerCase() === ownerKey.toLowerCase());
  res.json({ count, limit, tier: cust?.tier || "free", verdict: usageVerdict(count, limit), yearMonth: currentYearMonth() });
});
```

- [ ] **Step 2: UI thẻ usage (App.tsx)** — gọi `/api/usage/me?userId=<currentUserId>` khi load, render thanh tiến trình `count/limit`, màu vàng khi verdict=warn, đỏ khi blocked; nút "Nâng gói" mở popup text **thông tin chuyển khoản + liên hệ** (nội dung tĩnh, owner tự sửa sau).

- [ ] **Step 3: tsc + build + commit**
```bash
git add server.ts src/App.tsx
git commit -m "feat(billing): customer usage endpoint + usage card UI"
```

---

### Task 7: Admin CRM hiển thị usage

**Files:** Modify `server.ts`, `src/App.tsx`

- [ ] **Step 1: Mở rộng `GET /api/admin/customers`** — sau khi dựng `finalCustomers`, nạp `const usage = await dbGetUsageBulk(currentYearMonth());` và gắn `usageThisMonth: usage[c.id] ?? usage[c.email] ?? 0` cho mỗi khách.

- [ ] **Step 2: UI CRM (App.tsx)** — thêm cột "Dùng tháng này" hiển thị `usageThisMonth / messageLimit`.

- [ ] **Step 3: tsc + build + commit**
```bash
git add server.ts src/App.tsx
git commit -m "feat(billing): show monthly usage per customer in admin CRM"
```

---

### Task 8: Deploy

- [ ] **Step 1:** `npx tsc --noEmit -p tsconfig.json` && `npx vitest run` (tất cả pass) && `npm run build`.
- [ ] **Step 2:** `git push origin main` (Railway auto-deploy backend).
- [ ] **Step 3:** `npx wrangler pages deploy dist --project-name=aaa-balabot --branch=main --commit-dirty=true` (frontend).
- [ ] **Step 4:** User chạy `usageCounters.sql` trong Supabase SQL Editor.
- [ ] **Step 5:** Verify: live frontend hash khớp dist; `/api/usage/me` trả JSON.

## Self-Review
- Spec coverage: gói/hạn mức (T1), DB (T2), attribution+gate+record (T3), enforce 4 kênh (T4,T5), UI khách (T6), CRM admin (T7), deploy+migration (T8). Đủ.
- Type nhất quán: `usageVerdict` trả `'ok'|'warn'|'blocked'` dùng thống nhất; `ownerKey=bot.userId` xuyên suốt; `resolveLimitForOwner` dùng `saasCustomers` + `PLAN_LIMITS`.
- Không placeholder: mọi step có code/lệnh cụ thể.
- Phụ thuộc: T1→T2→T3→(T4,T5)→(T6,T7)→T8.
