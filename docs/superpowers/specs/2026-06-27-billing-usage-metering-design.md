# Hệ thống thu phí & đo dùng (Billing & Usage Metering) — Design Spec

**Ngày:** 2026-06-27
**Trạng thái:** Đã duyệt thiết kế, chờ review spec → lên plan.

## Mục tiêu
Cho phép vận hành BalaBot dưới dạng SaaS thu phí: đo số tin nhắn AI mỗi khách dùng theo tháng, chặn khi vượt hạn mức gói, và hiển thị mức dùng/gói cho cả khách lẫn admin. Thanh toán **thủ công** (admin kích hoạt sau khi nhận chuyển khoản).

## Phạm vi
**Trong phạm vi (MVP):**
- Cấu hình gói + hạn mức tập trung.
- Đo dùng theo từng khách/tháng (Supabase).
- Chặn cứng có cảnh báo + ân hạn.
- UI mức dùng cho khách + cột usage trong CRM admin.
- Thanh toán thủ công (admin set gói trong CRM có sẵn).

**Ngoài phạm vi (Phase 2):**
- BYO Gemini key cho gói Free (hoãn — Free tạm dùng key chung, hạn mức thấp).
- Cổng thanh toán tự động (VNPay/MoMo/Stripe).
- Overage tự tính tiền (admin xử lý tay khi cần).

## Quyết định đã chốt
1. Thanh toán **thủ công** — tận dụng CRM `/api/admin/customers` có sẵn.
2. Vượt mức: **cảnh báo 80%/100% → ân hạn +10% → chặn cứng** (bot ngừng gọi AI, trả câu thông báo).
3. Đơn vị tính = **"tin bot trả lời"** ở kênh thật. KHÔNG tính tin khách gửi vào, playground, eval, simulate.
4. Gói & hạn mức theo bảng dưới (Phase 1).

## Gói & hạn mức

| Gói (`tier`) | Tin AI/tháng (mặc định) | Bot | Kênh |
|---|---|---|---|
| `free` | 150 | 1 | 1 |
| `starter` | 3.000 | 3 | tất cả |
| `pro` | 10.000 | 10 | tất cả |
| `business` | 30.000 | ∞ | tất cả |
| `enterprise` | tùy chỉnh (admin set) | ∞ | tất cả |

- Định nghĩa tập trung trong `PLAN_LIMITS` (server.ts): `tier → { messages, bots, channels }`.
- **Hạn mức hiệu lực** của một khách = `customer.messageLimit` (admin có thể override) nếu được set, ngược lại lấy `PLAN_LIMITS[tier].messages`. Tận dụng trường `messageLimit` đã có trong `SaasCustomer`.
- Mở rộng kiểu `tier` từ `'free'|'pro'|'enterprise'` → thêm `'starter'|'business'`. Dữ liệu cũ `enterprise` giữ nguyên (hạn mức tùy chỉnh).

## Mô hình dữ liệu

**Bảng mới `usage_counters` (Supabase):**
```
ownerKey     text     -- khóa chủ sở hữu (= bot.userId)
yearMonth    text     -- "2026-06"
messageCount integer  -- số tin AI đã trả lời trong tháng
updatedAt    timestamptz
PRIMARY KEY (ownerKey, yearMonth)
```
- RLS: deny mọi client anon; chỉ service-role (server) truy cập (giống `zalo_sessions`).
- Reset = tự nhiên theo `yearMonth` (sang tháng → dòng mới, count từ 0).

**Type mới (`src/types.ts`):**
```ts
export interface UsageCounter {
  ownerKey: string;
  yearMonth: string;
  messageCount: number;
  updatedAt: string;
}
export interface PlanLimit { messages: number; bots: number; channels: number | 'all'; }
```

## Quy về chủ sở hữu (attribution)
- Mỗi tin trả lời gắn với 1 bot → chủ sở hữu = `bot.userId`.
- `ownerKey = bot.userId` (có thể là auth id hoặc email — dùng nguyên giá trị làm khóa, không cần map).
- Hạn mức tra theo khách: tìm trong CRM/profiles khách có `id === ownerKey || email === ownerKey`; không thấy → mặc định gói `free`.

## Đo dùng (metering)
**Hàm thuần (unit-test được):**
```ts
function currentYearMonth(d = new Date()): string  // "YYYY-MM" theo UTC+7
```
**Hàm tác dụng phụ (server.ts):**
```ts
async function recordUsageForBot(bot: BotConfig): Promise<void>
// upsert usage_counters: tăng messageCount cho (bot.userId, currentYearMonth)
```
- Gọi **sau khi gửi câu trả lời AI thành công** ở mỗi kênh thật:
  - Telegram webhook handler
  - `processFacebookIncomingMessage`
  - Zalo `handler.ts` (qua `deps.recordUsage`)
  - `/api/integrations/botpress/reply`
- **KHÔNG gọi** ở: playground/preview, `/api/rag/eval`, `/api/bots/:id/eval`, `/api/zalo/simulate`, welcome `/start`.
- Đếm cả tin fallback? → **Có**, vì fallback vẫn gọi AI (tốn cost). Chỉ KHÔNG đếm nếu không gọi AI (vd chit-chat tĩnh, hoặc bị chặn hạn mức).

## Chặn hạn mức (enforcement)
**Hàm thuần (unit-test được):**
```ts
type UsageVerdict = 'ok' | 'warn' | 'blocked';
function usageVerdict(count: number, limit: number): UsageVerdict
// blocked nếu count >= limit * 1.1 (hết ân hạn)
// warn    nếu count >= limit * 0.8
// ok      còn lại
```
**Tại mỗi kênh thật, TRƯỚC khi gọi `generateRAGAnswer`:**
```ts
async function checkUsageGate(bot): Promise<{ allowed: boolean; verdict: UsageVerdict; count; limit }>
```
- `blocked` → KHÔNG gọi AI; gửi câu thông báo lịch sự (cấu hình được, mặc định: "Dạ hệ thống tạm đạt giới hạn phục vụ trong tháng, mong anh/chị thông cảm và liên hệ lại sau ạ."). KHÔNG tăng counter.
- `warn`/`ok` → trả lời bình thường; nếu `warn`, gắn cờ để UI/admin hiện cảnh báo (không chặn).
- Zalo: thêm `checkUsage` + `recordUsage` vào `ZaloDeps`.

## Giao diện
**Khách (App.tsx):**
- Thẻ "Mức dùng tháng này": thanh tiến trình `X / Y tin` + tên gói + màu cảnh báo khi ≥80% (vàng), ≥100% (đỏ).
- Nút **"Nâng gói"** → mở thông tin **chuyển khoản + liên hệ** (text tĩnh, vì thanh toán thủ công).
- Nguồn dữ liệu: endpoint mới `GET /api/usage/me` (theo ownerKey của user đăng nhập) → `{ count, limit, tier, verdict }`.

**Admin CRM (App.tsx, đã có bảng khách):**
- Thêm cột **"Dùng tháng này"** (count/limit) mỗi khách.
- Giữ thao tác set `tier`/`messageLimit` có sẵn → admin kích hoạt sau khi nhận tiền.
- Nguồn: mở rộng `GET /api/admin/customers` trả kèm `usageThisMonth`, hoặc endpoint `GET /api/admin/usage`.

## Thanh toán
Thủ công. Không tích hợp cổng. Khách chuyển khoản → admin vào CRM đổi `tier`/`messageLimit` → có hiệu lực ngay (đọc lại ở lần check kế tiếp).

## Kiến trúc & file
- `usageCounters.sql` (mới): bảng + RLS + index.
- `src/types.ts`: `UsageCounter`, `PlanLimit`, mở rộng `tier`.
- `supabaseService.ts`: `dbGetUsage(ownerKey, yearMonth)`, `dbIncrementUsage(ownerKey, yearMonth)`, `dbGetUsageBulk(yearMonth)` (cho admin).
- `server.ts`: `PLAN_LIMITS`, `currentYearMonth`, `usageVerdict`, `resolveLimitForOwner`, `recordUsageForBot`, `checkUsageGate`; chèn gate+record ở 4 kênh; endpoint `GET /api/usage/me`; mở rộng admin usage.
- `zaloGroupBot/types.ts` + `client.ts` + `handler.ts`: thêm `checkUsage`/`recordUsage` vào deps; gate trước, record sau.
- `src/App.tsx`: thẻ usage khách + cột usage CRM + popup chuyển khoản.
- Tests: `usageVerdict` (ngưỡng warn/block/grace), `currentYearMonth`, attribution, metering tăng đúng, gate chặn khi blocked, không đếm khi blocked.

## Xử lý lỗi & trường hợp biên
- **Supabase lỗi khi đọc usage** → fail-open (cho trả lời, không chặn) để không làm hỏng dịch vụ khách; ghi log. Tránh fail-closed làm chết bot vì lỗi DB.
- **Supabase lỗi khi tăng counter** → nuốt lỗi, log; chấp nhận đếm thiếu hơn là chặn nhầm.
- **Không tìm thấy khách trong CRM** → mặc định gói `free` (150).
- **bot.userId rỗng** (bot hệ thống) → bỏ qua đo dùng.
- **Đua ghi (race)**: upsert tăng bằng RPC/atomic increment nếu có; nếu không, đọc-cộng-ghi chấp nhận sai số nhỏ ở MVP.
- **Đổi tháng giữa hội thoại**: dùng `yearMonth` tại thời điểm xử lý từng tin → tự nhiên.

## Future (Phase 2)
- BYO Gemini key cho Free (cost ≈ 0): dùng key của khách trong `getAIClient` theo ownerKey.
- Cổng thanh toán tự động + webhook nâng gói.
- Overage tự tính + hóa đơn.
- Cache FAQ để giảm gọi AI.
