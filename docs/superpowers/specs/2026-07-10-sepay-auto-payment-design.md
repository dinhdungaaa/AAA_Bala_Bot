# Thanh Toán Tự Động Qua SePay — Thiết Kế

**Ngày:** 2026-07-10
**Trạng thái:** Đã duyệt hướng (SePay + QR động; tháng + năm -20%; đổi gói = 30 ngày mới; báo khách trên màn hình + Telegram cho owner)

## 1. Mục tiêu

Khách tự chọn gói → quét QR chuyển khoản → gói tự kích hoạt trong ~1 phút, không cần admin thao tác. Giữ nguyên đường nâng tay trong admin CRM làm phương án dự phòng.

Ngoài phạm vi: email hóa đơn, trừ tiền định kỳ tự động, quy đổi ngày dư khi đổi gói, VNPay/Momo, bán gói Enterprise tự động (vẫn "liên hệ").

## 2. Bảng giá & quy tắc hạn

- Giá tháng (VND): `PLAN_PRICES = { starter: 249000, pro: 649000 }` (đặt trong `billing.ts`).
- Chu kỳ: `months = 1` (30 ngày) hoặc `months = 12` (360 ngày, giá = tháng × 12 × 0.8 → Starter năm 2.390.400đ, Pro năm 6.230.400đ — làm tròn xuống nghìn: dùng `Math.round(price * 12 * 0.8 / 1000) * 1000` → 2.390.000đ / 6.230.000đ).
- Kích hoạt (chạy trong webhook):
  - Cùng tier với gói hiện tại còn hạn → `plan_expires_at = max(now, hạn cũ) + months*30 ngày` (cộng nối).
  - Khác tier (hoặc hết hạn/chưa có gói) → `plan_expires_at = now + months*30 ngày`.
  - `message_limit = PLAN_LIMITS[tier].messages`. Upsert `profiles` qua `dbUpdateProfilePlan` (root client, sẵn có).

## 3. Thành phần

### 3.1 Module thuần `payments/sepay.ts` (test được độc lập)
- `PLAN_PRICES`, `computeOrderAmount(tier, months): number` (tháng nguyên giá; 12 tháng ×0.8 làm tròn nghìn).
- `generateOrderCode(): string` — `"BLB"` + 8 ký tự từ bảng `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (bỏ I/L/O/0/1 dễ nhầm; sống sót uppercase/strip-space của ngân hàng).
- `extractOrderCode(content: string): string | null` — uppercase toàn bộ, match `/BLB[A-Z0-9]{8}/` (regex RỘNG hơn bảng sinh mã có chủ đích: mã sinh ra luôn khớp, chuỗi lạ khớp nhầm chỉ dẫn tới "không tìm thấy đơn" → rơi vào giao dịch lạc, vô hại).
- `buildSepayQrUrl(opts: { account, bank, amount, orderCode }): string` — `https://qr.sepay.vn/img?acc=...&bank=...&amount=...&des=...` (encodeURIComponent từng tham số).
- `verifySepayApiKey(authorizationHeader: string | undefined, expectedKey: string): boolean` — chấp nhận dạng `Apikey <key>` (case-insensitive prefix), so sánh timing-safe.
- `resolveNewExpiry(opts: { currentTier?: string; currentExpiresAt?: string | null; newTier: string; months: number; now?: Date }): string` — quy tắc mục 2.
- `parseSepayWebhook(body: unknown): { txId: string; amount: number; content: string; isIncoming: boolean } | null` — đọc payload chuẩn SePay: `id` (số, mã giao dịch SePay), `transferAmount`, `content` (nội dung CK), `transferType` (`"in"`/`"out"`); thiếu trường cốt lõi → null.

### 3.2 Bảng `payment_orders` (DB GỐC — file `payments.sql`, chạy tay)
```sql
create table if not exists payment_orders (
  id text primary key,                -- chính là orderCode BLBxxxxxxxx
  user_id text not null,
  email text,
  tier text not null,                 -- starter | pro
  months integer not null default 1,  -- 1 | 12
  amount bigint not null,             -- VND
  status text not null default 'pending',  -- pending | paid | expired
  sepay_tx_id text,                   -- id giao dịch SePay đã khớp (chống trùng)
  created_at timestamptz default now(),
  paid_at timestamptz
);
create index if not exists payment_orders_user_idx on payment_orders (user_id, created_at desc);
-- Giao dịch tiền vào không khớp đơn nào — để admin đối soát tay
create table if not exists payment_unmatched (
  id text primary key,                -- sepay tx id
  amount bigint,
  content text,
  received_at timestamptz default now()
);
```
Mọi đọc/ghi 2 bảng này dùng **root client** (`getRootSupabaseClient`) — dữ liệu nền tảng, không theo BYO scope. Không cache RAM làm nguồn sự thật (webhook và poll phải thấy cùng trạng thái qua restart); đọc thẳng DB mỗi lần (lưu lượng thấp).

### 3.3 API (server.ts)
- `POST /api/payments/orders` — body `{ tier: 'starter'|'pro', months: 1|12, userId, email }`. Yêu cầu `userId` (khách đã đăng nhập; khớp header `x-balabot-user-id` nếu có). Rate-limit 5 đơn/phút/IP. Tính `amount` server-side (không tin client). Sinh orderCode, insert DB. Response: `{ orderId, amount, qrUrl, bankAccount, bankName, accountName, transferContent: orderId, expiresInHours: 24 }`. Thiếu env SePay → 503 "Thanh toán tự động đang bảo trì, vui lòng liên hệ...".
- `GET /api/payments/orders/:orderId` — trả `{ status, tier, months, amount, paidAt }`. Nếu pending quá 24h → update status='expired' (lazy) rồi trả. Dùng cho polling 4s của modal.
- `POST /api/payments/sepay-webhook` — công khai nhưng kiểm `verifySepayApiKey(req.headers.authorization, SEPAY_WEBHOOK_KEY)`; sai → 401. Xử lý:
  1. `parseSepayWebhook` — không phải tiền vào (`isIncoming=false`) hoặc payload lạ → 200 `{success:true}` (SePay cần 200 để không retry vô hạn; log warn).
  2. `extractOrderCode(content)` → không thấy mã → ghi `payment_unmatched` + Telegram báo owner → 200.
  3. Tra đơn theo orderCode: không tồn tại → unmatched như trên. Đã `paid` → 200 (idempotent). `sepay_tx_id` trùng id giao dịch này ở đơn khác → 200 bỏ qua.
  4. `transferAmount < order.amount` → KHÔNG kích hoạt, ghi unmatched (kèm nội dung "chuyển thiếu") + Telegram → 200.
  5. Đủ tiền (>=): đọc `dbGetProfilePlan(order.user_id)` → `resolveNewExpiry` → `dbUpdateProfilePlan(order.user_id, order.email, order.tier, PLAN_LIMITS[tier].messages, expiry)` → update đơn `status='paid', paid_at=now, sepay_tx_id` → Telegram owner: "💰 ĐƠN MỚI: {email} • {tier} {months} tháng • {amount}đ • hạn mới {expiry}". Đơn `expired` mà tiền về đủ → vẫn kích hoạt như trên (đơn quá hạn nhưng khách đã trả — quyền lợi khách trên hết).
  - Toàn bộ handler bọc try/catch → lỗi bất ngờ vẫn trả 200 kèm log (không để SePay retry bão hòa); riêng lỗi ghi profiles → trả 500 để SePay RETRY (kích hoạt là bước không được rơi).
- Telegram báo owner: dùng bot + chat id từ env `OWNER_NOTIFY_TELEGRAM_TOKEN`/`OWNER_NOTIFY_TELEGRAM_CHAT_ID`; thiếu env → bỏ qua thông báo (không chặn kích hoạt).

### 3.4 Env (Railway)
`SEPAY_WEBHOOK_KEY` (API key khai trên SePay), `SEPAY_BANK_ACCOUNT` (số TK), `SEPAY_BANK_CODE` (mã ngân hàng theo chuẩn qr.sepay.vn, vd `VPBank`), `SEPAY_ACCOUNT_NAME` (tên chủ TK — chỉ để hiển thị), `OWNER_NOTIFY_TELEGRAM_TOKEN`, `OWNER_NOTIFY_TELEGRAM_CHAT_ID` (tùy chọn).

### 3.5 UI — modal "Nâng gói" (App.tsx, thay nội dung modal `showUpgrade` hiện tại)
3 bước trong cùng modal:
1. **Chọn gói**: 2 thẻ Starter/Pro (giá + hạn mức + tính năng tóm tắt từ bảng giá hiện có) + toggle Tháng/Năm (-20%, hiện giá đã giảm). Gói hiện tại của khách được đánh dấu; Enterprise = dòng "liên hệ ox102.crypto@gmail.com".
2. **Thanh toán**: sau khi bấm "Tạo mã thanh toán" → hiện ảnh QR (`qrUrl`), số tiền, STK + tên chủ TK + nội dung CK (orderCode, nút copy), cảnh báo "chuyển ĐÚNG nội dung nếu nhập tay". Poll `GET /api/payments/orders/:id` mỗi 4s. Dòng phụ: "Đơn có hiệu lực 24 giờ".
3. **Hoàn tất**: status='paid' → "🎉 Gói {tier} đã kích hoạt tới {date}" + gọi lại endpoint usage (`/api/usage/me`) refresh thẻ usage; nút Đóng.
- Nút "Tôi đã chuyển nhưng chưa thấy xác nhận" → hiện hướng dẫn: chờ 1-2 phút, kiểm tra đúng nội dung CK, liên hệ email kèm mã đơn.
- Đóng modal giữa chừng không hủy đơn (quét lại QR cũ trong 24h vẫn được).

### 3.6 Admin (phạm vi tối thiểu)
Tab admin thêm khối "Giao dịch lạc" đơn giản: list `payment_unmatched` (id, số tiền, nội dung, lúc nhận) — GET `/api/admin/payments/unmatched` (requireOwnerAdmin). Xử lý xong anh nâng tay bằng CRM như hiện tại (không xây flow match tay ở phase này).

## 4. Bảo mật & biên

- Webhook: sai/thiếu Apikey → 401. So sánh key timing-safe. Không log key.
- Số tiền tính server-side; client chỉ gửi tier+months. `tier` ngoài {starter,pro} hoặc `months` ngoài {1,12} → 400.
- Đơn của user nào kích hoạt cho user đó (`order.user_id`) — kẻ lạ "trả hộ" chỉ làm lợi cho nạn nhân.
- Idempotent 2 lớp: đơn đã paid bỏ qua; sepay_tx_id đã dùng bỏ qua.
- 2 đơn pending cùng lúc của cùng user: cho phép (mỗi QR mã riêng, tiền về khớp mã nào kích hoạt đơn đó; đơn kia hết hạn sau 24h).
- Root DB down lúc webhook → 500 → SePay retry (theo cơ chế retry của SePay); poll phía khách vẫn pending → khách không mất tiền, kích hoạt trễ.
- Free allowlist / gói tay của admin không bị ảnh hưởng: thanh toán chỉ upsert profiles như admin vẫn làm.

## 5. Kiểm thử

- Vitest cho `payments/sepay.ts`: computeOrderAmount (tháng/năm, làm tròn nghìn), generateOrderCode format + không ký tự nhầm lẫn, extractOrderCode (nội dung ngân hàng thực tế: thường/hoa, dính chữ xung quanh, không có mã), buildSepayQrUrl encode đúng, verifySepayApiKey (đúng/sai/thiếu/prefix hoa thường), resolveNewExpiry (4 case: cùng tier còn hạn, cùng tier hết hạn, khác tier còn hạn, chưa có gói; months 1 và 12), parseSepayWebhook (payload chuẩn, thiếu trường, transferType out).
- UAT tay: tạo đơn → quét QR chuyển 1.000đ vào tài khoản thật với đúng nội dung (đơn test amount 1.000đ tạo bằng cách tạm sửa giá? KHÔNG — thêm env `PAYMENT_TEST_MODE=1` cho phép body `months:1, tier:'starter'` với `amountOverride` chỉ khi env bật, tắt trên production sau khi test) → webhook về → gói kích hoạt + Telegram + màn hình đổi trạng thái. Test chuyển thiếu tiền, sai nội dung → vào "Giao dịch lạc".

## 6. Việc owner sau khi merge

1. Đăng ký SePay, liên kết TK ngân hàng, khai webhook `https://antiantiai.xyz/balabot/api/payments/sepay-webhook` + API key.
2. Chạy `payments.sql` trên DB gốc. Set 4-6 env trên Railway rồi redeploy.
3. UAT theo mục 5 với `PAYMENT_TEST_MODE=1`, xong TẮT env này.
4. Cập nhật kiến thức trợ lý website: khách giờ tự thanh toán trong dashboard (sẽ làm khi tính năng chạy thật).
