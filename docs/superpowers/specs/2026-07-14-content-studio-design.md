# Content Studio — Tích hợp fbtool vào BalaBot (v1)

Ngày: 2026-07-14. Trạng thái: đã duyệt thiết kế.

## Mục tiêu
Đưa khả năng cốt lõi của fbtool (fbtool.antiantiai.xyz — "AI Facebook Content Tool") vào BalaBot: từ thông tin sản phẩm/dịch vụ đã có trong bot, sinh ra **bài quảng bá** và **bài xây thương hiệu cá nhân** (text) để khách đăng Facebook. Một sản phẩm, một đăng nhập, tái dùng Gemini + kho kiến thức + auth token đã có.

## Quyết định phạm vi (đã chốt)
- **Hướng:** port LÕI ENGINE của fbtool thành tab native trong BalaBot (không nhúng app Next.js riêng, không port toàn bộ).
- **Nguồn input:** tái dùng **Kho Kiến Thức của bot** (knowledge sources/chunks) làm nguyên liệu; có ô dán thêm tùy chọn.
- **Đầu ra v1:** chỉ TEXT — bài quảng bá sản phẩm + bài thương hiệu cá nhân (storytelling/insight).
- **Người dùng:** mọi khách, **giới hạn theo gói** (gói cao dùng thoải mái, gói thấp giới hạn).

## Nguồn tham chiếu (trên máy)
`D:/Vibe Code/Content AAA/AI-Facebook-Content-Tool-v1/webapp/studio`
- `lib/engine/`: `post-formulas.ts` (D1–D7), `quality-gate.ts`, `sanitize.ts`, `poke-holes.ts`, `pillars.ts`, `types.ts` (+ .test.ts). **Thuần TS — port gần như nguyên.**
- `lib/pipeline/`: `generate-post.ts` (orchestrator), `prompts.ts`, `length.ts`, `guardrails.ts`, `brainstorm-hooks.ts`, `model-policy.ts`. Port nhánh POST (bỏ nhánh AD).
- BỎ ở v1: `ad-*`, `thumbnail-*`, calendar, publish, credits/BYOK, multi-provider (`lib/ai/*` groq/openrouter/fallback).

## Kiến trúc trong BalaBot

### Backend — module `contentEngine/` (port, thuần, test được)
- Copy `post-formulas.ts`, `quality-gate.ts`, `sanitize.ts`, `poke-holes.ts`, `pillars.ts`, `types.ts`, `prompts.ts`, `length.ts`, `guardrails.ts` (đổi import cho hợp BalaBot ESM `.js`).
- `generate-post.ts` → `contentEngine/generatePost.ts`: giữ pipeline draft → quality-gate → refine (tối đa N vòng), nhưng **thay lớp LLM** bằng adapter gọi `getAIClient()` (Gemini) của BalaBot (giống `rag/synthesis.ts`). Bỏ phụ thuộc Supabase/credits/model-policy đa provider.
- Adapter brand: dựng `Brand`/blueprint tối thiểu từ `BotConfig` (name, field, tone, welcome) + tóm tắt Kho Kiến Thức (lấy top chunk liên quan chủ đề bằng embed sẵn có, hoặc ghép sources) làm `ingredients`.

### Backend — API (server.ts)
- `POST /api/bots/:botId/content/generate` — body: `{ postType, topic, goal?, extraIngredients?, lengthPreference? }`. Middleware bot-guard (token) đã bảo vệ. Bước: `checkContentGate(bot)` (quota) → lấy nguyên liệu từ chunks → `generatePost(...)` → lưu `content_posts` (nháp) → `recordContentUse(bot)` → trả `{ content, score, passed, postId }`.
- `GET /api/bots/:botId/content` — list bài đã lưu của bot.
- `PUT /api/content/:id`, `DELETE /api/content/:id` — sửa/xóa, gọi `assertResourceBotAccess(req,res,"content_posts",id,memoryBotId)`.
- `GET /api/content/usage?botId=` (hoặc gộp vào /api/usage/me) — trả quota content còn lại để UI hiển thị.

### Dữ liệu — `content.sql`
Bảng `content_posts`: `id text pk, botId text, userId text, postType text, topic text, content text, score int, status text default 'draft', createdAt timestamptz`. Index theo `botId`, `userId`.
Đếm quota tháng: bảng `content_usage (owner_key text, ym text, count int, pk(owner_key,ym))` — song song `usage` hiện có; hoặc tái dùng cơ chế `dbGetUsage/dbIncrementUsage` với namespace riêng. (Chọn bảng riêng để không lẫn với quota tin nhắn.)

### Giới hạn theo gói — `CONTENT_LIMITS` (billing.ts)
```
free 5 · starter 30 · pro 150 · business 600 · enterprise 999999 (không giới hạn thực tế)
```
`checkContentGate(bot)`: resolve tier chủ bot (`resolveOwnerPlan`) → so `dbGetContentUsage(ownerKey, ym)` với `CONTENT_LIMITS[tier]` qua `usageVerdict`. Chặn khi ≥110%, cảnh báo 80%. Số cụ thể chỉnh được sau.

### Frontend — tab "Tạo bài viết" (App.tsx)
- Thêm mục nav + tab. Panel: chọn loại bài (nhóm Quảng bá / Thương hiệu cá nhân, map D1–D7), nhập chủ đề/mục tiêu, độ dài, ô dán nguyên liệu thêm; nút "Tạo bài".
- Gọi API generate (fetch interceptor tự gắn token). Hiển thị bài + điểm chất lượng + nút Copy, Sửa, Lưu, Xóa. Danh sách bài đã tạo của bot.
- Hiển thị quota content còn lại theo gói; hết quota → CTA nâng gói (như thẻ usage hiện có).

## Bảo mật & đa tenant
Mọi route content đi qua middleware token (bot-guard) + `assertResourceBotAccess` cho route theo id — đồng bộ [[tenant-authz-model]]. Nguyên liệu chỉ lấy từ kho kiến thức của chính bot đó.

## Kiểm thử
- Port kèm test của engine (`__tests__/content-*.test.ts`): post-formulas, quality-gate, sanitize, guardrails, length — chạy offline không cần LLM.
- Test adapter brand-from-bot (thuần). Generate thật (có LLM) kiểm bằng tay sau deploy.

## Phạm vi & pha
- **Pha 1 (spec này):** engine + generate + lưu/list + sửa/copy + quota theo gói + tab UI.
- Pha 2: ảnh thumbnail (canvas). Pha 3: đăng/hẹn giờ Facebook qua kết nối FB sẵn có. Pha 4: calendar/kế hoạch hàng loạt.

## Nợ vận hành
Owner chạy `content.sql` trên Supabase gốc trước khi bật. Không cần env mới (dùng GEMINI_API_KEY sẵn có).
