# Kết nối Fanpage Facebook 1 chạm (OAuth) — Design

**Ngày:** 2026-07-06
**Trạng thái:** Đã duyệt (PA 1 trong 3 phương án)

## Mục tiêu

Khách hàng (chủ shop, không rành kỹ thuật) tự kết nối Fanpage của họ với bot BalaBot
bằng nút "Kết nối Facebook" — đăng nhập FB, chọn Page, xong. Thay thế luồng hiện tại
bắt khách tự lấy Page Access Token trên Meta Developer (quá khó, không scale).

## Bối cảnh & ràng buộc

- Chủ dự án **chưa có pháp nhân** → chưa qua được Meta App Review (yêu cầu Business
  Verification). Giai đoạn pilot chạy app ở **Development mode**: mỗi khách pilot phải
  được mời làm **Tester** của Meta App (1 lần, ~2 phút) thì OAuth mới hoạt động.
- Dài hạn: đăng ký hộ kinh doanh → Business Verification → App Review
  (`pages_messaging` Advanced Access) → app Live → bỏ bước mời Tester. **Code không đổi.**
- Backend đã có sẵn: verify token + lấy Page info + auto-subscribe webhook + lưu per-bot
  (`POST /api/bots/:botId/facebook-connect`, server.ts:2330), xử lý tin nhắn Messenger
  đầy đủ (`processFacebookIncomingMessage`). Thiết kế tái dùng tối đa.

## Kiến trúc

### 1. Luồng UX

Dashboard bot → tab Facebook → nút **"Kết nối Facebook"** → popup Meta OAuth →
khách đăng nhập, chọn Fanpage, cấp quyền → popup đóng → dashboard hiện
"Đã kết nối Page X" (tái dùng UI trạng thái `facebookStatus` sẵn có).
Nếu khách quản lý nhiều Page: hiện màn chọn Page sau callback.

### 2. Backend — endpoint mới

- `GET /api/facebook-oauth/start?botId=...`
  Redirect sang `https://www.facebook.com/<ver>/dialog/oauth` với:
  - `client_id=FACEBOOK_APP_ID`, `redirect_uri=<PUBLIC_BASE>/api/facebook-oauth/callback`
  - `scope=pages_show_list,pages_messaging,pages_manage_metadata`
  - `state` = payload ký HMAC (botId + timestamp), hết hạn 10 phút — chống CSRF.

- `GET /api/facebook-oauth/callback?code=...&state=...`
  1. Verify `state` (chữ ký + hạn).
  2. Đổi `code` → short-lived user token → **long-lived user token**
     (`/oauth/access_token`, `fb_exchange_token`).
  3. Gọi `/me/accounts` → danh sách Page + **Page Access Token** từng Page
     (page token sinh từ long-lived user token → không hết hạn).
  4. 1 Page → nạp thẳng vào logic `facebook-connect` hiện có (verify, subscribe
     `subscribed_apps`, lưu `facebookPageAccessToken/PageId/PageName/Status` per-bot).
     Nhiều Page → trả trang HTML chọn Page → POST chọn xong mới nạp.
  5. Thành công → HTML tự đóng popup + postMessage về dashboard để refresh trạng thái.

### 3. Refactor webhook về 1 URL chung

Meta chỉ cho **1 callback URL mỗi app**. Hiện tại webhook per-bot
(`/api/facebook-webhook/:botId`) không hợp với app chung.

- Thêm `GET/POST /api/facebook-webhook` (không botId):
  - GET: verify `hub.verify_token` như cũ.
  - POST: đọc `entry[].id` (Page ID) → tra bot theo `facebookPageId` →
    `processFacebookIncomingMessage(bot, event)` như cũ. Không tìm thấy bot → 200 và bỏ qua
    (Meta yêu cầu luôn 200 để không retry).
- **Giữ nguyên** endpoint per-bot cũ để không vỡ kết nối hiện có.

### 4. Cấu hình (env Railway)

| Biến | Ghi chú |
|---|---|
| `FACEBOOK_APP_ID` | mới |
| `FACEBOOK_APP_SECRET` | mới — dùng cho đổi token + verify chữ ký webhook |
| `FACEBOOK_VERIFY_TOKEN` | đã có |
| `FACEBOOK_GRAPH_API_VERSION` | đã có, mặc định v25.0 |

Redirect URI đăng ký trên Meta App phải khớp domain công khai
(`https://antiantiai.xyz/balabot/api/facebook-oauth/callback` — đi qua Cloudflare
site-proxy về Railway; cần xác nhận proxy route `/balabot/api/*` áp dụng cho path này).

### 5. Bảo mật & xử lý lỗi

- Verify chữ ký webhook `X-Hub-Signature-256` bằng `FACEBOOK_APP_SECRET`
  (chỉ enforce khi secret được cấu hình — để môi trường dev không có secret vẫn chạy).
- `state` OAuth ký HMAC + TTL 10 phút.
- Lỗi thường gặp → thông báo tiếng Việt rõ ràng trong popup:
  - Khách từ chối cấp quyền (`error=access_denied`).
  - Tài khoản không quản lý Page nào (`/me/accounts` rỗng).
  - App dev mode + khách chưa là Tester → Meta chặn login → hướng dẫn nhận lời mời Tester.
- Long-lived page token không hết hạn, nhưng bị thu hồi nếu khách đổi mật khẩu/gỡ app →
  Send API trả lỗi 190: đánh dấu `facebookStatus = "expired"`, dashboard hiện nút kết nối lại.

### 6. Frontend

- Tab Facebook trong dashboard bot: nút "Kết nối Facebook" mở popup
  `/api/facebook-oauth/start?botId=...` (window.open, 600×700).
- Lắng nghe `postMessage` từ popup → refresh trạng thái kết nối.
- Giữ nguyên luồng dán token thủ công như phương án dự phòng (ẩn sau "Tùy chọn nâng cao").

### 7. Kiểm thử

- Unit: build/verify `state`; route webhook theo Page ID (đúng bot, không bot → 200).
- Thủ công end-to-end: tài khoản Tester kết nối Page thật → nhắn tin vào Page →
  bot trả lời; kiểm tra trường hợp nhiều Page, từ chối quyền, kết nối lại.

## Ngoài phạm vi

- Nộp App Review / Business Verification (track riêng, khi có hộ kinh doanh).
- Instagram Messaging (có thể thêm sau, cùng app).
- Tự động refresh token định kỳ (page token không hết hạn; chỉ xử lý thu hồi).

## Các bước phía chủ dự án (không phải code)

1. Tạo Meta App loại **Business** tại developers.facebook.com, thêm sản phẩm
   **Facebook Login** + **Messenger**.
2. Facebook Login → Settings: thêm redirect URI ở mục 4.
3. Messenger → cấu hình webhook: callback URL chung + verify token, subscribe
   `messages`, `messaging_postbacks`.
4. Lấy App ID + App Secret → đặt env trên Railway.
5. Mời khách pilot: App Roles → Testers → nhập username FB của khách → khách nhận
   lời mời tại developers.facebook.com/settings → gửi khách hướng dẫn 2 phút.
