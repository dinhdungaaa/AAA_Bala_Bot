# Tái cấu trúc tab Quản trị thành 4 mục sub-tab — Thiết kế

**Ngày:** 2026-07-11
**Trạng thái:** Đã duyệt (user chọn: sub-tab pill, 4 mục, mặc định Người dùng)

## Vấn đề

Tab Quản trị (`activeTab === 'admin'`, src/App.tsx ~6695–7383) là một trang cuộn dài
với 6 khối xếp chồng: banner → 💰 Doanh thu → 🛡️ Allowlist Free → 📇 Leads →
dải thống kê người dùng → bảng người dùng (kèm ⚠️ Giao dịch lạc lồng ở cuối).
Muốn xem một khối phải cuộn qua tất cả các khối khác.

## Giải pháp

Chia thành 4 mục, điều hướng bằng thanh pill sub-tab ngay dưới banner —
tái dùng đúng pattern pill của tab Đào tạo AI (`schedTab`, App.tsx ~6350):
`flex bg-white border border-slate-200 rounded-xl p-1 gap-1 shadow-xs`,
nút active `bg-indigo-600 text-white shadow-md` (đổi teal → indigo cho hợp tông admin).

### Các mục

| Key | Nhãn | Nội dung (khối cũ, chỉ chuyển chỗ — KHÔNG viết lại) |
|---|---|---|
| `users` | 👥 Người dùng *(mặc định)* | TOP AGGREGATE STATS STRIP + FULL WIDTH SAAS DIRECTORY PANEL (bảng người dùng, quick-add, nâng gói/cấp bù) |
| `revenue` | 💰 Doanh thu | Khối 💰 DOANH THU + ⚠️ GIAO DỊCH LẠC (nhấc ra khỏi directory panel, đặt sau khối doanh thu) |
| `allowlist` | 🛡️ Allowlist | ALLOWLIST GÓI FREE — Peace Solution |
| `leads` | 📇 Leads | LEADS — khách để lại liên hệ qua Trợ lý web |

### State

- `const [adminSection, setAdminSection] = useState<'users' | 'revenue' | 'allowlist' | 'leads'>('users');`
- Không lưu URL/localStorage — mở lại tab admin luôn về `users`.

### Tín hiệu cảnh báo trên pill

- 💰 Doanh thu: chấm đỏ (`bg-rose-500`) khi `unmatchedPayments.length > 0` —
  Giao dịch lạc là tiền vào nhưng gói chưa kích hoạt, không được bỏ sót sau lớp tab.
- 📇 Leads: chấm xanh (`bg-indigo-500`) khi `leadsList.length > 0`.
- Chấm là `<span>` tròn 6px góc trên-phải của nút, chỉ render khi điều kiện đúng.

### Không đổi

- Banner header giữ nguyên, luôn hiện trên mọi mục.
- Toàn bộ fetch giữ nguyên (nạp khi mở tab admin) — chuyển mục chỉ là render có điều kiện,
  không gọi API lại.
- Không đổi backend, không đổi logic nghiệp vụ. Khối doanh thu vẫn render có điều kiện
  `revenueData && (...)` như cũ, nay nằm trong nhánh `adminSection === 'revenue'`.

## Rủi ro & kiểm soát

- Khối GIAO DỊCH LẠC đang lồng trong div MAIN COLUMN của directory panel —
  khi nhấc ra phải kiểm tra đóng/mở thẻ JSX (build `npx tsc --noEmit` + vite build bắt lỗi).
- 165 test vitest hiện có phải vẫn xanh (không có test UI, nhưng chạy để chắc không vỡ import).

## Kiểm thử

- Build TypeScript + vite pass.
- Thủ công: mở tab Quản trị → mặc định Người dùng; bấm từng pill → đúng khối hiện,
  khối khác ẩn; có giao dịch lạc → chấm đỏ trên pill Doanh thu.
