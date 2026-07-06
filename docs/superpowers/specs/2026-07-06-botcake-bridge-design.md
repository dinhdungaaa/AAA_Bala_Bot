# Botcake Bridge — khách dùng bot Messenger NGAY qua nền tảng đã được Meta duyệt

**Ngày:** 2026-07-06
**Trạng thái:** Đã duyệt (PA 1)

## Mục tiêu

Cho khách hàng (chủ shop) dùng bot BalaBot trả lời **mọi khách vãng lai** trên Messenger
NGAY HÔM NAY, không chờ App Review của Meta. Cách: khách kết nối Page vào **Botcake**
(nền tảng chatbot VN miễn phí, app Meta đã duyệt) → Botcake chuyển tin nhắn về BalaBot
qua **Dynamic Block** → BalaBot chạy RAG trên tri thức của shop → trả câu trả lời →
Botcake gửi cho khách.

Đây là **cầu tạm**: khi App Review của app BalaBot được duyệt (track dài hạn), khách
chuyển sang "Kết nối Facebook (1 chạm)" chính chủ đã ship 2026-07-06 — không mất dữ liệu.

## Bối cảnh & ràng buộc

- App Meta riêng đang Development mode → webhook chỉ nhận tin từ người có role trong
  app; khách vãng lai nhắn Page → Meta không gửi gì. Nút thắt là thủ tục (hộ kinh doanh
  + Business Verification + App Review), không phải kỹ thuật.
- Botcake Dynamic Block: khối trong flow gọi API ngoài (URL cấu hình được, body template
  chứa biến như tin nhắn cuối/PSID/tên khách) và gửi tin nhắn theo JSON API trả về —
  tương thích chuẩn Chatfuel `{"messages":[{"text":"..."}]}`.
  **Giả định cần kiểm chứng thực tế ở bước đầu triển khai** (docs Botcake render JS,
  chưa đọc máy được): tên biến chính xác, format body, timeout. Endpoint phải TOLERANT
  (nhận nhiều tên trường) + log raw payload để chỉnh mapping nhanh.
- Backend sẵn có: `generateRAGAnswer(bot, text, userInfo, replyOptions)`,
  `postProcessBotReply`, session/`chatSessions`, `checkUsageGate`/`recordUsageForBot`,
  pattern xử lý kênh trong `processFacebookIncomingMessage` (server.ts ~2260).

## Kiến trúc

### 1. Endpoint bridge (server.ts)

`POST /api/bridge/botcake/:botId?key=<bridgeKey>`

1. **Auth:** so `key` (query) với `bot.botcakeBridgeKey`. Sai/thiếu → 403
   `{"messages":[{"text":"Bridge key không hợp lệ."}]}` (vẫn format messages để dễ thấy
   lỗi ngay trong Messenger khi khách cấu hình sai).
2. **Parse tolerant** từ body (JSON):
   - text khách nhắn: `text` | `message` | `last_input` | `last_user_input`
   - PSID: `psid` | `sender_id` | `messenger_user_id` | `user_id`
   - tên: `name` | `full_name` | `first_name`+`last_name`
   - Không có text → trả `{"messages":[]}` (200, im lặng).
   - Log 1 dòng `[Botcake Bridge] payload keys: [...]` khi thiếu trường (chẩn đoán mapping).
3. **Usage gate:** như webhook Facebook — vượt hạn mức → trả fallback lịch sự, không gọi AI.
4. **Session:** userKey `botcake:<psid>` (PSID của app Botcake, khác PSID app BalaBot —
   không đụng nhau), `session.channel = "botcake"`. Lưu message user + bot vào session
   như các kênh khác (hiện trong lịch sử hội thoại dashboard).
5. **Trả lời:** `generateRAGAnswer` với `shouldGreet` theo lượt đầu, `recentMessages`
   từ session. Response HTTP 200:
   ```json
   { "messages": [ { "text": "câu trả lời..." } ] }
   ```
   Câu > 1800 ký tự → cắt thành nhiều phần tử `messages` (giới hạn Messenger ~2000).
6. **Lỗi AI/timeout nội bộ:** trả fallbackMessage của bot trong format messages (200) —
   không để Botcake nhận 5xx rồi im lặng.
7. **Không hỗ trợ** (v1, ghi rõ trong docs): bot tự nhắn trước (bridge chỉ trả lời
   đồng bộ); operator takeover từ dashboard BalaBot cho session botcake
   (`deliverOperatorReply` trả `channel_not_supported` — nhân viên dùng livechat của
   Botcake khi cần người thật).

### 2. Bridge key per-bot

- Cột mới bảng bots: `botcakeBridgeKey` text (migration SQL `botcakeBridge.sql`, pattern
  như `facebookConnect.sql`).
- `GET /api/bots/:botId/bridge-info`: trả `{ bridgeUrl, bridgeKey }`; nếu bot chưa có
  key → tự sinh (`randomToken(16)` từ facebookOauth.ts), lưu memory + DB rồi trả.
  `bridgeUrl` build từ origin công khai backend (dùng chuỗi cố định Railway
  `https://aaabalabot-production.up.railway.app` — Botcake gọi thẳng backend, không qua
  proxy Cloudflare để giảm 1 hop và tránh phụ thuộc route).
- `POST /api/bots/:botId/bridge-key/regenerate`: đổi key (khi lộ).

### 3. Dashboard (src/App.tsx)

Trong tab Facebook, **Botcake bridge là phương án chính**, đặt TRÊN card OAuth:

**Card 1 (chính) — "Kết nối Fanpage qua Botcake (khuyến nghị)":**
- Nút "Tạo/Hiện Bridge URL" → gọi `bridge-info` → hiện URL đầy đủ (kèm key) + nút copy.
- Nút "Đổi key" (confirm trước khi đổi).
- Link/ghi chú hướng dẫn `docs/botcake-bridge-guide.md` (5 bước).

**Card 2 — OAuth 1 chạm chuyển "Sắp ra mắt":**
- Nút "Kết nối Facebook (1 chạm)" → **disabled**, label "Kết nối Facebook (1 chạm) — Sắp ra mắt",
  badge "Đang chờ Meta phê duyệt".
- Backend OAuth GIỮ NGUYÊN (đang hoạt động cho admin/tester; bật lại nút chỉ là bỏ disabled
  khi App Review xong).
- Giữ nguyên phần "Tùy chọn nâng cao: dán Page Access Token" trong card này.

### 4. Hướng dẫn khách (docs/botcake-bridge-guide.md)

Tiếng Việt, từng bước cho chủ shop: tạo tài khoản botcake.io → kết nối Fanpage (nút
chính chủ của Botcake) → Automation/Cài đặt → Trả lời mặc định (Default Reply) → thêm
Dynamic Block → dán Bridge URL + body template mẫu:

```json
{ "text": "{{last user freeform input}}", "psid": "{{messenger user id}}", "name": "{{full name}}" }
```

(tên biến chốt lại sau bước kiểm chứng thực tế) → Lưu → nhắn thử vào Page bằng nick
bất kỳ → bot trả lời. Kèm mục "Lỗi thường gặp".

### 5. Kiểm chứng thực tế (bước đầu tiên khi triển khai)

Chủ dự án tạo tài khoản Botcake + kết nối 1 Page test + tạo Dynamic Block trỏ về bridge
(qua log `[Botcake Bridge]` xem payload thật) → chốt tên biến/format → cập nhật guide.
Nếu Dynamic Block khác giả định quá xa (không có, hoặc không cho body template) →
fallback PA 2 (Chatfuel, JSON API chuẩn) với cùng endpoint (đổi path `/api/bridge/chatfuel/:botId`,
format response giống hệt).

### 6. Kiểm thử

- Unit: parse tolerant payload (các tổ hợp tên trường), cắt tin > 1800 ký tự, auth key
  sai/thiếu, body rỗng.
- Thủ công E2E: Page test + Botcake thật + khách vãng lai (nick không có role) nhắn →
  bot trả lời; vượt hạn mức → fallback; đổi key → URL cũ bị 403.

## Ngoài phạm vi

- Bot chủ động nhắn trước, tin nhắn ảnh/nút bấm (chỉ text v1).
- Takeover từ dashboard BalaBot cho kênh botcake.
- Đồng bộ 2 chiều trạng thái Botcake ↔ BalaBot.
- Tự động hóa việc tạo flow trong Botcake (khách/chủ dự án làm tay theo guide).
