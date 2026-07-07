# Hướng dẫn kết nối Fanpage qua Botcake — bản ASYNC (khuyến nghị)

Tài liệu này dành cho chủ shop / nhân viên vận hành, **không cần biết code**. Làm theo đúng thứ tự các phần bên dưới là xong. Cách này đã được kiểm chứng chạy thật với khách vãng lai.

Nếu bạn từng cấu hình theo bản cũ (đồng bộ, hoặc bản async đầu tiên có "flow trả lời") thì **giờ đơn giản hơn nhiều** — chỉ cần **Page ID + Access Token**, không cần tạo custom field hay flow trả lời nữa.

## 1. Vì sao dùng cách async (thay vì cách cũ)

Cách cũ (đồng bộ): khi khách nhắn tin, Botcake gửi tin đó cho BalaBot và **chờ tại chỗ** để nhận câu trả lời rồi hiển thị luôn cho khách. Nhưng Botcake chỉ chờ tối đa khoảng **5 giây**, trong khi bot cần khoảng **6–11 giây** để suy nghĩ và soạn câu trả lời. Kết quả: nhiều lúc Botcake "bỏ cuộc" chờ trước khi bot kịp trả lời xong, khách không nhận được gì.

Cách async (giải pháp này): khi khách nhắn tin, Botcake gửi tin cho BalaBot và **nhận phản hồi "đã nhận" ngay lập tức** (không phải chờ bot nghĩ xong). Sau đó, khi bot soạn xong câu trả lời (dù mất 6 hay 11 giây), BalaBot **chủ động gọi ngược lại Botcake** (qua Botcake Public API `send_content`) để **gửi thẳng** câu trả lời đó đến khách. Vì không còn giới hạn 5 giây, câu trả lời **luôn đến được tay khách**, chỉ chậm thêm vài giây khi bot cần nghĩ lâu.

Nói ngắn gọn: cách cũ có thể mất tin nhắn khi bot nghĩ hơi lâu; cách async không bao giờ mất tin nhắn.

## 2. Chuẩn bị trong Botcake

### 2.1 Tạo tài khoản + kết nối Page (nếu chưa làm)

Nếu Fanpage của bạn **chưa** kết nối vào Botcake: vào **botcake.io** → đăng nhập bằng Facebook → kết nối đúng Fanpage của shop → xác nhận cấp quyền.

Nếu Page **đã** kết nối vào Botcake từ trước, bỏ qua, đi thẳng xuống 2.2.

### 2.2 Lấy Page ID và tạo Access Token

1. Trong Botcake, vào **Cấu hình (Settings)** → mục **Tích hợp** (nằm trong nhóm HỆ THỐNG) — đây là nơi có API/Access Token.
2. Bấm **Tạo/Generate Token** để tạo một **Access Token** cho Page này. Copy và lưu cẩn thận — đây là chuỗi bí mật, **không chia sẻ ra ngoài**, và Botcake thường chỉ hiện đầy đủ token **một lần duy nhất** lúc tạo.
3. Lấy **Page ID**: cách nhanh nhất là mở một Luồng bất kỳ → bấm **"Chia sẻ Payload"**, bạn sẽ thấy một chuỗi dạng `__bc_<PageID>_<số>`. Dãy số **dài (16 chữ số)** ngay sau `__bc_` chính là **Page ID**.

Vậy là xong phần Botcake — bạn có trong tay **2 thông tin: Page ID** và **Access Token**.

## 3. Nhập vào BalaBot

1. Đăng nhập **BalaBot dashboard**, chọn đúng bot dùng cho Fanpage này.
2. Vào tab **Tích hợp Facebook**.
3. Tìm card **"Kết nối Fanpage qua Botcake"**.
4. Nếu chưa từng bấm trước đó, bấm **"Tạo / Hiện Bridge URL"** để card hiện đầy đủ các ô nhập.
5. Ở mục **"Cấu hình gửi trả lời (Botcake API)"**, điền:
   - **Page ID (Botcake)** → dán Page ID lấy ở 2.2.
   - **Access token** → dán Access Token lấy ở 2.2.
6. Bấm **"Lưu cấu hình Botcake"**. Thấy báo lưu thành công là xong.
7. Ở phần trên của card, tìm ô **"Bridge URL (async — khuyến nghị)"**, bấm **"Copy URL"**. Link này là **bí mật riêng của bot bạn**, không chia sẻ cho người ngoài.

Lưu ý: lần sau quay lại card này, ô **Access token** sẽ hiện placeholder "••• access-token đã lưu" — cứ để trống nếu không muốn đổi token (bấm Lưu vẫn giữ token cũ).

## 4. Cấu hình Tin nhắn mặc định trong Botcake

Đây là bước quan trọng nhất — nơi Botcake chuyển tin của khách sang cho BalaBot.

1. Trong Botcake, menu trái → **Automation → Tin nhắn mặc định** (Default Reply) — kịch bản chạy khi khách nhắn vào Page.
2. Ở góc trên, gạt công tắc sang chế độ **"Mặc định"** (TẮT chế độ "AI"). Nếu để ở chế độ "AI", tin của khách sẽ do AI của Botcake xử lý và **không bao giờ** gọi sang BalaBot.
3. Bấm **"Chỉnh sửa"** → trong khối **"Nội dung"**, thêm một phần tử **JSON API / Dynamic Block** (khối gọi API ngoài) với:
   - **Method**: `POST`
   - **URL**: dán **Bridge URL (async)** đã copy ở Phần 3, bước 7 (dạng `.../api/bridge/botcake-async/bot-...?key=...` — phải có đủ phần `?key=...` ở cuối).
   - **Body** (JSON):

     ```json
     { "text": "{{last_text_input}}", "psid": "{{psid}}", "name": "{{user_full_name}}" }
     ```

     Khi gõ `{{` trong ô Body, Botcake gợi ý danh sách biến thật — chọn đúng: tin nhắn gần nhất của khách → `text`; PSID/messenger user id → `psid`; họ tên khách → `name`.
4. **KHÔNG cần** bật "Save Respond" và **KHÔNG cần** thêm khối văn bản trả lời — bot tự gửi câu trả lời sau qua Botcake API (`send_content`). Response của Bridge URL cố tình rỗng (`{"messages":[]}`) là **đúng thiết kế**.
5. Bật các tuỳ chọn phía trên: **"Gửi không giới hạn"**, **"Gửi ngay lập tức"**, và **"Kích hoạt"** toàn bộ Tin nhắn mặc định.
6. Bấm **Lưu**.

## 5. Test thử

1. Dùng một tài khoản Facebook **khác** (không phải admin của Page) nhắn tin vào Fanpage.
2. Chờ vài giây (có thể lâu hơn chút nếu câu hỏi phức tạp).
3. Bot BalaBot sẽ trả lời thẳng trong Messenger — nếu đúng nội dung đã huấn luyện, kết nối async đã chạy tốt.

## 6. Lỗi thường gặp

BalaBot có endpoint chẩn đoán (dành cho dev): `GET /api/bots/<botId>/botcake-debug?key=<bridgeKey>` — trả về lần Botcake gọi vào gần nhất (`inbound`) và kết quả `send_content` gần nhất (`send`), **không lộ access token**. Dựa vào đó:

- **`inbound` là `null`** → Botcake **chưa gọi được** đến BalaBot. Kiểm tra: Tin nhắn mặc định đã ở chế độ **"Mặc định"** (không phải AI), đã **Kích hoạt** và **Lưu** chưa; **Bridge URL** trong khối JSON API có đủ `?key=...` ở cuối không.
- **`send.stage` = `"thiếu-cấu-hình"`** → thiếu **Page ID** hoặc **Access Token** trong card Botcake ở dashboard. Quay lại Phần 3 lưu lại.
- **`send.stage` = `"send_content_fail"`** → BalaBot đã gọi Botcake nhưng bị từ chối; xem `send.botcakeResponse` để biết lý do (sai/hết hạn **Access Token**, sai **Page ID**, hoặc psid không hợp lệ). Gửi nguyên văn cho dev.
- **`send.stage` = `"send_content_ok"`** nhưng khách vẫn không thấy → hiếm; kiểm tra khách có nằm ngoài cửa sổ 24h của Messenger không.

Ngoài ra dev có thể mở **Railway Deploy Logs**, tìm dòng `[Botcake Async]` cho thông tin tương tự.

## 7. Ghi chú vận hành (dành cho chủ dự án)

**Migration Supabase:** trước khi dùng thật, chạy tay `botcakeAsync.sql` trên Supabase (thêm cột `botcakePageId`, `botcakeAccessToken` vào bảng `bots`; cột `botcakeReplyFlowId` không còn dùng nhưng để lại vô hại). Nếu quên, cấu hình ở Phần 3 vẫn lưu được trong phiên hiện tại nhưng **mất khi server restart** (sau mỗi lần deploy).

**Cơ chế gửi trả lời:** BalaBot dùng Botcake Public API `send_content` (`POST /public_api/v1/pages/<pageId>/flows/send_content`, header `access-token`, body `{ psid, data: { version: "v2", content: { messages: [{ type: "text", text }] } } }`) để đẩy thẳng câu trả lời. Không cần flow trung gian hay custom field. Text dài được tự cắt thành nhiều tin ≤1800 ký tự. Hàm build nằm ở `botcakeAsync.ts::buildSendContentRequest`.
