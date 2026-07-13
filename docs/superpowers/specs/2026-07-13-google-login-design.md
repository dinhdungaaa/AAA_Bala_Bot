# Google (Gmail) Login — Design

Ngày: 2026-07-13. Trạng thái: đã duyệt.

## Mục tiêu
Cho phép đăng nhập dashboard BalaBot bằng tài khoản Google, song song với đăng nhập email/mật khẩu hiện có. Hợp nhất danh tính theo email (Gmail trùng email đã có = cùng một tài khoản, thấy chung bot).

## Kiến trúc (custom server-side OAuth)
Không dùng Supabase Google provider (tránh phải nhúng Supabase client + anon key ở frontend, và để chạy đồng nhất với cơ chế session token HMAC hiện có). Server tự chạy OAuth code flow với Google rồi phát session token nội bộ.

### Luồng
1. Frontend: nút "Đăng nhập bằng Google" ở màn login → mở **popup** `/api/auth/google/start`.
2. `GET /api/auth/google/start`: ký `state` (HMAC, TTL 10 phút, chống CSRF) → 302 tới Google consent
   `https://accounts.google.com/o/oauth2/v2/auth?client_id&redirect_uri&response_type=code&scope=openid%20email%20profile&state&access_type=online&prompt=select_account`.
3. `GET /api/auth/google/callback?code&state`:
   - verify `state`; đổi `code` → token tại `https://oauth2.googleapis.com/token` (redirect_uri phải KHỚP bước 2).
   - lấy `id_token` (JWT). Verify chữ ký bằng JWKS `https://www.googleapis.com/oauth2/v3/certs`, kiểm `iss ∈ {accounts.google.com, https://accounts.google.com}`, `aud === GOOGLE_CLIENT_ID`, `exp` còn hạn, `email_verified === true`. Lấy `email`, `name`, `sub`.
   - **Hợp nhất theo email** (dùng root/service-role Supabase): tìm auth user theo email; chưa có → `admin.createUser({ email, email_confirm:true })`; upsert `profiles` (tier free / enterprise nếu là ADMIN_EMAIL). `userId` = id user Supabase.
   - cập nhật `workspaceUsers` / `saasCustomers` như signin.
   - mint `sessionToken = makeSessionToken(userId, email)` + `configToken = makeConfigToken(email)`.
   - trả trang HTML popup `postMessage({ type:"balabot-google-auth", success, sessionToken, user:{id,email}, configToken }, appOrigin)` rồi tự đóng.
4. Frontend nghe `message`: lưu `sbAuthToken`, `sbUser`, `sbConfigToken` → vào dashboard (giống đăng nhập thường), rồi chạy khôi phục cấu hình Supabase như flow signin.

## Module `googleOauth.ts` (thuần, unit-test được — pattern như facebookOauth.ts)
- `signGoogleState(secret, now?)` / `verifyGoogleState(state, secret, now?)`: state HMAC base64url + TTL.
- `buildGoogleAuthUrl({ clientId, redirectUri, state })`.
- `parseJwtPayload(idToken)`: tách + decode payload (không verify).
- `verifyGoogleIdToken(idToken, { clientId, certs, now? })`: verify RS256 bằng JWKS (kid → cert), kiểm iss/aud/exp/email_verified; trả `{ email, name, sub }` hoặc null.
- Không gọi mạng trong module (nhận `certs` từ ngoài để test được); server lo fetch JWKS + token exchange.

## Bảo mật
- `state` HMAC chống CSRF, TTL 10 phút.
- `id_token` verify chữ ký Google + `aud` + `email_verified`.
- `sessionToken` chỉ postMessage về **origin app** (không dùng "*").
- Client secret chỉ ở server env, không lộ ra frontend.

## Cấu hình (owner, một lần)
- Google Cloud Console → OAuth consent screen (External) + tạo OAuth Client ID (Web application).
- Authorized redirect URI: `https://antiantiai.xyz/balabot/api/auth/google/callback` (+ `http://localhost:<port>/api/auth/google/callback` cho dev).
- Railway env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. (Tùy chọn `OAUTH_STATE_SECRET`; mặc định dùng `CONFIG_TOKEN_SECRET`.)
- Trang hướng dẫn từng bước phục vụ tại `/api/huong-dan-google-login` (giống trang Botcake), có nút trên màn login.

## Phạm vi (YAGNI)
- Chỉ map vào Supabase nền tảng (root). Khách BYO Supabase vẫn dùng email/mật khẩu.
- Chưa làm liên kết đa provider nâng cao — chỉ gộp theo email.
- Nếu `GOOGLE_CLIENT_ID` chưa cấu hình: `/start` trả thông báo "chưa bật"; nút Google ẩn/disable.

## Kiểm thử
- Unit (`__tests__/googleOauth.test.ts`): state ký→verify OK; sai chữ ký/hết hạn → null; `verifyGoogleIdToken` với cặp khóa RSA test: hợp lệ trả claims, sai aud / email_verified=false / hết hạn → null; `parseJwtPayload` lỗi định dạng → null.
- Sau deploy: owner bật env → đăng nhập Google thật; kiểm session token hoạt động; Gmail trùng email password → cùng bot.
