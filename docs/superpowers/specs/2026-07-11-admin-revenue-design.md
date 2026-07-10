# Mục Doanh Thu Trong Tab Quản Trị — Thiết Kế

**Ngày:** 2026-07-11
**Trạng thái:** Đã duyệt hướng (4 khối, đặt trên cùng tab admin, endpoint tổng hợp server-side)

## 1. Mục tiêu

Owner mở tab Quản trị thấy ngay tình hình tiền về từ thanh toán tự động SePay: tổng quan, xu hướng 6 tháng, cơ cấu gói, đơn gần nhất. Dữ liệu nguồn: bảng `payment_orders` (DB gốc, chỉ đơn `status='paid'`).

Ngoài phạm vi: lọc theo khoảng ngày tùy chọn, xuất Excel, MRR/dự báo, doanh thu từ nâng gói tay của admin (không có bản ghi tiền — chỉ đơn SePay được tính).

## 2. Backend

### 2.1 `supabaseService.ts` — hàm mới (cạnh các hàm payment)
```ts
export async function dbGetPaidPaymentOrders(limit = 500): Promise<PaymentOrder[]>
```
Root client; `select("*").eq("status","paid").order("paid_at",{ascending:false}).limit(limit)`; ép `Number(amount)` từng row (nhất quán các hàm đọc payment hiện có); lỗi/thiếu client → `[]`.

### 2.2 `server.ts` — endpoint mới (cạnh `GET /api/admin/payments/unmatched`)
`GET /api/admin/payments/revenue` — `requireOwnerAdmin`. Đọc `dbGetPaidPaymentOrders(500)` rồi tính (múi giờ VN, tái dùng `currentYearMonth(date)` cho nhãn "YYYY-MM"):

```ts
{
  totals: {
    all: number,            // tổng amount mọi đơn paid
    thisMonth: number,      // đơn có paid_at thuộc tháng VN hiện tại
    lastMonth: number,
    growthPct: number | null // (this-last)/last*100 làm tròn 1 chữ số; last=0 → null
  },
  monthly: Array<{ ym: string; total: number; orders: number }>, // đúng 6 phần tử, cũ→mới, tháng không có đơn = 0
  byTier: {
    starter: { orders: number; total: number; monthly: number; yearly: number },
    pro:     { orders: number; total: number; monthly: number; yearly: number }
  }, // monthly/yearly = SỐ ĐƠN theo chu kỳ months===1 / months===12
  recent: Array<{ id: string; email: string | null; tier: string; months: number; amount: number; paidAt: string }> // 20 đơn mới nhất
}
```
Nhãn tháng của đơn = `currentYearMonth(new Date(order.paid_at))`. Đơn tier lạ (ngoài starter/pro — không thể xảy ra qua flow chuẩn) gộp vào tổng nhưng bỏ qua ở byTier.

## 3. UI — `src/App.tsx`, tab admin, TRÊN bảng khách hàng

State `revenueData` (type theo response) + fetch trong cùng effect đang nạp Giao dịch lạc khi mở tab admin (kèm `getScopedApiHeaders()`); lỗi → giữ null, khối ẩn (không vỡ tab).

Khối "💰 Doanh thu" (thẻ trắng chuẩn dự án), 4 phần từ trên xuống:
1. **3 thẻ tổng quan**: "Tổng doanh thu" • "Tháng này" (kèm `↑ x%` emerald / `↓ x%` rose so tháng trước; growthPct null → không hiện) • "Tháng trước". Tiền định dạng `toLocaleString('vi-VN') + 'đ'`.
2. **Biểu đồ cột 6 tháng**: thuần div (cùng kỹ thuật biểu đồ "giờ vàng" trong tab analytics — cột cao theo % so max, max=0 → mọi cột phẳng), nhãn dưới cột dạng "T7", tooltip title = "2026-07: 1.234.000đ (3 đơn)".
3. **2 thẻ cơ cấu gói**: Starter và Pro — mỗi thẻ: tổng tiền + số đơn + dòng nhỏ "x tháng • y năm".
4. **Bảng 20 đơn gần nhất**: Email • Gói • Chu kỳ (Tháng/Năm) • Số tiền • Lúc trả (`toLocaleString('vi-VN')`). Chưa có đơn nào → dòng "Chưa có doanh thu — đơn thanh toán đầu tiên sẽ hiện ở đây."

## 4. Kiểm thử

- Logic tính nằm trong hàm thuần `computeRevenueSummary(orders, now)` đặt ở `payments/sepay.ts` (module thuần sẵn có) để test được: vitest cases — tổng đúng; tháng này/tháng trước theo giờ VN (đơn 23:30 UTC cuối tháng = tháng sau giờ VN); growthPct (bình thường, last=0 → null); monthly đủ 6 phần tử kể cả tháng trống; byTier đếm đúng chu kỳ; recent cắt 20; mảng rỗng → mọi số 0.
- Server endpoint chỉ là: đọc DB → gọi `computeRevenueSummary` → json (không test integration, pattern dự án).
- UI: tsc + build.

## 5. Việc owner

Không có — dùng bảng sẵn có, không migration, không env mới.
