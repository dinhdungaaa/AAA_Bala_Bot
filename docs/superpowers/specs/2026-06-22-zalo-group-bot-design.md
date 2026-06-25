# Thiết kế: Zalo Group Bot (trợ lý trả lời trong nhóm Zalo)

- **Ngày:** 2026-06-22
- **Trạng thái:** Đã duyệt thiết kế, chờ viết plan triển khai
- **Phạm vi:** Thêm khả năng để chatbot hiện có trả lời khách hàng trong **nhóm chat Zalo** 24/7

---

## 1. Bối cảnh & quyết định nền tảng

Hệ thống hiện tại là một Express monolith (`server.ts`, ~190KB) chạy trên **Render** (`balabot-server.onrender.com`), với Cloudflare Workers chỉ là lớp proxy/CDN phía trước. Backend đã hỗ trợ nhiều bot, mỗi bot có pipeline RAG (`generateRAGAnswer`), lưu hội thoại vào Supabase, và đã tích hợp **Telegram** + **Facebook Messenger** theo cùng một pattern: webhook verify (GET) + webhook live (POST) + `processXIncomingMessage()` + `sendXTextMessage()`.

### Giới hạn nền tảng quan trọng

**Zalo Official Account (OA) KHÔNG vào được group chat.** OA chỉ chat 1-1. Việc "bot ngồi trong nhóm trả lời mọi người" **không có API chính thức**.

### Quyết định

Người dùng chọn **Hướng B (không chính thức)**: dùng thư viện tự động hoá tài khoản Zalo cá nhân (`zca-js`) để một tài khoản cá nhân làm "bot" trong nhóm.

- **Rủi ro đã được chấp nhận:** vi phạm ToS Zalo, tài khoản có thể bị khoá, thư viện không chính thức nên dễ vỡ khi Zalo cập nhật. Khuyến nghị dùng **nick phụ**, không dùng số chính của doanh nghiệp.
- Đây là tự động hoá **tài khoản của chính người dùng** cho mục đích chăm sóc khách hàng của họ.

### Các quyết định đã chốt

| Hạng mục | Quyết định |
|---|---|
| Kênh | Bot trong group thật qua `zca-js` (Hướng B) |
| Hosting | Trong cùng server Render (Node luôn-bật) — **Phương án 1: module cùng process** |
| Khi nào trả lời | **Chỉ khi bot bị @mention HOẶC tin là reply vào tin của bot** |
| Nguồn kiến thức | Mỗi group **gán → 1 botId** có sẵn, dùng lại RAG của bot đó |
| Đăng nhập | **Quét QR** lần đầu, **lưu phiên vào Supabase**, tự khôi phục khi restart |

---

## 2. Kiến trúc

**Phương án 1 — module trong cùng server Render.** Listener `zca-js` chạy chung process với Express, gọi thẳng `generateRAGAnswer()`, `chatSessions`, Supabase (không HTTP nội bộ). Logic đặt trong file riêng `zaloGroupBot.ts` (KHÔNG nhét vào `server.ts` 190KB) và có "tường lửa lỗi" để listener sập không làm sập API.

### Thành phần

1. **`zaloGroupBot.ts`** (file mới) — module cô lập:
   - Export `initZaloGroupBot(deps)` gọi từ `server.ts` lúc boot, **chỉ chạy khi `ZALO_GROUP_BOT_ENABLED=true`**.
   - `deps` truyền vào các hàm/đối tượng dùng chung: `generateRAGAnswer`, `postProcessBotReply`, truy cập `chatSessions`, `dbSaveConversation`, `dbGetBots`, `analytics`, Supabase client.
   - Quản lý vòng đời: load phiên → đăng nhập → listen → auto-reconnect.
   - Mọi lỗi bọc try/catch; **không throw ra ngoài process chính**.

2. **Bảng Supabase `zalo_sessions`**
   - Cột: `id`, `account_label`, `credentials` (JSON: cookie/imei/userAgent đã serialize), `status` (`active` | `needs_login` | `error`), `last_error`, `updated_at`.
   - Một dòng cho tài khoản bot (thiết kế cho 1 account; có thể mở rộng nhiều account sau).

3. **Bảng Supabase `zalo_group_bindings`**
   - Cột: `group_id`, `group_name`, `bot_id`, `enabled` (bool), `created_at`, `updated_at`.
   - Ánh xạ `group_id → bot_id`. Group chưa bind hoặc `enabled=false` → bot im lặng.

4. **API admin trong `server.ts`** (dùng lại Express + guard owner-only sẵn có):
   - `GET /api/zalo/status` — trạng thái đăng nhập, tên tài khoản, listener đã kết nối chưa, lỗi gần nhất.
   - `POST /api/zalo/login/start` — bắt đầu đăng nhập QR, trả về QR (ảnh base64 / chuỗi).
   - `GET /api/zalo/login/result` — poll kết quả quét QR (pending / success / failed).
   - `POST /api/zalo/logout` — đăng xuất, xoá phiên.
   - `GET /api/zalo/groups` — liệt kê group đã biết + binding hiện tại.
   - `POST /api/zalo/groups/:groupId/binding` — gán `botId`, bật/tắt cho group.
   - `POST /api/zalo/simulate` — test đường RAG không cần Zalo thật (giống `facebook-webhook/simulate`).

5. **Panel admin trong `src/App.tsx`** — mô phỏng panel Facebook/Telegram đang có:
   - Khu vực đăng nhập: nút "Đăng nhập Zalo" → hiện QR để quét → tự cập nhật khi thành công.
   - Trạng thái listener (đang kết nối / cần đăng nhập lại / lỗi).
   - Danh sách group + dropdown chọn bot cho từng group + toggle bật/tắt.

---

## 3. Luồng dữ liệu (tin nhắn nhóm đến)

```
zca-js listener nhận message event trong nhóm
  ├─ group có trong zalo_group_bindings & enabled=true? ──no──> bỏ qua
  ├─ msgId đã xử lý? (dedupe Set) ──yes──> bỏ qua
  ├─ bot bị @mention HOẶC tin là reply vào msgId bot đã gửi? ──no──> bỏ qua (IM LẶNG)
  ├─ tách bỏ phần @mention → lấy câu hỏi sạch
  ├─ tìm/khởi tạo chatSession key "zalo:<groupId>"  (1 group = 1 hội thoại)
  │     • mỗi message gắn fullName/username của người gửi thật
  ├─ generateRAGAnswer(bot, câuhỏi, sender, { recentMessages: N tin gần nhất, shouldGreet })
  ├─ postProcessBotReply(...)
  ├─ rate-limit + delay 1–3s ("đang soạn")
  ├─ sendGroupMessage(groupId, trả lời) qua zca-js
  ├─ ghi botMsg vào session, set status
  ├─ dbSaveConversation(session)  (degrade gracefully nếu Supabase lỗi)
  └─ cập nhật analytics
```

### Quyết định về key hội thoại

**Per-group** (`zalo:<groupId>`): một nhóm = một hội thoại trong CRM, mỗi tin gắn tên người gửi thật. `recentMessages` = N tin gần nhất của cả nhóm. Đơn giản, khớp mô hình CRM hiện có, hiển thị tự nhiên như Telegram/Facebook.

---

## 4. Phát hiện trigger (@mention / reply)

- **@mention:** event nhóm của `zca-js` có mảng `mentions` chứa uid được nhắc → kiểm tra uid của tài khoản bot có trong đó.
- **Reply-to-bot:** tin có trường quote/reply trỏ tới `msgId` → giữ một `Set` (giới hạn ~1000) các `msgId` bot đã gửi gần đây; nếu `msgId` được quote nằm trong Set → trả lời.
- **Tách mention:** loại bỏ chuỗi @tên-bot khỏi text trước khi đưa vào RAG, để câu hỏi sạch.
- **Dedupe:** `processedZaloMsgIds` (Set giới hạn ~1000) giống `processedFacebookMessageIds`.

---

## 5. An toàn / giảm rủi ro khoá nick

- **Ép luật**: chỉ trả lời khi @mention hoặc reply — không bao giờ trả lời mọi tin.
- **Delay ngẫu nhiên 1–3s** trước khi gửi (giả "đang soạn").
- **Rate-limit mỗi group**: tối đa ~5 trả lời/phút (cấu hình được) để tránh burst giống bot.
- **Xử lý auth lỗi**: đánh dấu phiên `needs_login`, **ngừng thử lại**, báo lên admin để quét QR mới (không spam login).
- **Auto-reconnect** với exponential backoff cho lỗi mạng tạm thời (phân biệt với lỗi auth).
- **Cờ `ZALO_GROUP_BOT_ENABLED`** tắt mặc định → deploy hiện tại không đổi hành vi tới khi sẵn sàng.
- Khuyến nghị vận hành: **nick phụ**, không phải số chính.

---

## 6. Vận hành Render (keep-alive)

WebSocket listener là kết nối **outbound** → Render **gói free vẫn ngủ** khi không có request inbound trong ~15 phút, làm chết listener. Yêu cầu vận hành (chọn một):

- **Render trả phí** (instance always-on), hoặc
- **Uptime pinger** ngoài (vd UptimeRobot/cron-job.org) gọi endpoint `/health` mỗi vài phút để giữ service thức.

Spec ghi rõ đây là điều kiện để bot chạy 24/7 thật.

---

## 7. Xử lý lỗi & suy giảm mượt (graceful degradation)

- Listener lỗi → log + reconnect, **không** ảnh hưởng API Express.
- Supabase lỗi khi lưu hội thoại → chạy in-memory như code hiện tại (`chatSessions`), log cảnh báo.
- Phiên hỏng → `needs_login`, surface trên `GET /api/zalo/status`.
- Bot chưa bind group → im lặng (không lỗi).

---

## 8. Kiểm thử

- **`POST /api/zalo/simulate`**: gửi `{ groupId, text, senderName }` → chạy đúng pipeline trừ bước gửi qua Zalo thật. Test RAG, binding, session, trigger logic.
- **Unit/logic**: hàm tách mention, phát hiện reply-to-bot, dedupe, rate-limit — test thuần (không cần Zalo).
- **Manual E2E**: quét QR → add nick bot vào group test → @mention → kiểm tra trả lời; reply vào tin bot → kiểm tra trả lời; tin thường → kiểm tra **im lặng**.

---

## 9. Phụ thuộc

- Thêm `zca-js` vào `package.json` (Node 18+, ESM/TS).
- 2 bảng Supabase mới: `zalo_sessions`, `zalo_group_bindings` (kèm SQL migration).
- Biến môi trường mới: `ZALO_GROUP_BOT_ENABLED`, (tuỳ chọn) `ZALO_RATE_LIMIT_PER_MIN`, `ZALO_ACCOUNT_LABEL`.

---

## 10. Ngoài phạm vi (YAGNI)

- Không làm Zalo OA / chat 1-1 (chỉ group).
- Chỉ xử lý **text** — chưa ảnh, sticker, file, voice.
- Một tài khoản bot duy nhất (schema để ngỏ cho nhiều account sau).
- Không trả lời chủ động / broadcast.

---

## 11. Tiêu chí thành công

1. Quét QR qua admin → trạng thái chuyển `active`, phiên lưu vào Supabase và sống sót qua restart.
2. Trong group đã bind & bật: @mention bot → nhận trả lời đúng kiến thức RAG của bot được gán.
3. Reply vào tin của bot → nhận trả lời tiếp nối ngữ cảnh.
4. Tin thường (không mention/reply) → bot **im lặng**.
5. Hội thoại nhóm hiện trong CRM/sessions như các kênh khác.
6. Listener sập/đứt mạng → tự reconnect, API Express **không bị ảnh hưởng**.
7. Khi `ZALO_GROUP_BOT_ENABLED=false` → hệ thống hoạt động y như trước khi thêm tính năng.
