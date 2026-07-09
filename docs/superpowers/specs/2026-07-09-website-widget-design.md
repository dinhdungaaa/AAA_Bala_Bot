# Widget Chat Nhúng Website — Thiết Kế

**Ngày:** 2026-07-09
**Trạng thái:** Đã duyệt hướng (bubble chat + iframe, tùy biến cơ bản, widget-key + rate-limit, nhớ phiên theo trình duyệt)

## 1. Mục tiêu

Chủ shop (khách hàng BalaBot) dán **1 dòng script** vào website của họ (WordPress, Haravan, LadiPage, web tự code…) để hiện bong bóng chat góc phải dưới. Khách vãng lai chat với bot chạy **đúng logic production** (RAG 2 tầng hiểu + dẫn dắt bán hàng + bắt SĐT + báo Telegram), hội thoại hiện trong tab Hội thoại với kênh `web`, tôn trọng human takeover, tính vào quota gói.

Không nằm trong phạm vi phase 1: khung chat inline, tùy biến sâu (logo/avatar/CSS/vị trí), allowlist tên miền, gửi file/ảnh, đa ngôn ngữ widget.

## 2. Mã nhúng

```html
<script src="https://antiantiai.xyz/balabot/api/widget/loader.js"
        data-bot="BOT_ID" data-key="WIDGET_KEY" async></script>
```

- Đi qua đường `/balabot/api/*` sẵn có của worker proxy → **không cần sửa/deploy lại worker Cloudflare**.
- `WIDGET_KEY` là khóa công khai mức thấp (như botcakeBridgeKey): lộ ra trong mã nguồn trang shop là chấp nhận được; nó chống nhúng trộm bot của shop khác chứ không phải bí mật tuyệt đối. Có nút thu hồi/đổi khóa.

## 3. Thành phần

### 3.1 `widgetLoader.ts` → `GET /api/widget/loader.js`
Vanilla JS ~6-8KB, không phụ thuộc gì, tự chạy khi tải:
1. Đọc `data-bot`, `data-key` từ thẻ script của chính nó (`document.currentScript`).
2. Lấy/tạo `visitorId` (`wv-` + 16 ký tự ngẫu nhiên) trong `localStorage` **của trang shop** (key `balabot-visitor-<botId>`) — first-party nên không bị Safari/Chrome chặn như storage bên thứ 3.
3. Gọi `GET /api/widget/<botId>/config?key=` khi tải: 403/404 (key thu hồi, bot xóa) → **không vẽ nút** (widget tự biến mất trên site shop); thành công → dùng `color` trả về cho nút.
4. Vẽ nút bong bóng tròn 56px góc phải dưới (z-index 2147483000, inline style toàn bộ — không stylesheet ngoài), màu theo config, mặc định emerald `#059669`.
5. Bấm nút → mở/đóng iframe 380×560 (mobile: full-screen trừ 16px viền) trỏ tới
   `…/api/widget/<botId>/frame?key=<key>&visitor=<visitorId>`.
- Response header: `Content-Type: application/javascript`, `Cache-Control: public, max-age=300`.

### 3.2 `GET /api/widget/:botId/frame?key&visitor`
Trang HTML **tự chứa** (template string trong `widgetFrame.ts`, không React, không asset ngoài):
- Header màu chủ đạo + tên hiển thị; vùng tin nhắn; ô nhập + nút gửi.
- Khi mở: gọi `GET /api/widget/:botId/messages?key&visitor` để vẽ lịch sử cũ (khách quay lại thấy mạch cũ); nếu chưa có lịch sử → hiện `widgetGreeting`.
- Gửi tin: `POST /api/widget/:botId/chat`; hiện "đang soạn…" trong lúc chờ.
- Polling `GET …/messages?after=<timestamp-tin-cuối>` mỗi 5 giây khi tab mở — nhận tin can thiệp của operator (takeover) và tin bot trễ. Dừng polling khi iframe đóng.
- Sai key/bot: trả trang lỗi tĩnh, không lộ thông tin.

### 3.3 API chat công khai (file `widgetApi` logic đặt trong server.ts theo pattern hiện có)

`POST /api/widget/:botId/chat` — body `{ key, visitor, text }`:
1. Bot tồn tại + `bot.widgetKey` khớp `key` (bot chưa có widgetKey = tính năng tắt → 403).
2. Rate-limit theo IP: 8 tin/phút/IP (map riêng, cùng cơ chế `siteAssistantAllow`), vượt → 429 với câu xin lỗi tiếng Việt.
3. `text` cắt tối đa 2000 ký tự; rỗng → 400.
4. `checkUsageGate(bot)` — hết quota gói → trả `BLOCK_MESSAGE` như các kênh khác.
5. Session: userKey `web:<visitorId>`, `channel: 'web'`, `channelChatId: visitorId`, tên "Khách website"; nếu takeover đang hiệu lực → `absorbMessageDuringTakeover` + trả `{ humanTakeover: true }` (frame hiện "Nhân viên đang trả lời…" và dựa vào polling).
6. `generateRAGAnswer` với `recentMessages` (8 tin gần nhất) + `shouldGreet` lượt đầu → `recordUsageForBot` → lưu session (`dbSaveConversation`).
7. Response: `{ reply, humanTakeover: false }`.

`GET /api/widget/:botId/messages?key&visitor&after=` — kiểm key như trên; trả `{ messages: [{ sender, text, timestamp }] }` của đúng session `web:<visitorId>` (chỉ 50 tin cuối; `after` lọc tin mới hơn). Không bao giờ trả session của visitor khác.

`GET /api/widget/:botId/config?key=` — trả `{ title, color, greeting }` (không trả gì nhạy cảm).

### 3.4 Điểm nối hệ thống hiện có (các mối chỉnh sửa bắt buộc)
- **Regex scope BYO Supabase** (`getRequestConfig`, server.ts): thêm `widget` →
  `/^\/api\/(?:bots|telegram-webhook|facebook-webhook|widget|bridge\/botcake(?:-async)?)\/([^/]+)/` — bot của khách BYO phải đọc/ghi đúng DB của họ.
- **Middleware khóa bot theo chủ**: không cần miễn trừ — route nằm ngoài `/api/bots/:botId`.
- **`deliverOperatorReply`**: thêm nhánh `channel === "web"` trả `{ delivered: true, channel: "web" }` — widget nhận tin qua polling, không cần push; tránh alert giả "chưa gửi được".
- **`channelFromUserKey`** (leadHelpers): đảm bảo prefix `web:` map về kênh `web` (dùng cho lead + analytics theo kênh).
- **Suy luận kênh sau restart** trong `deliverOperatorReply`: thêm `key.startsWith("web:")` → channel web.

### 3.5 Trường mới trên `bots` (file `widget.sql`, chạy tay như các migration khác)
```sql
alter table bots add column if not exists "widgetKey" text;
alter table bots add column if not exists "widgetColor" text;
alter table bots add column if not exists "widgetTitle" text;
alter table bots add column if not exists "widgetGreeting" text;
```
(BotConfig trong `src/types.ts` thêm 4 field optional tương ứng. Khách BYO chạy lại SQL Schema — `getSQLSchema()` bổ sung 4 ALTER này vào section nâng cấp.)

### 3.6 Dashboard — thẻ "🌐 Website" (App.tsx, khu kênh cạnh Telegram/Facebook/Zalo)
- Chưa có `widgetKey`: nút **"Bật widget & tạo mã nhúng"** → `POST /api/bots/:botId/widget-config` (server tự sinh key `wk_` + 24 hex qua `randomToken` sẵn có).
- Đã bật: 3 ô tùy biến (màu — input color, tên hiển thị, lời chào) lưu qua cùng endpoint; ô mã nhúng chỉ-đọc dựng từ botId+key với nút **Copy**; nút **"Đổi khóa"** (`POST /api/bots/:botId/widget-key/regenerate`, confirm trước — mã nhúng cũ trên site shop sẽ chết, phải dán lại); nút **"Tắt widget"** (xóa widgetKey — bong bóng biến mất trên site shop).
- 2 endpoint này nằm dưới `/api/bots/:botId/*` → middleware chủ sở hữu tự bảo vệ.

## 4. Luồng dữ liệu (tóm tắt)

```
Trang shop ──loader.js──> bong bóng ──click──> iframe /frame
iframe ──POST /chat {key, visitor, text}──> kiểm key → rate-limit → quota
      → takeover? absorb : generateRAGAnswer → lưu session web:<visitor> → reply
iframe ──GET /messages (poll 5s)──> tin operator/bot mới
Dashboard Hội thoại: session kênh web + takeover + trả lời (delivered qua polling)
```

## 5. Lỗi & biên

- Key sai/thu hồi: chat 403, loader ẩn nút — site shop không hiện gì vỡ.
- Hết quota: bot trả BLOCK_MESSAGE (đồng nhất các kênh).
- Gemini lỗi/chậm: `generateRAGAnswer` đã có fallback nội bộ; frame có timeout hiển thị 30s → "Mạng chậm, anh/chị thử lại giúp em".
- Khách xóa localStorage → visitorId mới → phiên mới (chấp nhận).
- 2 tab cùng mở: cùng visitorId, polling đồng bộ tin — chấp nhận trùng hiển thị nhẹ.
- Railway restart: session đã lưu Supabase (bảng chat_sessions), lịch sử giữ nguyên.

## 6. Kiểm thử

- Vitest (module tách được: `widget/embed.ts` chứa `buildEmbedSnippet`, validate key, cắt text, lọc `after`): snippet đúng format; key sai → từ chối; messages lọc đúng visitor + after; loader config 403 → ẩn.
- UAT tay: dán snippet vào 1 file HTML tĩnh local + 1 trang thật; chat 3 lượt có ngữ cảnh; để lại SĐT → lead + Telegram notify; operator trả lời từ dashboard → hiện trong widget ≤5s; bot im 30 phút; Đổi khóa → widget cũ chết; Tắt → bong bóng biến mất; đo quota tăng.

## 7. Việc chủ hệ thống (owner) sau khi merge

1. Chạy `widget.sql` trên DB gốc (và nhắc khách BYO chạy lại SQL Schema).
2. UAT theo mục 6 trên site thật.
