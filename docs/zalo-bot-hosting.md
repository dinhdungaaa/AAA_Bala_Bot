# Hosting BalaBot backend (không dùng Render)

Listener Zalo (`zca-js`) cần **một tiến trình Node luôn-bật** giữ WebSocket. Bất kỳ host container nào không "ngủ" đều chạy được. Repo đã có `Dockerfile` → cùng 1 image chạy trên Railway / Fly.io / Koyeb / VPS.

## Kiến trúc sau khi đổi host

- **Frontend** (React) vẫn ở **Cloudflare Pages** (`aaa-balabot.pages.dev`). Không đổi.
- **Backend** (`server.ts` + `zaloGroupBot/`) chạy trên host container mới (thay cho Render).
- **Cloudflare site-proxy** trỏ `/balabot/api/*` về host mới: sửa `BACKEND_ORIGIN` rồi deploy lại worker.
- **Supabase** giữ nguyên (lưu hội thoại + phiên đăng nhập Zalo). Container có thể ephemeral — phiên Zalo khôi phục từ Supabase khi restart.

## Biến môi trường cần đặt trên host

Bắt buộc:
- `GEMINI_API_KEY`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (khuyến nghị service role để bypass RLS bảng `zalo_sessions`)
- `ZALO_GROUP_BOT_ENABLED=true`
- `ZALO_ACCOUNT_LABEL=default`
- `ZALO_RATE_LIMIT_PER_MIN=5`

Tuỳ chọn (nếu dùng): `SUPABASE_ANON_KEY`, `FACEBOOK_VERIFY_TOKEN`, `FACEBOOK_PAGE_ACCESS_TOKEN`, `FACEBOOK_GRAPH_API_VERSION`, `BOTPRESS_API_SECRET`, `APP_URL`.

> Host tự gán `PORT`; `server.ts` đã đọc `process.env.PORT` (mặc định 3000). Không cần set thủ công trừ khi host yêu cầu.

## Trước khi deploy: chạy SQL

Chạy `zaloGroupBot.sql` trên Supabase SQL editor (tạo `zalo_sessions`, `zalo_group_bindings` + RLS). Một lần duy nhất.

## Deploy theo từng nhà cung cấp

### Railway (dễ nhất)
1. Tạo project → "Deploy from GitHub repo" (hoặc `railway up`). Railway tự nhận `Dockerfile`.
2. Tab Variables: dán các env ở trên.
3. Deploy. Railway luôn-bật (không ngủ). Lấy URL public (vd `https://xxx.up.railway.app`).

### Fly.io (cần ép always-on)
1. `fly launch` (nhận `Dockerfile`, đừng deploy ngay).
2. Trong `fly.toml`: đặt `[http_service] internal_port = 3000`, và **`min_machines_running = 1`** (để máy không scale-to-zero → listener không chết).
3. `fly secrets set GEMINI_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ZALO_GROUP_BOT_ENABLED=true ...`
4. `fly deploy`. URL: `https://<app>.fly.dev`.

### Koyeb
1. Create Service → từ GitHub repo (Dockerfile) hoặc Docker image.
2. Instance: nano. Đặt env ở trên.
3. Deploy. Koyeb giữ service chạy liên tục. URL: `https://<app>-<org>.koyeb.app`.

### VPS (toàn quyền, ~4–5$/tháng)
```bash
git clone <repo> && cd "AAA Bala Bot"
docker build -t balabot .
docker run -d --name balabot --restart=always -p 3000:3000 \
  -e GEMINI_API_KEY=... \
  -e SUPABASE_URL=... -e SUPABASE_SERVICE_ROLE_KEY=... \
  -e ZALO_GROUP_BOT_ENABLED=true -e ZALO_ACCOUNT_LABEL=default -e ZALO_RATE_LIMIT_PER_MIN=5 \
  balabot
```
`--restart=always` để tự bật lại khi reboot. Đặt sau Nginx/Caddy nếu muốn HTTPS, hoặc dùng Cloudflare Tunnel.

## Trỏ Cloudflare proxy về host mới

Sửa `cloudflare-site-proxy/balabot-site-proxy.js`:
```js
const BACKEND_ORIGIN = "https://<host-moi-cua-ban>";   // thay cho onrender.com
```
Rồi deploy worker: `cd cloudflare-site-proxy && npx wrangler deploy`.

Sau đó `antiantiai.xyz/balabot/api/*` sẽ đi tới host mới; `antiantiai.xyz/balabot/` vẫn lấy frontend từ Pages.

## Keep-alive

Railway / Koyeb / VPS: chạy liên tục, không cần pinger. Fly.io: chỉ cần `min_machines_running = 1` (đừng để scale-to-zero). Không host nào trong số này "ngủ sau 15 phút" như Render free, nên **bỏ được yêu cầu uptime-pinger** đã nêu trong `zalo-group-bot-ops.md`.

## Kiểm tra sau deploy

- `https://<host-moi>/health` → `{ ok: true, ts: ... }`.
- Mở `antiantiai.xyz/balabot/admin` → panel Zalo → trạng thái load được (không 403 với owner) → quét QR nick phụ → `loginState: active`.
