# Hướng dẫn kết nối Fanpage qua Botcake — bản ASYNC (khuyến nghị)

Tài liệu này dành cho chủ shop / nhân viên vận hành, **không cần biết code**. Đây là bản nâng cấp của kết nối Botcake cũ (bản "đồng bộ") — làm theo đúng thứ tự các phần bên dưới là xong.

Nếu bạn đã lỡ cấu hình theo bản cũ (đồng bộ) rồi, không sao — chỉ cần làm lại từ Phần 2 với vài bước bổ sung là chuyển sang bản async ngay, không cần huỷ kết nối Page khỏi Botcake.

## 1. Vì sao dùng cách async (thay vì cách cũ)

Cách cũ (đồng bộ): khi khách nhắn tin, Botcake gửi tin nhắn đó cho BalaBot và **chờ tại chỗ** để nhận câu trả lời rồi hiển thị luôn cho khách. Vấn đề là Botcake chỉ chờ tối đa khoảng **5 giây**, trong khi bot BalaBot cần khoảng **6–11 giây** để suy nghĩ và soạn câu trả lời (nhất là khi câu hỏi phức tạp hoặc cần tra cứu nhiều dữ liệu). Kết quả: nhiều lúc Botcake "bỏ cuộc" chờ trước khi bot kịp trả lời xong, khách không nhận được tin nhắn nào, dù bot vẫn đang trả lời phía sau (chỉ là trả lời "vào chỗ không ai nhận" vì Botcake đã ngừng chờ).

Cách async (giải pháp này): khi khách nhắn tin, Botcake gửi tin nhắn cho BalaBot và **nhận phản hồi "đã nhận" ngay lập tức** (không phải chờ bot nghĩ xong). Sau đó, khi nào bot soạn xong câu trả lời (dù mất 6 giây hay 11 giây), BalaBot sẽ **chủ động gọi ngược lại Botcake** để đẩy câu trả lời đó đến khách qua một "flow trả lời" riêng. Vì không còn giới hạn 5 giây chờ nữa, câu trả lời của bot **luôn luôn đến được tay khách**, chỉ chậm thêm vài giây so với cách cũ trong những lúc bot cần nghĩ lâu.

Nói ngắn gọn: cách cũ có thể mất tin nhắn khi bot nghĩ hơi lâu; cách async không bao giờ mất tin nhắn, chỉ là thỉnh thoảng khách chờ thêm vài giây.

## 2. Chuẩn bị trong Botcake

### 2.1 Tạo tài khoản + kết nối Page (nếu chưa làm)

Nếu Fanpage của bạn **chưa** được kết nối vào Botcake, làm như hướng dẫn cũ: vào **botcake.io** → đăng nhập bằng Facebook → kết nối đúng Fanpage của shop → xác nhận cấp quyền. (Xem chi tiết ở tài liệu `docs/botcake-bridge-guide.md`, mục 2 — Bước 1 và Bước 2, không đổi gì ở phần này.)

Nếu Page **đã** kết nối vào Botcake từ trước (dùng cách cũ), bỏ qua bước này, đi thẳng xuống 2.2.

### 2.2 Tạo custom field `bot_reply`

Đây là "ô chứa" để Botcake giữ tạm câu trả lời của bot trước khi hiển thị cho khách.

1. Trong Botcake, tìm mục quản lý **Custom Field** (thường nằm trong phần quản lý User/Contact hoặc Cài đặt của Page).
2. Kiểm tra xem đã có field tên **`bot_reply`** chưa. Nếu chưa có, bấm **Tạo mới (Add/Create Field)**:
   - Loại field: **User Field** (trường gắn với người dùng/khách hàng).
   - Kiểu dữ liệu: **Chuỗi ký tự** (Text/String).
   - Tên field: gõ chính xác **`bot_reply`** (viết liền, chữ thường, có dấu gạch dưới).
3. Lưu lại.

Nếu Botcake đã có sẵn field `bot_reply` từ trước (ví dụ do làm thử), không cần tạo lại.

### 2.3 Tạo một Flow trả lời riêng

Đây là kịch bản Botcake sẽ chạy để **hiển thị** câu trả lời của bot cho khách, tách riêng khỏi luồng nhận tin nhắn.

1. Trong Botcake, vào mục tạo **Flow** mới (thường ở mục Automation hoặc Flow Builder).
2. Đặt tên dễ nhận biết, ví dụ: `Trả lời bot BalaBot`.
3. Trong flow này, chỉ cần thêm **đúng 1 khối Văn bản (Text block)** duy nhất.
4. Trong khối văn bản đó, chèn biến **`{{bot_reply}}`** (gõ `{{` để Botcake gợi ý, chọn đúng field `bot_reply` vừa tạo ở bước 2.2) — nội dung khối chỉ cần đúng biến này, không cần thêm chữ gì khác xung quanh (trừ khi bạn muốn thêm lời chào/ký hiệu riêng theo phong cách shop, tuỳ chọn).
5. **Lưu** flow lại.
6. Lấy **Flow ID** của flow vừa tạo: thường nằm ngay trên thanh địa chỉ (URL) trình duyệt khi bạn đang mở flow này để chỉnh sửa (một dãy số/ký tự trong đường link), hoặc vào danh sách flow → mở chi tiết flow → tìm ID hiển thị ở đó. Ghi lại Flow ID này, sẽ dùng ở Phần 3.

### 2.4 Lấy Page ID và tạo Access Token

1. Trong Botcake, vào **Cài đặt (Settings)** → mục **API**.
2. Tìm và ghi lại **Page ID** của Fanpage (mã số định danh Page trong Botcake).
3. Bấm **Generate Token** (Tạo token) để tạo một **Access Token** mới cho Page này. Copy và lưu token này lại cẩn thận — đây là chuỗi bí mật, không chia sẻ ra ngoài, và Botcake thường chỉ hiện đầy đủ token **một lần duy nhất** lúc tạo.

Vậy là xong phần chuẩn bị bên Botcake — bạn đang có trong tay 3 thông tin: **Page ID**, **Flow ID** (của flow trả lời vừa tạo), **Access Token**.

## 3. Nhập vào BalaBot

1. Đăng nhập **BalaBot dashboard**, chọn đúng bot dùng cho Fanpage này.
2. Vào tab **Facebook**.
3. Tìm card **"Kết nối Fanpage qua Botcake"**.
4. Nếu chưa từng bấm trước đó, bấm **"Tạo / Hiện Bridge URL"** để card hiện đầy đủ các ô nhập.
5. Điền vào 3 ô trong mục **"Cấu hình gửi trả lời (Botcake API)"**:
   - **Page ID (Botcake)** → dán Page ID lấy ở bước 2.4.
   - **Flow ID của flow trả lời** → dán Flow ID lấy ở bước 2.3.
   - **Access token** → dán Access Token lấy ở bước 2.4.
6. Bấm nút **"Lưu cấu hình Botcake"**. Thấy thông báo lưu thành công là xong phần nhập liệu.
7. Ở phần trên của card, tìm ô **"Bridge URL (async — khuyến nghị)"**, bấm **"Copy URL"** để sao chép link này vào bộ nhớ tạm — link này là bí mật riêng của bot bạn, không chia sẻ cho người ngoài.

Lưu ý: lần sau nếu bạn quay lại card này, ô **Access token** sẽ hiện placeholder dạng "••• access-token đã lưu" — cứ để trống ô đó nếu không muốn đổi token (bấm Lưu vẫn giữ nguyên token cũ, không bị xoá).

## 4. Cấu hình Default Reply trong Botcake (Dynamic Block)

1. Trong Botcake, vào **Automation** → **Default Reply** (Tin nhắn mặc định) — kịch bản chạy khi khách nhắn tin vào Page.
2. Thêm/chỉnh một block loại **Dynamic Block** (có nơi gọi là "Dynamic content" hoặc "JSON API" — cùng bản chất, gọi ra một địa chỉ API bên ngoài).
3. Khai báo trong block đó:
   - **Method**: `POST`
   - **URL**: dán **Bridge URL (async)** vừa copy ở Phần 3, bước 7.
   - **Body** (định dạng JSON):

     ```json
     { "text": "{{last_text_input}}", "psid": "{{psid}}", "name": "{{user_full_name}}" }
     ```

     Đây là tên gợi ý — khi gõ dấu `{{` trong ô Body, Botcake sẽ hiện danh sách biến thật để bạn chọn (tên hiển thị có thể khác chút tuỳ giao diện). Chọn đúng:
     - Biến "tin nhắn cuối/tự do gần nhất của khách" → gán vào `text`.
     - Biến "PSID/messenger user id" → gán vào `psid`.
     - Biến "họ tên đầy đủ của khách" → gán vào `name`.

4. **Khác với cách cũ**: ở cách async này, block **KHÔNG cần** bật "Save Respond" và **KHÔNG cần** thêm khối văn bản hiển thị câu trả lời ngay sau Dynamic Block — vì bot sẽ **tự động gửi trả lời sau** thông qua flow riêng đã tạo ở Phần 2.3 (Botcake gọi đây là "gọi ngược"/webhook đẩy dữ liệu vào field `bot_reply` rồi tự chạy flow trả lời), không cần Default Reply hiển thị gì thêm ngay lúc này.
5. Bật các tuỳ chọn:
   - **"Gửi không giới hạn"** (không giới hạn số lần/đối tượng).
   - **"Ngay lập tức"** (gửi/gọi API ngay khi có tin nhắn, không delay).
   - **Kích hoạt (Enable/Turn on)** toàn bộ Default Reply.
6. Bấm **Lưu**.

## 5. Test thử

1. Dùng một tài khoản Facebook **khác** (không phải tài khoản admin của Page) nhắn tin vào Fanpage.
2. Chờ vài giây (bình thường vài giây, có thể lâu hơn một chút nếu câu hỏi phức tạp).
3. Bot BalaBot sẽ trả lời — nếu thấy đúng nội dung bot đã huấn luyện, vậy là kết nối async đã chạy tốt.

## 6. Lỗi thường gặp

Khi không thấy bot trả lời, nhờ đội kỹ thuật BalaBot mở **Railway Deploy Logs**, tìm các dòng bắt đầu bằng **`[Botcake Async]`**:

- **"chưa cấu hình gửi lại"** (đầy đủ: *"Bot ... chưa cấu hình gửi lại — không thể trả lời."* hoặc *"... thiếu cấu hình gửi lại (pageId/accessToken/replyFlowId)."*) → thiếu một trong 3 ô: **Page ID**, **Flow ID**, hoặc **Access Token** chưa được lưu đúng trong card Botcake ở dashboard BalaBot. Quay lại Phần 3, kiểm tra và lưu lại đủ cả 3 ô.
- **"send_flow thất bại (HTTP ...)"** → BalaBot đã cố gửi trả lời qua Botcake nhưng bị Botcake từ chối. Nguyên nhân thường gặp: sai **Access Token** (token hết hạn/không đúng Page), sai **Page ID**, sai **Flow ID**, hoặc định dạng dữ liệu gửi đi không khớp với những gì Botcake mong đợi. Gửi **nguyên văn dòng log này** cho dev để kiểm tra và xử lý.
- **Không thấy dòng log nào cả** (kể cả 2 loại trên) → nghĩa là Botcake **chưa gọi được** đến BalaBot. Kiểm tra lại: Default Reply trong Botcake đã **Bật (Enable)** và **Lưu** chưa; **Bridge URL** dán vào Dynamic Block có đủ phần **`?key=...`** ở cuối không (thiếu phần này bot sẽ từ chối xử lý).

## 7. Bước kiểm chứng lần đầu (dành cho chủ dự án)

Trước khi bàn giao cho khách hàng thật dùng chính thức:

1. Làm đủ Phần 2 → Phần 5 với **một Fanpage test** (không phải Page khách hàng thật), dùng token/Page ID/Flow ID thật của Page test đó.
2. Nhắn thử vài tin nhắn khác nhau (kể cả câu hỏi cần bot nghĩ hơi lâu, để kiểm tra đúng tình huống async giải quyết) vào Page test bằng một tài khoản Facebook phụ.
3. Mở **Railway Deploy Logs**, xác nhận thấy dòng **`[Botcake Async] Đã gửi trả lời cho psid ... (bot ...).`** xuất hiện sau mỗi tin nhắn test — dòng này nghĩa là lệnh gọi `send_flow` đã được Botcake xác nhận thành công (`HTTP 200`, không có `success: false`/`error` trong phản hồi).
4. Nếu khách (tài khoản test) **không nhận được** tin nhắn trả lời dù log báo "Đã gửi trả lời" thành công: nhiều khả năng flow trả lời ở Botcake (Phần 2.3) đang map sai field — ví dụ khối văn bản trong flow đang lấy biến khác thay vì `{{bot_reply}}`, hoặc field `bot_reply` bị đặt sai kiểu/sai tên. Kiểm tra lại đúng Phần 2.2 và 2.3. Nếu vẫn không ra, báo dev kiểm tra hàm `buildSendFlowRequest` (trong `botcakeAsync.ts`) — đây là nơi build đúng payload `{ psid, flow_id, payload: { bot_reply: <câu trả lời> } }` gửi lên Botcake, có thể Botcake yêu cầu payload map field khác `bot_reply` và cần chỉnh lại tên field cho khớp.
5. Chỉ sau khi kiểm chứng thành công với Page test, mới hướng dẫn khách hàng thật tự làm theo Phần 2 → Phần 5 cho Fanpage của họ.

**Lưu ý vận hành:** trước khi đưa vào dùng thật, chủ dự án cần chạy tay migration `botcakeAsync.sql` trên Supabase (thêm 3 cột `botcakePageId`, `botcakeAccessToken`, `botcakeReplyFlowId` vào bảng `bots`). Nếu quên bước này, việc lưu cấu hình ở Phần 3 vẫn chạy được trong phiên hiện tại nhưng dữ liệu sẽ **mất khi server khởi động lại** (ví dụ sau mỗi lần deploy), buộc phải nhập lại cả 3 ô từ đầu.
