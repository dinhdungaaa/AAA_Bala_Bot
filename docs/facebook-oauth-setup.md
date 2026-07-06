# Hướng dẫn kết nối Fanpage Facebook (OAuth 1 chạm) cho BalaBot

Tài liệu này dành cho **chủ dự án** (người quản trị BalaBot), viết theo kiểu "làm theo từng bước", không cần biết kỹ thuật lập trình.

Có 3 việc chính:

1. Tạo Meta App (làm **1 lần duy nhất** cho toàn bộ hệ thống).
2. Mời từng khách pilot làm Tester (làm **mỗi khách 1 lần**, chỉ cần trong lúc app còn ở chế độ Development).
3. Về lâu dài, xin Meta duyệt App Review để bỏ hẳn bước mời Tester.

---

## Phần 1: Tạo Meta App (làm 1 lần)

### Bước 1.1 — Tạo App trên Facebook for Developers

1. Mở trình duyệt, vào địa chỉ: `https://developers.facebook.com/`
2. Đăng nhập bằng tài khoản Facebook cá nhân của bạn (tài khoản này sẽ là chủ sở hữu App).
3. Ở góc trên bên phải, bấm **My Apps** → bấm nút **Create App** (Tạo ứng dụng).
4. Facebook hỏi "What do you want your app to do?" → chọn loại **Business**.
5. Điền:
   - **App name**: ví dụ `BalaBot` (tên hiển thị nội bộ, khách không nhìn thấy tên này).
   - **App contact email**: email của bạn.
   - **Business Portfolio**: nếu có sẵn Business Manager thì chọn, chưa có thì để Facebook tự tạo mới.
6. Bấm **Create App**. Facebook có thể yêu cầu nhập lại mật khẩu để xác nhận — nhập và tiếp tục.
7. Sau khi tạo xong, bạn sẽ vào **App Dashboard** (trang quản trị App) — đây là nơi bạn sẽ quay lại nhiều lần trong các bước sau.

### Bước 1.2 — Thêm sản phẩm "Facebook Login"

1. Trong App Dashboard, ở cột trái tìm mục **Add Products** (hoặc **Add Product to Your App**).
2. Tìm thẻ **Facebook Login** → bấm **Set Up**.
3. Ở màn hỏi nền tảng, chọn **Web** (hoặc bấm bỏ qua/Skip nếu Facebook chỉ hỏi để gợi ý SDK — không bắt buộc cài SDK).
4. Sau khi thêm xong, ở cột trái sẽ xuất hiện mục **Facebook Login** → bấm vào → chọn **Settings**.
5. Tìm ô **Valid OAuth Redirect URIs** → dán **CẢ HAI** URL sau (đăng ký cả hai để tránh lỗi "URL blocked" tùy đường dẫn popup đi qua proxy hay không):

   ```
   https://antiantiai.xyz/balabot/api/facebook-oauth/callback
   https://antiantiai.xyz/api/facebook-oauth/callback
   ```

6. Kéo xuống dưới, bấm **Save Changes** (Lưu thay đổi).

> Lưu ý: URL này phải copy dán **chính xác từng ký tự**, kể cả chữ hoa/thường, không thêm dấu `/` ở cuối.

### Bước 1.3 — Thêm sản phẩm "Messenger" và cấu hình Webhook

1. Vẫn trong App Dashboard, cột trái → **Add Products** → tìm thẻ **Messenger** → bấm **Set Up**.
2. Sau khi thêm xong, cột trái xuất hiện mục **Messenger** → bấm vào → chọn **Settings**.
3. Tìm mục **Webhooks** → bấm **Add Callback URL** (hoặc **Edit Callback URL** nếu đã có sẵn từ trước).
4. Điền đúng 2 ô sau:
   - **Callback URL**:
     ```
     https://antiantiai.xyz/balabot/api/facebook-webhook
     ```
   - **Verify Token**: nhập đúng giá trị đang đặt ở biến môi trường `FACEBOOK_VERIFY_TOKEN` trên Railway (xem lại giá trị này trong Railway → project BalaBot → tab **Variables**). Nếu chưa có, tự đặt một chuỗi bí mật bất kỳ (ví dụ `balabot-verify-2026-xyz`) rồi lưu đúng chuỗi đó vào cả 2 nơi: Railway Variables và ô Verify Token này.
5. Bấm **Verify and Save**. Nếu Facebook báo lỗi "The URL couldn't be validated" — kiểm tra lại: Railway service đang chạy (không bị sleep/lỗi), Verify Token gõ đúng, Callback URL đúng chính tả. Webhook chỉ cần 1 URL: thử URL trên trước; nếu verify vẫn lỗi thì dùng `https://antiantiai.xyz/api/facebook-webhook` thay thế.
6. Sau khi verify thành công, cuộn xuống mục **Webhook Fields** (hoặc **Subscribe to fields**) → tick chọn 2 mục:
   - `messages`
   - `messaging_postbacks`
7. Bấm **Save**.

### Bước 1.4 — Lấy App ID và App Secret

1. Cột trái → **Settings** → **Basic**.
2. Bạn sẽ thấy:
   - **App ID**: một dãy số, ví dụ `1234567890123456`.
   - **App Secret**: mặc định bị ẩn (hiện chữ `••••`), bấm nút **Show** → Facebook có thể yêu cầu nhập lại mật khẩu → sau đó hiện ra chuỗi ký tự (ví dụ `a1b2c3d4e5f6...`).
3. Copy 2 giá trị này lại (dán tạm vào Notepad, đừng gửi qua chat công khai).

### Bước 1.5 — Đặt biến môi trường trên Railway

1. Vào `https://railway.app/` → đăng nhập → chọn project BalaBot (service backend).
2. Bấm tab **Variables**.
3. Bấm **New Variable**, tạo lần lượt:
   - `FACEBOOK_APP_ID` = giá trị App ID vừa copy ở Bước 1.4.
   - `FACEBOOK_APP_SECRET` = giá trị App Secret vừa copy ở Bước 1.4.
4. Bấm **Save/Deploy** (Railway sẽ tự động deploy lại service với biến môi trường mới — chờ vài phút tới khi trạng thái là **Active/Success**).

> Đối chiếu nhanh với `.env.example` trong repo: 2 dòng mới thêm là
> ```
> FACEBOOK_APP_ID=
> FACEBOOK_APP_SECRET=
> ```
> đây chỉ là file mẫu tham khảo, giá trị thật luôn đặt trên Railway (không commit giá trị thật vào Git).

Đến đây, **Phần 1 hoàn tất** — Meta App đã sẵn sàng nhận kết nối Fanpage.

---

## Phần 2: Mời khách pilot làm Tester (mỗi khách 1 lần)

Vì Meta App còn ở chế độ **Development** (chưa qua App Review), chỉ những tài khoản Facebook được mời làm **Tester** mới bấm kết nối được. Với mỗi khách pilot mới, làm theo các bước sau.

### Bước 2.1 — Chủ dự án: thêm khách vào danh sách Tester

1. Vào App Dashboard của App đã tạo ở Phần 1.
2. Cột trái → **App Roles** → **Roles**.
3. Bấm **Add People** (Thêm người).
4. Chọn vai trò **Tester**.
5. Nhập **username Facebook** hoặc **email** hoặc **link profile Facebook** của khách (khách cần cho bạn biết thông tin này trước).
6. Bấm **Submit**. Facebook sẽ gửi lời mời tới tài khoản Facebook của khách.

### Bước 2.2 — Hướng dẫn gửi khách pilot (2 phút)

Gửi đúng 4 bước sau cho khách (copy nguyên văn qua Zalo/tin nhắn):

1. Vào `developers.facebook.com/settings` (mục **Requests**) → bấm **Accept** để nhận lời mời làm Tester.
2. Vào dashboard BalaBot → tab **Facebook**.
3. Bấm nút **"Kết nối Facebook (1 chạm)"**.
4. Đăng nhập Facebook (nếu được hỏi) → chọn Fanpage muốn kết nối → bấm **Cho phép** (Allow).

Xong — popup sẽ báo "✅ Kết nối thành công" và dashboard hiển thị tên Fanpage đã kết nối. Nếu khách không thấy lời mời Tester, kiểm tra lại đúng tài khoản Facebook bạn đã nhập ở Bước 2.1 khớp với tài khoản khách dùng để đăng nhập.

> Lưu ý: nếu khách quản lý từ 2 Fanpage trở lên, hệ thống sẽ hiện màn cho khách chọn đúng Page cần kết nối trước khi hoàn tất.

---

## Phần 3: Track dài hạn — xin App Review để bỏ bước mời Tester

Khi việc kinh doanh đã ổn định và có **hộ kinh doanh / pháp nhân** đăng ký, nên chuyển App sang chế độ **Live** để bất kỳ khách nào cũng tự kết nối được, không cần chủ dự án mời Tester từng người.

Các bước tổng quát (làm khi cần, không gấp):

1. **Meta Business Verification**: vào Business Settings trên Meta Business Suite → xác minh danh tính doanh nghiệp (cần giấy phép kinh doanh/hộ kinh doanh, thông tin liên hệ công ty).
2. **App Review**: trong App Dashboard → **App Review** → **Permissions and Features** → xin cấp **Advanced Access** cho 3 quyền:
   - `pages_messaging`
   - `pages_show_list`
   - `pages_manage_metadata`
   
   Với mỗi quyền, Meta yêu cầu quay video demo ngắn cho thấy tính năng dùng quyền đó (ví dụ: video bấm "Kết nối Facebook", chọn Page, sau đó bot trả lời tin nhắn Messenger) và mô tả use case bằng tiếng Anh.
3. Chờ Meta xét duyệt (thường 1–5 ngày làm việc, có thể lâu hơn nếu cần bổ sung thông tin).
4. Sau khi được duyệt, vào App Dashboard → chuyển công tắc App Mode từ **Development** sang **Live**.
5. Từ lúc này, **bỏ hẳn Phần 2** — bất kỳ khách nào cũng có thể tự bấm "Kết nối Facebook (1 chạm)" và cấp quyền mà không cần được mời làm Tester trước.

---

## Tổng hợp thông tin kỹ thuật (tra cứu nhanh)

| Mục | Giá trị |
|---|---|
| Redirect URI (Facebook Login → Settings) | `https://antiantiai.xyz/balabot/api/facebook-oauth/callback` VÀ `https://antiantiai.xyz/api/facebook-oauth/callback` (đăng ký cả hai) |
| Webhook Callback URL (Messenger → Settings) | `https://antiantiai.xyz/balabot/api/facebook-webhook` |
| Webhook Verify Token | giá trị env `FACEBOOK_VERIFY_TOKEN` trên Railway |
| Webhook Subscribe fields | `messages`, `messaging_postbacks` |
| Env cần đặt trên Railway | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` |

---

## Kiểm thử end-to-end (làm sau khi đã cấu hình Meta App + env)

Checklist thủ công dưới đây cần: Meta App đã cấu hình xong theo Phần 1, biến môi trường đã đặt trên Railway, và có ít nhất 1 tài khoản Facebook đã được mời làm Tester (Phần 2).

1. Bấm **"Kết nối Facebook (1 chạm)"** trên dashboard → popup đăng nhập Facebook hiện ra → chọn Page → popup báo **"✅ Kết nối thành công"** và tự đóng → dashboard hiển thị **"Đã kết nối: <tên Page>"**.
2. Nhắn tin vào Fanpage đó từ một tài khoản Facebook khác → bot trả lời tin nhắn trong Messenger.
3. Với tài khoản quản lý từ 2 Page trở lên: sau khi đăng nhập, hệ thống hiện màn cho chọn Page → chọn đúng Page cần dùng → kết nối đúng Page đã chọn.
4. Bấm **Hủy** (Cancel) ở màn Facebook hỏi cấp quyền → popup báo lỗi tiếng Việt, ví dụ **"Bạn đã từ chối cấp quyền..."**.
5. Vào Meta App Dashboard → Messenger → Settings → Webhooks → xác nhận URL chung `/api/facebook-webhook` đã verify thành công (Meta hiển thị trạng thái **Complete**).

Checklist này để **chủ dự án tự kiểm tra** sau khi hoàn tất cấu hình Meta App thật — không thực hiện được trong môi trường phát triển vì cần Meta App thật đang hoạt động (Development hoặc Live) và ít nhất một Fanpage thật để thao tác.
