# Hướng dẫn kết nối Fanpage qua Botcake bridge

Tài liệu này dành cho chủ shop / nhân viên vận hành, **không cần biết code**. Làm theo đúng thứ tự 5 bước bên dưới là xong.

## 1. Botcake bridge là gì, khi nào dùng

BalaBot trả lời khách trên Fanpage Facebook theo 2 hướng:

- **Kết nối trực tiếp (1 chạm)**: nhanh và gọn nhất, nhưng phải chờ Meta (Facebook) duyệt ứng dụng (App Review) thì mới dùng được cho **mọi khách vãng lai**. Trong lúc chờ duyệt, kết nối trực tiếp chỉ trả lời được cho vài tài khoản test do chính đội BalaBot khai báo trước — không dùng được cho khách thật.
- **Botcake bridge (giải pháp này)**: Botcake là một nền tảng chatbot bên thứ ba đã được Meta duyệt sẵn app từ trước. BalaBot "mượn" đường kết nối đã duyệt đó của Botcake để trả lời khách ngay hôm nay, **không phải chờ gì cả**, và trả lời được cho **mọi khách vãng lai** nhắn vào Fanpage.

Nói đơn giản: Botcake là cây cầu tạm để bot của bạn hoạt động ngay trong lúc chờ Facebook duyệt xong kết nối trực tiếp. Khi nào kết nối trực tiếp được duyệt, bạn có thể chuyển hẳn sang dùng kết nối trực tiếp và tắt Botcake đi (không bắt buộc phải đổi ngay, hai cách có thể chạy song song).

Botcake **miễn phí** ở mức dùng cơ bản, chỉ cần đăng ký bằng tài khoản Facebook — không cần thẻ ngân hàng.

## 2. 5 bước cài đặt cho 1 Fanpage

### Bước 1 — Tạo tài khoản Botcake

1. Vào trang **botcake.io**.
2. Bấm nút đăng ký/đăng nhập, chọn **đăng nhập bằng Facebook**.
3. Cho phép Botcake truy cập theo yêu cầu hiện ra (đây là bước chuẩn để Botcake biết bạn là ai, chưa liên quan đến Fanpage).

### Bước 2 — Kết nối Fanpage vào Botcake

1. Trong Botcake, tìm nút **kết nối Page** (thường ở màn hình chính sau khi đăng nhập, hoặc trong mục quản lý Page/kênh).
2. Chọn đúng Fanpage của shop bạn từ danh sách Page mà tài khoản Facebook của bạn đang quản trị.
3. Xác nhận cấp quyền cho Botcake quản lý tin nhắn của Page đó. Nút này của Botcake dùng app đã được Meta duyệt sẵn, nên hiện đầy đủ với mọi tài khoản, không bị giới hạn như kết nối trực tiếp của BalaBot.

### Bước 3 — Lấy Bridge URL từ BalaBot

1. Đăng nhập vào **BalaBot dashboard**.
2. Chọn đúng bot muốn dùng cho Fanpage này, vào tab **Facebook**.
3. Tìm card **"Kết nối Fanpage qua Botcake"**.
4. Bấm nút **"Tạo / Hiện Bridge URL"**.
5. Bấm **Copy** để sao chép đường link này vào bộ nhớ tạm (clipboard) — link này là bí mật riêng của bot bạn, không chia sẻ cho người ngoài.

### Bước 4 — Cấu hình Dynamic Block trong Botcake

1. Trong Botcake, vào mục **Automation** (tự động hoá).
2. Chọn **Default Reply** (Trả lời mặc định) — đây là kịch bản chạy cho mọi tin nhắn khách gửi vào.
3. Xoá nội dung mẫu có sẵn (nếu có).
4. Thêm một block mới, chọn loại **Dynamic Block** (có nơi Botcake gọi là "Dynamic content" hoặc "JSON API" — tuỳ phiên bản giao diện, bản chất là cùng một loại block gọi ra một địa chỉ API bên ngoài).
5. Trong block đó, khai báo:
   - **Method**: `POST`
   - **URL**: dán Bridge URL đã copy ở Bước 3.
   - **Body** (định dạng JSON), điền đúng nội dung sau:

   ```json
   { "text": "{{last user freeform input}}", "psid": "{{messenger user id}}", "name": "{{full name}}" }
   ```

   Ghi chú quan trọng: `{{last user freeform input}}`, `{{messenger user id}}`, `{{full name}}` là **tên gợi ý** — khi bạn gõ dấu `{{` trong ô Body, Botcake sẽ hiện ra danh sách biến có sẵn để bạn chọn, tên hiển thị thật trong giao diện Botcake có thể khác chút so với tên gợi ý ở trên. Hãy chọn:
   - Biến ứng với **"tin nhắn cuối của khách" / "tin nhắn tự do gần nhất"** → gán vào `text`.
   - Biến ứng với **"messenger user id" / "PSID"** → gán vào `psid`.
   - Biến ứng với **họ tên đầy đủ của khách** → gán vào `name`.

   Nếu không chắc chắn tên biến nào đúng, cứ chọn biến có vẻ gần nghĩa nhất và làm tiếp Bước 5 — nếu bot chưa hiểu đúng, xem mục 5 "Bước kiểm chứng thực tế lần đầu" bên dưới để xử lý, **không cần dừng lại chờ**. Bridge của BalaBot đã được thiết kế để tự nhận diện nhiều tên biến phổ biến khác nhau.

6. Lưu block lại.

### Bước 5 — Bật và kiểm thử

1. Bật (Enable/Turn on) **Default Reply** cho **mọi tin nhắn** (không giới hạn theo từ khoá, không giới hạn theo đối tượng).
2. Bấm **Lưu**.
3. Dùng một tài khoản Facebook bất kỳ (khác tài khoản admin), nhắn thử vào Fanpage.
4. Bot BalaBot sẽ trả lời trong vài giây. Nếu có trả lời đúng nội dung bot đã huấn luyện — vậy là xong, kết nối hoạt động.

## 3. Lỗi thường gặp

**Không thấy bot trả lời:**
- Kiểm tra lại **Default Reply** trong Botcake đã **Bật (Enable)** chưa, và đã **Lưu** chưa.
- Kiểm tra Bridge URL dán vào Botcake có đủ phần `?key=...` ở cuối không (đây là phần bắt buộc, nếu thiếu bot sẽ từ chối trả lời).
- Nhờ đội kỹ thuật BalaBot xem giúp **Railway Deploy Logs**, tìm dòng bắt đầu bằng `[Botcake Bridge]` — dòng này cho biết Botcake đang gửi dữ liệu gì lên, giúp xác định lỗi nằm ở đâu.

**Bot báo "Bridge key không hợp lệ":**
- Bridge URL cũ đã bị đổi (do ai đó bấm đổi key, hoặc do bảo mật). Vào lại BalaBot dashboard → tab Facebook → card Botcake → bấm **"Tạo / Hiện Bridge URL"** để lấy URL mới nhất, copy và dán lại đúng URL này vào Dynamic Block trong Botcake (thay cho URL cũ), sau đó Lưu lại.

**Bot trả lời chậm (hơn 10 giây):**
- Báo ngay cho đội BalaBot để kiểm tra hệ thống. Đây không phải hiện tượng bình thường.

## 4. Giới hạn của giải pháp Botcake bridge

- Chỉ hỗ trợ **tin nhắn văn bản** (khách gửi ảnh, video, file, sticker... bot sẽ không xử lý qua kênh này).
- Bot **không tự nhắn tin trước** cho khách — chỉ trả lời khi khách nhắn vào trước.
- Khi nhân viên muốn **trả lời tay** (không dùng bot) cho một khách cụ thể, dùng tính năng **Livechat của Botcake** để nhắn trực tiếp như bình thường.
- **Lịch sử hội thoại** của khách qua kênh Botcake vẫn được lưu và xem lại đầy đủ trong BalaBot dashboard (mục hội thoại/chat), như các kênh khác.

## 5. Bước kiểm chứng thực tế lần đầu (dành cho chủ dự án)

Trước khi bàn giao cho khách hàng thật dùng chính thức, chủ dự án cần tự tay làm một lượt kiểm chứng:

1. Làm đủ Bước 1 → Bước 5 ở mục 2 với **một Fanpage test** (không phải Page khách hàng thật).
2. Nhắn thử vài tin nhắn khác nhau vào Page test bằng một tài khoản Facebook phụ.
3. Nếu bot trả lời đúng như mong đợi — kết nối đã ổn, ghi nhận lại tên biến thực tế đã chọn trong Dynamic Block (ở Bước 4) để cập nhật chính xác vào tài liệu này, thay cho phần ghi chú "chọn biến gần nghĩa nhất".
4. Nếu bot **không hiểu tin nhắn** (trả lời sai, trả lời rỗng, hoặc báo lỗi chung chung): mở **Railway Deploy Logs**, tìm dòng `[Botcake Bridge] payload keys:` — dòng này liệt kê chính xác tên các trường dữ liệu (field) mà Botcake vừa gửi lên. Gửi lại đúng nội dung dòng log này cho dev để bổ sung vào danh sách tên trường mà endpoint đang tự động nhận diện (endpoint đã hỗ trợ sẵn nhiều tên trường phổ biến như `text`/`message`/`last_input`/`last_user_input`, `psid`/`sender_id`/`messenger_user_id`/`user_id`, `name`/`full_name`/`first_name`+`last_name`, nhưng Botcake có thể dùng tên khác chưa nằm trong danh sách này).
5. Chỉ sau khi kiểm chứng thành công với Page test, mới hướng dẫn khách hàng thật tự làm theo 5 bước ở mục 2 cho Fanpage của họ.

**Lưu ý vận hành:** trước khi đưa vào dùng thật, chủ dự án cần chạy tay migration `botcakeBridge.sql` trên Supabase (thêm cột lưu bridge key vào database). Nếu quên bước này, Bridge URL vẫn hoạt động bình thường (key được giữ tạm trong bộ nhớ RAM của server) nhưng **sẽ mất khi server khởi động lại** (ví dụ sau mỗi lần deploy), khiến URL cũ ngừng hoạt động và phải tạo lại từ đầu.
