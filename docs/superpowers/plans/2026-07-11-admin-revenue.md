# Admin Revenue Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khối "💰 Doanh thu" trên cùng tab Quản trị: 3 thẻ tổng quan, biểu đồ 6 tháng, cơ cấu gói, 20 đơn gần nhất — từ `payment_orders` (đơn paid).

**Architecture:** Hàm thuần `computeRevenueSummary` trong `payments/sepay.ts` (test được múi giờ VN) + `dbGetPaidPaymentOrders` (root client) + endpoint admin + khối UI. Spec: `docs/superpowers/specs/2026-07-11-admin-revenue-design.md`.

**Tech Stack:** Express, Supabase root client, Vitest, React.

## Global Constraints

- Múi giờ VN: nhãn tháng qua `currentYearMonth(date)` (billing.ts). `monthly` đúng 6 phần tử cũ→mới, tháng trống = 0.
- `growthPct` = (this-last)/last*100 làm tròn 1 chữ số; lastMonth=0 → `null`.
- `byTier` chỉ đếm starter/pro (tier lạ vẫn vào totals); `monthly`/`yearly` trong byTier = SỐ ĐƠN theo months 1/12.
- `recent` = 20 đơn mới nhất theo paid_at desc.
- Endpoint `GET /api/admin/payments/revenue` khóa `requireOwnerAdmin`. UI fetch kèm `getScopedApiHeaders()`, lỗi → khối ẩn.
- Tiền hiển thị `toLocaleString('vi-VN') + 'đ'`. Sau mỗi task: tsc sạch + vitest xanh (hiện 159). Commit main. Deploy do controller cuối cùng.

---

### Task 1: `computeRevenueSummary` (TDD, payments/sepay.ts)

**Files:** Modify `payments/sepay.ts`; Test `payments/__tests__/sepay.test.ts` (append describe mới).

**Interfaces — Produces:**
```ts
export interface RevenueSummary {
  totals: { all: number; thisMonth: number; lastMonth: number; growthPct: number | null };
  monthly: Array<{ ym: string; total: number; orders: number }>;
  byTier: Record<"starter" | "pro", { orders: number; total: number; monthly: number; yearly: number }>;
  recent: Array<{ id: string; email: string | null; tier: string; months: number; amount: number; paidAt: string }>;
}
export function computeRevenueSummary(
  orders: Array<{ id: string; email?: string | null; tier: string; months: number; amount: number; paid_at?: string | null }>,
  now?: Date
): RevenueSummary
```

- [ ] **Step 1: Test trước** (append vào sepay.test.ts):

```ts
describe("computeRevenueSummary", () => {
  const now = new Date("2026-07-15T05:00:00.000Z"); // 12:00 VN 15/7
  const o = (id: string, tier: string, months: number, amount: number, paidAtIso: string, email = "a@b.c") =>
    ({ id, email, tier, months, amount, paid_at: paidAtIso });

  it("mang rong -> so 0, monthly du 6 thang, growth null", () => {
    const r = computeRevenueSummary([], now);
    expect(r.totals).toEqual({ all: 0, thisMonth: 0, lastMonth: 0, growthPct: null });
    expect(r.monthly).toHaveLength(6);
    expect(r.monthly[0].ym).toBe("2026-02");
    expect(r.monthly[5]).toEqual({ ym: "2026-07", total: 0, orders: 0 });
    expect(r.byTier.starter).toEqual({ orders: 0, total: 0, monthly: 0, yearly: 0 });
    expect(r.recent).toEqual([]);
  });

  it("bien mui gio VN: 17:30 UTC 30/6 = 00:30 VN 1/7 -> tinh vao thang 7", () => {
    const r = computeRevenueSummary([o("BLB1", "starter", 1, 249000, "2026-06-30T17:30:00.000Z")], now);
    expect(r.totals.thisMonth).toBe(249000);
    expect(r.totals.lastMonth).toBe(0);
  });

  it("tong + growth binh thuong va last=0 -> null", () => {
    const r = computeRevenueSummary([
      o("BLB1", "starter", 1, 249000, "2026-07-02T03:00:00.000Z"),
      o("BLB2", "pro", 1, 649000, "2026-07-05T03:00:00.000Z"),
      o("BLB3", "starter", 1, 249000, "2026-06-10T03:00:00.000Z"),
    ], now);
    expect(r.totals.all).toBe(1147000);
    expect(r.totals.thisMonth).toBe(898000);
    expect(r.totals.lastMonth).toBe(249000);
    expect(r.totals.growthPct).toBe(260.6);
    const june = r.monthly.find(m => m.ym === "2026-06");
    expect(june).toEqual({ ym: "2026-06", total: 249000, orders: 1 });
  });

  it("byTier dem don + chu ky; tier la vao totals nhung khong vao byTier", () => {
    const r = computeRevenueSummary([
      o("BLB1", "starter", 1, 249000, "2026-07-02T03:00:00.000Z"),
      o("BLB2", "starter", 12, 2390000, "2026-07-03T03:00:00.000Z"),
      o("BLB3", "pro", 12, 6230000, "2026-07-04T03:00:00.000Z"),
      o("BLB4", "business", 1, 999000, "2026-07-05T03:00:00.000Z"),
    ], now);
    expect(r.byTier.starter).toEqual({ orders: 2, total: 2639000, monthly: 1, yearly: 1 });
    expect(r.byTier.pro).toEqual({ orders: 1, total: 6230000, monthly: 0, yearly: 1 });
    expect(r.totals.all).toBe(9868000);
  });

  it("recent: sap xep moi nhat truoc, cat 20, dung shape", () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      o(`BLB${i}`, "starter", 1, 1000 + i, new Date(Date.UTC(2026, 6, 1, i)).toISOString()));
    const r = computeRevenueSummary(many, now);
    expect(r.recent).toHaveLength(20);
    expect(r.recent[0].id).toBe("BLB24");
    expect(r.recent[0]).toEqual({ id: "BLB24", email: "a@b.c", tier: "starter", months: 1, amount: 1024, paidAt: new Date(Date.UTC(2026, 6, 1, 24)).toISOString() });
  });

  it("don thieu paid_at bi bo qua", () => {
    const r = computeRevenueSummary([{ id: "BLBX", tier: "starter", months: 1, amount: 249000, paid_at: null }], now);
    expect(r.totals.all).toBe(0);
    expect(r.recent).toEqual([]);
  });
});
```
(Nhớ import `computeRevenueSummary` vào đầu file test.)

- [ ] **Step 2: FAIL** — `npx vitest run payments`.
- [ ] **Step 3: Implement** trong `payments/sepay.ts` (import `currentYearMonth` từ `../billing.js`):

```ts
import { currentYearMonth } from "../billing.js"; // sepay.ts nằm trong payments/

function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export interface RevenueSummary { /* như Interfaces trên */ }

export function computeRevenueSummary(orders, now: Date = new Date()): RevenueSummary {
  const nowYm = currentYearMonth(now);
  const lastYm = shiftYm(nowYm, -1);
  const monthlyMap = new Map<string, { total: number; orders: number }>();
  for (let i = 5; i >= 0; i--) monthlyMap.set(shiftYm(nowYm, -i), { total: 0, orders: 0 });

  const byTier = {
    starter: { orders: 0, total: 0, monthly: 0, yearly: 0 },
    pro: { orders: 0, total: 0, monthly: 0, yearly: 0 },
  };
  let all = 0, thisMonth = 0, lastMonth = 0;
  const paid = orders.filter(od => !!od.paid_at);

  for (const od of paid) {
    const ym = currentYearMonth(new Date(od.paid_at!));
    all += od.amount;
    if (ym === nowYm) thisMonth += od.amount;
    if (ym === lastYm) lastMonth += od.amount;
    const slot = monthlyMap.get(ym);
    if (slot) { slot.total += od.amount; slot.orders += 1; }
    if (od.tier === "starter" || od.tier === "pro") {
      const t = byTier[od.tier];
      t.orders += 1; t.total += od.amount;
      if (od.months === 12) t.yearly += 1; else t.monthly += 1;
    }
  }

  const growthPct = lastMonth === 0 ? null : Math.round(((thisMonth - lastMonth) / lastMonth) * 1000) / 10;
  const recent = [...paid]
    .sort((a, b) => new Date(b.paid_at!).getTime() - new Date(a.paid_at!).getTime())
    .slice(0, 20)
    .map(od => ({ id: od.id, email: od.email ?? null, tier: od.tier, months: od.months, amount: od.amount, paidAt: od.paid_at! }));

  return {
    totals: { all, thisMonth, lastMonth, growthPct },
    monthly: [...monthlyMap.entries()].map(([ym, v]) => ({ ym, ...v })),
    byTier,
    recent,
  };
}
```
(Viết type đầy đủ cho tham số `orders` như Interfaces.)

- [ ] **Step 4: PASS** — `npx vitest run payments` + `npx tsc --noEmit` + `npx vitest run` toàn repo.
- [ ] **Step 5: Commit** — `git add payments/ && git commit -m "feat(revenue): computeRevenueSummary - tổng hợp doanh thu theo giờ VN (TDD)"`

---

### Task 2: DB + endpoint + UI + deploy

**Files:** Modify `supabaseService.ts`, `server.ts`, `src/App.tsx`.

- [ ] **Step 1: `dbGetPaidPaymentOrders`** (supabaseService.ts, cạnh các hàm payment):

```ts
export async function dbGetPaidPaymentOrders(limit = 500): Promise<PaymentOrder[]> {
  const client = getRootSupabaseClient();
  if (!client) return [];
  try {
    const { data, error } = await client.from("payment_orders").select("*")
      .eq("status", "paid").order("paid_at", { ascending: false }).limit(limit);
    if (error || !data) return [];
    return (data as any[]).map(r => ({ ...r, amount: Number(r.amount) })) as PaymentOrder[];
  } catch { return []; }
}
```

- [ ] **Step 2: Endpoint** (server.ts, ngay sau `GET /api/admin/payments/unmatched`; import `computeRevenueSummary` từ ./payments/sepay.js + `dbGetPaidPaymentOrders` từ supabaseService):

```ts
app.get("/api/admin/payments/revenue", async (req, res) => {
  if (!requireOwnerAdmin(req, res)) return;
  const orders = await dbGetPaidPaymentOrders(500);
  res.json(computeRevenueSummary(orders));
});
```

- [ ] **Step 3: UI (App.tsx).** State `revenueData` (kiểu RevenueSummary | null — khai inline, không import từ backend); fetch thêm trong effect admin đang nạp `unmatchedPayments` (cùng điều kiện tab admin + admin email): `fetch('/api/admin/payments/revenue', { headers: getScopedApiHeaders() }).then(r => r.ok ? r.json() : null).then(setRevenueData).catch(() => setRevenueData(null))`. Khối JSX "💰 Doanh thu" đặt TRÊN bảng khách hàng trong tab admin, render khi `revenueData` khác null:
  1. 3 thẻ grid `sm:grid-cols-3`: Tổng doanh thu (`totals.all`), Tháng này (`totals.thisMonth` + badge `↑x%` emerald khi growthPct>0 / `↓x%` rose khi <0 / không hiện khi null), Tháng trước.
  2. Biểu đồ 6 cột: `monthly.map` — cột `div` cao `h = max>0 ? Math.max(4, total/max*80) : 4` px, màu emerald khi total>0 / slate-200 khi 0, `title={`${ym}: ${total.toLocaleString('vi-VN')}đ (${orders} đơn)`}`, nhãn dưới `T${Number(ym.slice(5))}`.
  3. 2 thẻ cơ cấu: Starter & Pro — tổng tiền đậm + `{orders} đơn • {monthly} tháng • {yearly} năm`.
  4. Bảng recent: Email • Gói (badge STARTER/PRO) • Chu kỳ (months===12?'Năm':'Tháng') • Số tiền • `new Date(paidAt).toLocaleString('vi-VN')`. Rỗng → "Chưa có doanh thu — đơn thanh toán đầu tiên sẽ hiện ở đây."

- [ ] **Step 4: Verify** — `npx tsc --noEmit` + `npm run build` + `npx vitest run`.
- [ ] **Step 5: Commit + deploy (controller)** — commit "feat(admin): mục Doanh thu - tổng quan, 6 tháng, cơ cấu gói, đơn gần nhất"; push (Railway); wrangler Pages deploy.
