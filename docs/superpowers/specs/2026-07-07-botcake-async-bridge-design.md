# Botcake Async Bridge — trả lời khách qua Botcake không phụ thuộc timeout

**Ngày:** 2026-07-07
**Trạng thái:** Đã duyệt

## Vấn đề

Bản Botcake bridge đồng bộ (ship sáng 2026-07-07) thất bại thực tế: Botcake Dynamic Block
chờ phản hồi đồng bộ ~5s rồi bỏ cuộc, nhưng RAG của BalaBot mất **6-11s** (đo thật) →
biến `bot_reply` rỗng → khách không nhận được gì. Ép RAG xuống <5s không ổn định + hại
chất lượng. Kết luận: mô hình "chờ đồng bộ" sai bản chất với độ trễ tự nhiên của bot.

## Giải pháp: bất đồng bộ qua Botcake Public API

Botcake có API công khai gửi tin theo PSID (đã xác minh qua web):
`POST https://botcake.io/api/public_api/v1/pages/{page_id}/flows/send_flow`
header `access-token`, body `{ psid, flow_id, payload }`.

Luồng mới:
1. Khách nhắn → Botcake Dynamic Block POST `{psid, text, name}` sang BalaBot.
2. BalaBot **trả 200 NGAY** (`{"messages":[]}`) — Botcake không chờ, hết timeout.
3. BalaBot chạy RAG ở chế độ nền (bao lâu cũng được).
4. Xong → BalaBot gọi `send_flow` của Botcake, truyền câu trả lời vào `payload.bot_reply`,
   kích hoạt "flow trả lời" (chứa 1 khối text `{{bot_reply}}`) tới đúng PSID → khách nhận.

## Bối cảnh & ràng buộc

- Tái dùng `generateRAGAnswer` (bỏ cờ `fast` — async không cần vội, giữ chất lượng đầy đủ),
  session/usage/lịch sử như các kênh khác.
- Cấu hình per-bot MỚI cần lưu: Botcake `pageId`, `accessToken`, `replyFlowId` (+ tái dùng
  `botcakeBridgeKey` để auth request đến từ Botcake). Migration SQL thêm 3 cột.
- Fire-and-forget: xử lý nền chạy SAU khi đã `res.json` — dùng hàm async không await ở
  handler, bọc try/catch riêng (lỗi nền chỉ log, không làm sập request đã trả 200).
- **Chi tiết API cần kiểm chứng thực tế lúc build** (docs Botcake render JS, không đọc máy
  được): format chính xác `payload` map custom field (giả định `payload: { bot_reply: text }`),
  header tên `access-token`, cách lấy `flow_id`/`page_id`. Code phải LOG response Botcake
  đầy đủ để chỉnh nhanh; nếu payload map theo field-id thay vì tên → chỉ sửa 1 chỗ build body.
- Messenger 24h window: khách vừa nhắn nên còn trong cửa sổ — send_flow hợp lệ.

## Kiến trúc

### 1. Endpoint async (server.ts)

`POST /api/bridge/botcake-async/:botId?key=<botcakeBridgeKey>`
1. Auth key (giống bản sync); sai → 200 `{"messages":[]}` (Botcake không hiển thị gì; log cảnh báo).
2. Parse `{psid, text, name}` tolerant (tái dùng `parseBridgePayload`). Thiếu text/psid →
   200 `{"messages":[]}` + log (không xử lý).
3. Kiểm tra bot đã cấu hình đủ `botcakePageId` + `botcakeAccessToken` + `botcakeReplyFlowId`
   chưa; thiếu → 200 + log "chưa cấu hình gửi lại" (không thể đẩy tin).
4. **Trả `res.json({ messages: [] })` NGAY.**
5. Sau khi trả (không await ở luồng chính): gọi hàm nền `processBotcakeAsync(bot, psid, text, name)`:
   - Usage gate (vượt → gửi BLOCK_MESSAGE qua send_flow), else `generateRAGAnswer`
     (KHÔNG fast), `recordUsageForBot`.
   - Lưu session/message như kênh botcake (channel "botcake"), `dbSaveConversation`.
   - Gọi `sendBotcakeFlow(bot, psid, answerText)`.

### 2. Gọi Botcake send_flow (server.ts)

`async function sendBotcakeFlow(bot, psid, text): Promise<boolean>`
```
POST https://botcake.io/api/public_api/v1/pages/{bot.botcakePageId}/flows/send_flow
headers: { "access-token": bot.botcakeAccessToken, "Content-Type": "application/json" }
body: { psid, flow_id: bot.botcakeReplyFlowId, payload: { bot_reply: text } }
```
Log status + response body (JSON) để chẩn đoán. Trả false + log nếu !ok.

### 3. Bridge config per-bot

- Migration `botcakeAsync.sql`: thêm cột `botcakePageId`, `botcakeAccessToken`, `botcakeReplyFlowId` (text).
- Thêm 3 field vào `BotConfig` (src/types.ts).
- `GET /api/bots/:botId/bridge-info` (đã có) mở rộng trả thêm: `asyncBridgeUrl`
  (`/api/bridge/botcake-async/:botId?key=`), và các giá trị config hiện có (pageId, replyFlowId;
  KHÔNG trả accessToken ra ngoài — chỉ trả cờ `hasAccessToken`).
- `POST /api/bots/:botId/botcake-config`: nhận `{ pageId, accessToken, replyFlowId }`,
  lưu per-bot (memory + DB). accessToken rỗng trong body → giữ giá trị cũ (không ghi đè bằng rỗng).

### 4. Dashboard (src/App.tsx)

Trong card "Kết nối Fanpage qua Botcake" (đã có), đổi thành 2 phần:
- **Async URL** (mới, khuyến nghị): hiện `asyncBridgeUrl` + copy; 3 ô nhập `pageId`,
  `accessToken` (type password, placeholder "••• đã lưu" nếu hasAccessToken), `replyFlowId`
  + nút "Lưu cấu hình Botcake".
- Giữ URL đồng bộ cũ trong `<details>` "Cách cũ (đồng bộ — có thể chậm)".
- Link guide async mới.

### 5. Guide (docs/botcake-async-guide.md)

Tiếng Việt, cho chủ shop: tạo tài khoản → kết nối Page → **tạo "Flow trả lời"** (1 khối
văn bản `{{bot_reply}}`, tạo custom field bot_reply nếu chưa có) → lấy flow_id (từ URL flow
hoặc mục quản lý flow) → lấy page_id + tạo access-token (Cài đặt → API) → dán 3 giá trị vào
BalaBot → sửa Default Reply: Dynamic Block POST `{psid, text, name}` tới Async URL, KHÔNG cần
Save Respond/text block → test bằng nick khác. Kèm mục lỗi thường gặp + bước kiểm chứng (đọc
log `[Botcake Async]` trên Railway để chỉnh payload nếu cần).

### 6. Kiểm thử

- Unit: `sendBotcakeFlow` build đúng URL/header/body (mock fetch); async handler trả 200 ngay
  và không throw khi thiếu config.
- Thủ công E2E (chủ dự án + Page test): cấu hình đủ 3 giá trị → nhắn nick khác → bot trả lời
  qua Messenger sau vài giây; đọc log xác nhận send_flow trả ok.

## Ngoài phạm vi

- Bản đồng bộ cũ giữ nguyên làm dự phòng (không xóa).
- Tự động lấy flow_id/page_id giúp khách (khách/đội hỗ trợ nhập tay).
- Ảnh/nút/nhiều tin — chỉ 1 đoạn text.
- Retry khi send_flow lỗi (v1 chỉ log; thêm sau nếu cần).
