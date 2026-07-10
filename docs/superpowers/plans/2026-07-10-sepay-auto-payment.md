# SePay Auto Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khách chọn gói → quét QR SePay → webhook về → gói tự kích hoạt 30/360 ngày, không cần admin.

**Architecture:** Module thuần `payments/sepay.ts` (giá, mã đơn, QR, verify, expiry) + bảng `payment_orders`/`payment_unmatched` ở DB gốc (root client) + 4 endpoint trong server.ts + modal Nâng gói 3 bước trong App.tsx. Spec: `docs/superpowers/specs/2026-07-10-sepay-auto-payment-design.md`.

**Tech Stack:** Express (server.ts monolith), Supabase root client (sẵn có `getRootSupabaseClient`), Vitest, React (App.tsx), SePay webhook + qr.sepay.vn.

## Global Constraints

- Giá tháng VND: `starter: 249000, pro: 649000`; năm = `Math.round(base * 12 * 0.8 / 1000) * 1000` (Starter năm 2390000, Pro năm 6230000).
- Mã đơn: `"BLB"` + 8 ký tự từ bảng `ABCDEFGHJKMNPQRSTUVWXYZ23456789`; trích bằng `/BLB[A-Z0-9]{8}/` trên chuỗi đã uppercase.
- QR: `https://qr.sepay.vn/img?acc={account}&bank={bank}&amount={amount}&des={orderCode}` (encodeURIComponent từng tham số).
- Webhook auth header: `Authorization: Apikey <key>` (prefix case-insensitive), so sánh timing-safe. Sai/thiếu → 401.
- Webhook semantics: mọi tình huống "bỏ qua có chủ đích" trả 200 `{success:true}`; CHỈ lỗi khi ghi profiles (kích hoạt) trả 500 để SePay retry.
- Hạn đơn 24h (lazy expire khi GET); đơn expired mà tiền về đủ → VẪN kích hoạt.
- Kích hoạt: cùng tier → `max(now, hạn cũ) + months*30 ngày`; khác tier/hết hạn/chưa có → `now + months*30 ngày`. `message_limit = PLAN_LIMITS[tier].messages`.
- Idempotent: đơn `paid` bỏ qua; `sepay_tx_id` đã dùng ở bất kỳ đơn paid nào bỏ qua.
- Rate-limit tạo đơn: 5 đơn/phút/IP. Poll UI: 4000ms. tier ∉ {starter,pro} hoặc months ∉ {1,12} → 400.
- Env: `SEPAY_WEBHOOK_KEY`, `SEPAY_BANK_ACCOUNT`, `SEPAY_BANK_CODE`, `SEPAY_ACCOUNT_NAME`, tùy chọn `OWNER_NOTIFY_TELEGRAM_TOKEN`/`OWNER_NOTIFY_TELEGRAM_CHAT_ID`, `PAYMENT_TEST_MODE` (bật mới cho amountOverride).
- Bảng payment_* CHỈ đọc/ghi qua root client (`getRootSupabaseClient`) — không theo BYO scope, không cache RAM làm nguồn sự thật.
- Copy tiếng Việt lịch sự; không log/lộ SEPAY_WEBHOOK_KEY.
- Sau mỗi task: `npx tsc --noEmit` sạch + `npx vitest run` xanh toàn bộ (hiện 142 test). Commit thẳng main. KHÔNG push/deploy trong task — controller làm cuối.

---

### Task 1: Module thuần `payments/sepay.ts` (TDD)

**Files:**
- Create: `payments/sepay.ts`
- Test: `payments/__tests__/sepay.test.ts`

**Interfaces:**
- Consumes: `node:crypto` (timingSafeEqual, randomInt).
- Produces (Task 3/4 dùng):
  - `PLAN_PRICES: Record<"starter"|"pro", number>`
  - `computeOrderAmount(tier: "starter"|"pro", months: 1|12): number`
  - `generateOrderCode(): string`
  - `extractOrderCode(content: string): string | null`
  - `buildSepayQrUrl(opts: { account: string; bank: string; amount: number; orderCode: string }): string`
  - `verifySepayApiKey(authorizationHeader: string | undefined, expectedKey: string): boolean`
  - `resolveNewExpiry(opts: { currentTier?: string | null; currentExpiresAt?: string | null; newTier: string; months: number; now?: Date }): string` (ISO)
  - `parseSepayWebhook(body: unknown): { txId: string; amount: number; content: string; isIncoming: boolean } | null`

- [ ] **Step 1: Viết test trước** — file `payments/__tests__/sepay.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  PLAN_PRICES, computeOrderAmount, generateOrderCode, extractOrderCode,
  buildSepayQrUrl, verifySepayApiKey, resolveNewExpiry, parseSepayWebhook,
} from "../sepay.js";

describe("computeOrderAmount", () => {
  it("thang nguyen gia", () => {
    expect(computeOrderAmount("starter", 1)).toBe(249000);
    expect(computeOrderAmount("pro", 1)).toBe(649000);
  });
  it("nam giam 20% lam tron nghin", () => {
    expect(computeOrderAmount("starter", 12)).toBe(2390000);
    expect(computeOrderAmount("pro", 12)).toBe(6230000);
  });
});

describe("generateOrderCode", () => {
  it("format BLB + 8 ky tu khong nham lan (khong I/L/O/0/1)", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOrderCode();
      expect(code).toMatch(/^BLB[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });
  it("hai lan sinh khac nhau (xac suat)", () => {
    expect(generateOrderCode()).not.toBe(generateOrderCode());
  });
});

describe("extractOrderCode", () => {
  it("tim thay ma trong noi dung ngan hang thuc te (hoa/thuong/dinh chu)", () => {
    expect(extractOrderCode("BLBK7M2P4Q9X")).toBe("BLBK7M2P4Q9X");
    expect(extractOrderCode("chuyen tien blbk7m2p4q9x thanh toan")).toBe("BLBK7M2P4Q9X");
    expect(extractOrderCode("MBVCB.123.BLBK7M2P4Q9X.CT tu 090")).toBe("BLBK7M2P4Q9X");
  });
  it("khong co ma -> null", () => {
    expect(extractOrderCode("chuyen khoan an trua")).toBeNull();
    expect(extractOrderCode("")).toBeNull();
    expect(extractOrderCode("BLB123")).toBeNull(); // thieu ky tu
  });
});

describe("buildSepayQrUrl", () => {
  it("dung host + encode tham so", () => {
    const url = buildSepayQrUrl({ account: "0011002 233", bank: "VPBank", amount: 249000, orderCode: "BLBK7M2P4Q9X" });
    expect(url).toBe("https://qr.sepay.vn/img?acc=0011002%20233&bank=VPBank&amount=249000&des=BLBK7M2P4Q9X");
  });
});

describe("verifySepayApiKey", () => {
  it("dung key + prefix Apikey moi qua (case-insensitive prefix)", () => {
    expect(verifySepayApiKey("Apikey secret123", "secret123")).toBe(true);
    expect(verifySepayApiKey("apikey secret123", "secret123")).toBe(true);
    expect(verifySepayApiKey("APIKEY secret123", "secret123")).toBe(true);
  });
  it("sai key / thieu header / thieu prefix / key rong -> false", () => {
    expect(verifySepayApiKey("Apikey wrong", "secret123")).toBe(false);
    expect(verifySepayApiKey(undefined, "secret123")).toBe(false);
    expect(verifySepayApiKey("Bearer secret123", "secret123")).toBe(false);
    expect(verifySepayApiKey("Apikey secret123", "")).toBe(false);
  });
});

describe("resolveNewExpiry", () => {
  const now = new Date("2026-07-10T00:00:00.000Z");
  const D = 24 * 60 * 60 * 1000;
  it("cung tier con han -> cong noi tu han cu", () => {
    const oldExp = new Date(now.getTime() + 10 * D).toISOString();
    const out = resolveNewExpiry({ currentTier: "starter", currentExpiresAt: oldExp, newTier: "starter", months: 1, now });
    expect(out).toBe(new Date(now.getTime() + 40 * D).toISOString());
  });
  it("cung tier HET han -> 30 ngay tu bay gio", () => {
    const oldExp = new Date(now.getTime() - 5 * D).toISOString();
    const out = resolveNewExpiry({ currentTier: "starter", currentExpiresAt: oldExp, newTier: "starter", months: 1, now });
    expect(out).toBe(new Date(now.getTime() + 30 * D).toISOString());
  });
  it("khac tier con han -> 30 ngay tu bay gio (khong cong noi)", () => {
    const oldExp = new Date(now.getTime() + 10 * D).toISOString();
    const out = resolveNewExpiry({ currentTier: "starter", currentExpiresAt: oldExp, newTier: "pro", months: 1, now });
    expect(out).toBe(new Date(now.getTime() + 30 * D).toISOString());
  });
  it("chua co goi + nam -> 360 ngay", () => {
    const out = resolveNewExpiry({ currentTier: null, currentExpiresAt: null, newTier: "pro", months: 12, now });
    expect(out).toBe(new Date(now.getTime() + 360 * D).toISOString());
  });
});

describe("parseSepayWebhook", () => {
  it("payload chuan SePay tien VAO", () => {
    const out = parseSepayWebhook({
      id: 92704, gateway: "Vietcombank", transactionDate: "2026-07-10 10:00:00",
      accountNumber: "0011002233", content: "BLBK7M2P4Q9X", transferType: "in",
      transferAmount: 249000, accumulated: 19077000, referenceCode: "MBVCB.123",
    });
    expect(out).toEqual({ txId: "92704", amount: 249000, content: "BLBK7M2P4Q9X", isIncoming: true });
  });
  it("tien RA -> isIncoming false", () => {
    const out = parseSepayWebhook({ id: 1, transferType: "out", transferAmount: 5000, content: "x" });
    expect(out?.isIncoming).toBe(false);
  });
  it("thieu id hoac amount -> null; body rac -> null", () => {
    expect(parseSepayWebhook({ transferType: "in", content: "x" })).toBeNull();
    expect(parseSepayWebhook(null)).toBeNull();
    expect(parseSepayWebhook("string")).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy FAIL** — `npx vitest run payments` → "Cannot find module '../sepay.js'".

- [ ] **Step 3: Viết `payments/sepay.ts`**

```ts
// Logic thuần cho thanh toán SePay — không side effect, test độc lập.
import crypto from "node:crypto";

export const PLAN_PRICES: Record<"starter" | "pro", number> = {
  starter: 249000,
  pro: 649000,
};

export function computeOrderAmount(tier: "starter" | "pro", months: 1 | 12): number {
  const base = PLAN_PRICES[tier];
  if (months === 12) return Math.round((base * 12 * 0.8) / 1000) * 1000; // tra nam -20%, tron nghin
  return base;
}

// Bo I/L/O/0/1 de song sot viec ngan hang viet hoa/doc nham noi dung CK.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateOrderCode(): string {
  let s = "BLB";
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return s;
}

// Regex RONG hon bang sinh ma co chu dich: ma sinh ra luon khop; chuoi la khop
// nham chi dan toi "khong tim thay don" -> roi vao giao dich lac, vo hai.
export function extractOrderCode(content: string): string | null {
  const m = String(content || "").toUpperCase().match(/BLB[A-Z0-9]{8}/);
  return m ? m[0] : null;
}

export function buildSepayQrUrl(opts: { account: string; bank: string; amount: number; orderCode: string }): string {
  return `https://qr.sepay.vn/img?acc=${encodeURIComponent(opts.account)}&bank=${encodeURIComponent(opts.bank)}&amount=${encodeURIComponent(String(opts.amount))}&des=${encodeURIComponent(opts.orderCode)}`;
}

export function verifySepayApiKey(authorizationHeader: string | undefined, expectedKey: string): boolean {
  if (!authorizationHeader || !expectedKey) return false;
  const m = authorizationHeader.match(/^apikey\s+(.+)$/i);
  if (!m) return false;
  const given = Buffer.from(m[1].trim());
  const expected = Buffer.from(expectedKey);
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(given, expected);
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Cung tier con han -> cong noi tu han cu; con lai -> tinh tu bay gio.
export function resolveNewExpiry(opts: {
  currentTier?: string | null;
  currentExpiresAt?: string | null;
  newTier: string;
  months: number;
  now?: Date;
}): string {
  const now = opts.now ? opts.now.getTime() : Date.now();
  let base = now;
  if (opts.currentTier === opts.newTier && opts.currentExpiresAt) {
    const oldExp = new Date(opts.currentExpiresAt).getTime();
    if (!Number.isNaN(oldExp) && oldExp > now) base = oldExp;
  }
  return new Date(base + opts.months * 30 * DAY_MS).toISOString();
}

export function parseSepayWebhook(body: unknown): { txId: string; amount: number; content: string; isIncoming: boolean } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.id === undefined || b.id === null) return null;
  const amount = Number(b.transferAmount);
  if (!Number.isFinite(amount)) return null;
  return {
    txId: String(b.id),
    amount,
    content: String(b.content ?? ""),
    isIncoming: String(b.transferType ?? "") === "in",
  };
}
```

- [ ] **Step 4: Vitest config** — kiểm `vitest.config.ts` include có pattern bao `payments/__tests__` chưa (hiện có `__tests__/**` và `widget/**`); nếu thiếu, thêm `"payments/**/*.test.ts"` vào mảng include (thay đổi 1 dòng, được phép).

- [ ] **Step 5: Chạy PASS** — `npx vitest run payments` xanh; `npx tsc --noEmit` sạch; `npx vitest run` toàn repo xanh.

- [ ] **Step 6: Commit**

```bash
git add payments/ vitest.config.ts
git commit -m "feat(payments): module thuần SePay - giá/mã đơn/QR/verify/expiry/parse webhook"
```

---

### Task 2: Bảng payment + CRUD root trong supabaseService.ts

**Files:**
- Create: `payments.sql`
- Modify: `supabaseService.ts` (cuối file, trước phần LEADS hoặc cuối cùng đều được — thêm section mới)

**Interfaces:**
- Consumes: `getRootSupabaseClient()` (sẵn có trong supabaseService.ts).
- Produces (Task 3 dùng):
  - `interface PaymentOrder { id: string; user_id: string; email?: string | null; tier: string; months: number; amount: number; status: "pending"|"paid"|"expired"; sepay_tx_id?: string | null; created_at?: string; paid_at?: string | null }`
  - `dbCreatePaymentOrder(order: PaymentOrder): Promise<boolean>`
  - `dbGetPaymentOrder(id: string): Promise<PaymentOrder | null>`
  - `dbUpdatePaymentOrder(id: string, updates: Partial<PaymentOrder>): Promise<boolean>`
  - `dbFindOrderBySepayTx(txId: string): Promise<PaymentOrder | null>`
  - `dbAddUnmatchedPayment(row: { id: string; amount: number; content: string }): Promise<boolean>`
  - `dbGetUnmatchedPayments(limit?: number): Promise<Array<{ id: string; amount: number; content: string; received_at: string }>>`

- [ ] **Step 1: Tạo `payments.sql`** (chạy tay trên DB GỐC)

```sql
-- Chạy tay trên Supabase SQL Editor của DB GỐC (owner).
-- Thanh toán tự động SePay: đơn hàng + giao dịch tiền vào không khớp đơn.
create table if not exists payment_orders (
  id text primary key,                     -- orderCode BLBXXXXXXXX
  user_id text not null,
  email text,
  tier text not null,                      -- starter | pro
  months integer not null default 1,       -- 1 | 12
  amount bigint not null,                  -- VND
  status text not null default 'pending',  -- pending | paid | expired
  sepay_tx_id text,
  created_at timestamptz default now(),
  paid_at timestamptz
);
create index if not exists payment_orders_user_idx on payment_orders (user_id, created_at desc);
create index if not exists payment_orders_tx_idx on payment_orders (sepay_tx_id);

create table if not exists payment_unmatched (
  id text primary key,                     -- sepay tx id
  amount bigint,
  content text,
  received_at timestamptz default now()
);
```

- [ ] **Step 2: Thêm section vào `supabaseService.ts`** (đúng chữ ký ở Interfaces):

```ts
// ================= PAYMENT ORDERS (SePay — dữ liệu NỀN TẢNG, luôn root client) =================
export interface PaymentOrder {
  id: string;
  user_id: string;
  email?: string | null;
  tier: string;
  months: number;
  amount: number;
  status: "pending" | "paid" | "expired";
  sepay_tx_id?: string | null;
  created_at?: string;
  paid_at?: string | null;
}

export async function dbCreatePaymentOrder(order: PaymentOrder): Promise<boolean> {
  const client = getRootSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from("payment_orders").insert(order);
    if (error) { console.warn("dbCreatePaymentOrder:", error.message); return false; }
    return true;
  } catch (e: any) { console.warn("dbCreatePaymentOrder failed:", e?.message || e); return false; }
}

export async function dbGetPaymentOrder(id: string): Promise<PaymentOrder | null> {
  const client = getRootSupabaseClient();
  if (!client || !id) return null;
  try {
    const { data, error } = await client.from("payment_orders").select("*").eq("id", id).maybeSingle();
    if (error || !data) return null;
    return data as PaymentOrder;
  } catch { return null; }
}

export async function dbUpdatePaymentOrder(id: string, updates: Partial<PaymentOrder>): Promise<boolean> {
  const client = getRootSupabaseClient();
  if (!client || !id) return false;
  try {
    const { error } = await client.from("payment_orders").update(updates).eq("id", id);
    if (error) { console.warn("dbUpdatePaymentOrder:", error.message); return false; }
    return true;
  } catch (e: any) { console.warn("dbUpdatePaymentOrder failed:", e?.message || e); return false; }
}

export async function dbFindOrderBySepayTx(txId: string): Promise<PaymentOrder | null> {
  const client = getRootSupabaseClient();
  if (!client || !txId) return null;
  try {
    const { data, error } = await client.from("payment_orders").select("*").eq("sepay_tx_id", txId).limit(1);
    if (error || !data || data.length === 0) return null;
    return data[0] as PaymentOrder;
  } catch { return null; }
}

export async function dbAddUnmatchedPayment(row: { id: string; amount: number; content: string }): Promise<boolean> {
  const client = getRootSupabaseClient();
  if (!client) return false;
  try {
    // upsert theo id: SePay retry cùng giao dịch không tạo dòng trùng
    const { error } = await client.from("payment_unmatched").upsert(row, { onConflict: "id" });
    if (error) { console.warn("dbAddUnmatchedPayment:", error.message); return false; }
    return true;
  } catch (e: any) { console.warn("dbAddUnmatchedPayment failed:", e?.message || e); return false; }
}

export async function dbGetUnmatchedPayments(limit = 50): Promise<Array<{ id: string; amount: number; content: string; received_at: string }>> {
  const client = getRootSupabaseClient();
  if (!client) return [];
  try {
    const { data, error } = await client.from("payment_unmatched").select("*").order("received_at", { ascending: false }).limit(limit);
    if (error || !data) return [];
    return data as any;
  } catch { return []; }
}
```

- [ ] **Step 3: Kiểm tra** — `npx tsc --noEmit` sạch; `npx vitest run` xanh (không test mới — hàm DB thuần passthrough, pattern dự án không unit-test tầng này).

- [ ] **Step 4: Commit**

```bash
git add payments.sql supabaseService.ts
git commit -m "feat(payments): bảng payment_orders/unmatched + CRUD root client"
```

---

### Task 3: Endpoints server — tạo đơn, tra đơn, webhook SePay, admin unmatched

**Files:**
- Modify: `server.ts`

**Interfaces:**
- Consumes: Task 1 (`computeOrderAmount, generateOrderCode, extractOrderCode, buildSepayQrUrl, verifySepayApiKey, resolveNewExpiry, parseSepayWebhook`), Task 2 (CRUD + `PaymentOrder`), sẵn có: `PLAN_LIMITS` (import từ `./billing.js` — đã import), `dbGetProfilePlan`, `dbUpdateProfilePlan`, `requireOwnerAdmin`, `readJsonFile` KHÔNG dùng cho payment.
- Produces (Task 4 dùng): 
  - `POST /api/payments/orders` body `{tier, months, userId, email}` → `{orderId, amount, qrUrl, bankAccount, bankName, accountName, transferContent, expiresInHours}`
  - `GET /api/payments/orders/:orderId` → `{status, tier, months, amount, paidAt}`
  - `POST /api/payments/sepay-webhook`; `GET /api/admin/payments/unmatched` → `{items: [...]}`

- [ ] **Step 1: Import** — thêm vào khối import server.ts:

```ts
import { computeOrderAmount, generateOrderCode, extractOrderCode, buildSepayQrUrl, verifySepayApiKey, resolveNewExpiry, parseSepayWebhook } from "./payments/sepay.js";
```
và bổ sung vào import từ `./supabaseService.js`: `dbCreatePaymentOrder, dbGetPaymentOrder, dbUpdatePaymentOrder, dbFindOrderBySepayTx, dbAddUnmatchedPayment, dbGetUnmatchedPayments` (+ type `PaymentOrder` qua `import type` nếu cần).

- [ ] **Step 2: Block endpoints** — đặt NGAY SAU block widget public (sau handler `app.post("/api/widget/:botId/chat", ...)`), nguyên văn:

```ts
// ===== THANH TOÁN TỰ ĐỘNG QUA SEPAY =====
const SEPAY_ENV = () => ({
  webhookKey: (process.env.SEPAY_WEBHOOK_KEY || "").trim(),
  bankAccount: (process.env.SEPAY_BANK_ACCOUNT || "").trim(),
  bankCode: (process.env.SEPAY_BANK_CODE || "").trim(),
  accountName: (process.env.SEPAY_ACCOUNT_NAME || "").trim(),
});
const ORDER_TTL_MS = 24 * 60 * 60 * 1000;

const paymentRate = new Map<string, { n: number; reset: number }>();
function paymentAllow(ip: string): boolean {
  const now = Date.now();
  const r = paymentRate.get(ip);
  if (!r || now > r.reset) { paymentRate.set(ip, { n: 1, reset: now + 60_000 }); return true; }
  r.n += 1;
  return r.n <= 5;
}

// Báo Telegram cho owner (env riêng, thiếu env thì bỏ qua — không chặn kích hoạt).
async function notifyOwnerPayment(text: string): Promise<void> {
  const token = (process.env.OWNER_NOTIFY_TELEGRAM_TOKEN || "").trim();
  const chatId = (process.env.OWNER_NOTIFY_TELEGRAM_CHAT_ID || "").trim();
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (e: any) { console.warn("[Payment] notifyOwner lỗi:", e?.message || e); }
}

app.post("/api/payments/orders", async (req, res) => {
  const ip = ((req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?") as string).toString().split(",")[0].trim();
  if (!paymentAllow(ip)) return res.status(429).json({ error: "Anh/chị thao tác hơi nhanh, chờ chút rồi thử lại nhé." });

  const { tier, months, userId, email, amountOverride } = req.body || {};
  if (tier !== "starter" && tier !== "pro") return res.status(400).json({ error: "Gói không hợp lệ." });
  if (months !== 1 && months !== 12) return res.status(400).json({ error: "Chu kỳ không hợp lệ." });
  const uid = String(userId || "").trim();
  if (!uid) return res.status(400).json({ error: "Vui lòng đăng nhập để nâng gói." });

  const env = SEPAY_ENV();
  if (!env.bankAccount || !env.bankCode) {
    return res.status(503).json({ error: "Thanh toán tự động đang bảo trì — vui lòng liên hệ ox102.crypto@gmail.com để được kích hoạt thủ công." });
  }

  // PAYMENT_TEST_MODE=1 cho phép ép số tiền nhỏ để owner UAT bằng tiền thật; tắt env là hết đường.
  let amount = computeOrderAmount(tier, months);
  if (process.env.PAYMENT_TEST_MODE === "1" && Number(amountOverride) >= 1000) {
    amount = Math.floor(Number(amountOverride));
  }

  const order: PaymentOrder = {
    id: generateOrderCode(),
    user_id: uid,
    email: String(email || "").trim().toLowerCase() || null,
    tier, months, amount, status: "pending",
  };
  const ok = await dbCreatePaymentOrder(order);
  if (!ok) return res.status(500).json({ error: "Không tạo được đơn — thử lại sau ít phút nhé." });

  res.status(201).json({
    orderId: order.id,
    amount,
    qrUrl: buildSepayQrUrl({ account: env.bankAccount, bank: env.bankCode, amount, orderCode: order.id }),
    bankAccount: env.bankAccount,
    bankName: env.bankCode,
    accountName: env.accountName,
    transferContent: order.id,
    expiresInHours: 24,
  });
});

app.get("/api/payments/orders/:orderId", async (req, res) => {
  const order = await dbGetPaymentOrder(String(req.params.orderId || "").toUpperCase());
  if (!order) return res.status(404).json({ error: "Không tìm thấy đơn." });
  if (order.status === "pending" && order.created_at && Date.now() - new Date(order.created_at).getTime() > ORDER_TTL_MS) {
    order.status = "expired";
    void dbUpdatePaymentOrder(order.id, { status: "expired" });
  }
  res.json({ status: order.status, tier: order.tier, months: order.months, amount: order.amount, paidAt: order.paid_at || null });
});

app.post("/api/payments/sepay-webhook", async (req, res) => {
  const env = SEPAY_ENV();
  if (!verifySepayApiKey(req.headers.authorization as string | undefined, env.webhookKey)) {
    return res.status(401).json({ success: false });
  }
  try {
    const tx = parseSepayWebhook(req.body);
    if (!tx || !tx.isIncoming) return res.json({ success: true }); // tiền ra / payload lạ: bỏ qua có chủ đích

    // Idempotent lớp 1: giao dịch này đã kích hoạt một đơn nào đó rồi
    const already = await dbFindOrderBySepayTx(tx.txId);
    if (already) return res.json({ success: true });

    const code = extractOrderCode(tx.content);
    const order = code ? await dbGetPaymentOrder(code) : null;
    if (!order) {
      await dbAddUnmatchedPayment({ id: tx.txId, amount: tx.amount, content: tx.content.slice(0, 500) });
      void notifyOwnerPayment(`⚠️ Tiền vào KHÔNG khớp đơn: ${tx.amount.toLocaleString("vi-VN")}đ — "${tx.content.slice(0, 120)}"`);
      return res.json({ success: true });
    }
    if (order.status === "paid") return res.json({ success: true }); // idempotent lớp 2

    if (tx.amount < order.amount) {
      await dbAddUnmatchedPayment({ id: tx.txId, amount: tx.amount, content: `CHUYỂN THIẾU cho đơn ${order.id} (cần ${order.amount}): ${tx.content.slice(0, 400)}` });
      void notifyOwnerPayment(`⚠️ Chuyển THIẾU tiền đơn ${order.id}: nhận ${tx.amount.toLocaleString("vi-VN")}đ / cần ${order.amount.toLocaleString("vi-VN")}đ (${order.email || order.user_id})`);
      return res.json({ success: true });
    }

    // Kích hoạt gói — bước không được rơi: lỗi thì 500 để SePay retry.
    const profile = await dbGetProfilePlan(order.user_id);
    const expiry = resolveNewExpiry({
      currentTier: profile?.tier || null,
      currentExpiresAt: profile?.plan_expires_at || null,
      newTier: order.tier,
      months: order.months,
    });
    const limit = PLAN_LIMITS[order.tier as "starter" | "pro"].messages;
    const saved = await dbUpdateProfilePlan(order.user_id, order.email || "", order.tier, limit, expiry);
    if (!saved) {
      console.error(`[Payment] KHÔNG ghi được profiles cho đơn ${order.id} — trả 500 để SePay retry`);
      return res.status(500).json({ success: false });
    }
    await dbUpdatePaymentOrder(order.id, { status: "paid", paid_at: new Date().toISOString(), sepay_tx_id: tx.txId });
    void notifyOwnerPayment(`💰 ĐƠN MỚI: ${order.email || order.user_id} • ${order.tier.toUpperCase()} ${order.months} tháng • ${order.amount.toLocaleString("vi-VN")}đ • hạn mới ${new Date(expiry).toLocaleDateString("vi-VN")}`);
    console.log(`[Payment] Kích hoạt ${order.tier} cho ${order.user_id} tới ${expiry} (đơn ${order.id})`);
    res.json({ success: true });
  } catch (e: any) {
    console.error("[Payment] webhook lỗi bất ngờ:", e?.message || e);
    res.json({ success: true }); // lỗi ngoài bước kích hoạt: nuốt để không bão retry
  }
});

app.get("/api/admin/payments/unmatched", async (req, res) => {
  if (!requireOwnerAdmin(req, res)) return;
  res.json({ items: await dbGetUnmatchedPayments(50) });
});
```

LƯU Ý thứ tự try/catch: hai lệnh `dbUpdateProfilePlan` (kích hoạt) + kiểm `saved` nằm TRONG try nhưng nhánh `!saved` return 500 TRƯỚC khi rơi xuống catch — đúng semantics "chỉ lỗi kích hoạt mới 500".

- [ ] **Step 3: Kiểm tra** — `npx tsc --noEmit` sạch; `npx vitest run` xanh. Smoke tĩnh: đọc lại diff, xác nhận (1) webhook không nằm dưới middleware chủ-sở-hữu bot (path /api/payments không match /api/bots — đúng), (2) không log webhookKey.

- [ ] **Step 4: Commit**

```bash
git add server.ts
git commit -m "feat(payments): endpoints tạo đơn/tra đơn/webhook SePay/admin unmatched"
```

---

### Task 4: Modal "Nâng gói" 3 bước (App.tsx)

**Files:**
- Modify: `src/App.tsx` (thay nội dung modal `showUpgrade` hiện tại ở ~dòng 2602-2617 — modal chuyển khoản tay có placeholder "[Tên ngân hàng]")

**Interfaces:**
- Consumes: Task 3 endpoints. Fetch interceptor sẵn có tự đính header; `sbUser` (user đăng nhập: `.id`, `.email`); `usage` state + effect nạp `/api/usage/me` sẵn có (deps `[sbUser?.id, activeTab]`).

**Hành vi bắt buộc:**
1. State mới (cạnh `showUpgrade`): `upgradeTier ('starter'|'pro')`, `upgradeMonths (1|12)`, `upgradeOrder (null | {orderId, amount, qrUrl, bankAccount, bankName, accountName, transferContent})`, `upgradeStatus ('choosing'|'waiting'|'paid')`, `upgradeErr (string)`, `upgradeCopied (boolean)`.
2. **Bước chọn gói** (`upgradeStatus === 'choosing'`): 2 thẻ Starter (249.000đ/tháng — 3.000 tin, 3 bot, đủ kênh) và Pro (649.000đ/tháng — 10.000 tin, 10 bot, Supabase riêng, white-label) chọn được (border emerald khi chọn); toggle Tháng / Năm -20% (năm hiện "2.390.000đ/năm" / "6.230.000đ/năm" — lấy giá từ response server sau, hiển thị tạm phép tính `Math.round(base*12*0.8/1000)*1000`); dòng "Cần Enterprise? Liên hệ ox102.crypto@gmail.com"; nút "Tạo mã thanh toán" → POST `/api/payments/orders` body `{tier: upgradeTier, months: upgradeMonths, userId: sbUser?.id, email: sbUser?.email}` → ok: set `upgradeOrder`, `upgradeStatus='waiting'`; lỗi: `upgradeErr = data.error`.
3. **Bước thanh toán** (`'waiting'`): ảnh `<img src={upgradeOrder.qrUrl}>` (~220px, border), số tiền to đậm định dạng `toLocaleString('vi-VN')`đ, khối thông tin CK tay: Ngân hàng {bankName} • STK {bankAccount} • Chủ TK {accountName} • Nội dung **{transferContent}** kèm nút copy nội dung (đổi "✓" 2s); cảnh báo amber "Nếu nhập tay, PHẢI ghi đúng nội dung chuyển khoản"; dòng nhỏ "Đơn có hiệu lực 24 giờ — quét xong hệ thống tự kích hoạt trong ~1 phút"; **poll**: `useEffect` khi `upgradeStatus==='waiting' && upgradeOrder` → `setInterval` 4000ms GET `/api/payments/orders/${orderId}` → `status==='paid'` → `setUpgradeStatus('paid')` + gọi lại usage (fetch `/api/usage/me?userId=...&email=...` rồi `setUsage`); `status==='expired'` → `upgradeErr='Đơn đã hết hạn — tạo lại mã mới nhé.'` + về `'choosing'`; cleanup clearInterval khi unmount/đổi status/đóng modal. Nút phụ "Tôi đã chuyển nhưng chưa thấy xác nhận" → toggle khối hướng dẫn (chờ 1-2 phút; kiểm tra nội dung CK đúng mã; liên hệ ox102.crypto@gmail.com kèm mã đơn).
4. **Bước hoàn tất** (`'paid'`): "🎉 Gói {tier} đã kích hoạt!" + "Cảm ơn anh/chị đã tin dùng BalaBot" + nút Đóng (reset về `'choosing'`, `upgradeOrder=null`).
5. Đóng modal (X/backdrop) khi `'waiting'`: KHÔNG hủy đơn — chỉ đóng UI (đơn còn 24h); mở lại modal thì về bước chọn gói.
6. Style khớp dự án (nút emerald, thẻ `bg-white rounded-2xl`, text slate).
7. **Admin — khối "Giao dịch lạc"** (spec 3.6): trong tab admin (`activeTab === 'admin'`), thêm 1 thẻ đơn giản dưới bảng khách hàng: heading "⚠️ Giao dịch lạc (tiền vào không khớp đơn)"; state `unmatchedPayments` + effect fetch GET `/api/admin/payments/unmatched` khi mở tab admin (kèm `getScopedApiHeaders()`); bảng 4 cột: Mã GD • Số tiền (toLocaleString vi-VN + đ) • Nội dung CK • Lúc nhận (toLocaleString vi-VN); rỗng → dòng "Không có giao dịch lạc 🎉". Chỉ hiển thị — xử lý thì admin nâng tay bằng CRM như hiện tại.

- [ ] **Step 1: Thay modal + thêm state/effect như mô tả trên (gồm cả khối admin mục 7).** Giữ nguyên vị trí render (`{showUpgrade && (...)}`).
- [ ] **Step 2: Kiểm tra** — `npx tsc --noEmit` sạch; `npm run build` xanh; `npx vitest run` xanh.
- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(payments): modal nâng gói 3 bước - chọn gói, QR SePay, tự kích hoạt"
```

---

### Task 5 (controller, sau final review): Deploy + việc owner

- Push main (Railway) + `npx wrangler pages deploy dist --project-name=aaa-balabot --branch=main --commit-dirty=true`.
- Owner: đăng ký SePay + link bank + khai webhook `https://antiantiai.xyz/balabot/api/payments/sepay-webhook` với API key; chạy `payments.sql` trên DB gốc; set env `SEPAY_WEBHOOK_KEY/SEPAY_BANK_ACCOUNT/SEPAY_BANK_CODE/SEPAY_ACCOUNT_NAME` (+ tùy chọn `OWNER_NOTIFY_TELEGRAM_*`); UAT với `PAYMENT_TEST_MODE=1` (đơn 1.000đ) rồi TẮT.
- Cập nhật kiến thức trợ lý website sau khi UAT xong (thanh toán tự động trong dashboard).
