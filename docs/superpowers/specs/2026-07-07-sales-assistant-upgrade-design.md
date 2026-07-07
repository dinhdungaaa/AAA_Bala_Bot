# Nâng cấp trợ lý bán hàng — "Bộ não 2 tầng" (Understand → Speak) + Lead capture

**Ngày:** 2026-07-07 · **Trạng thái:** Đã duyệt thiết kế (chốt Phương án A qua brainstorming)

## 1. Bối cảnh & vấn đề

BalaBot hiện trả lời bằng RAG một tầng: embed câu hỏi → top-K chunks → 1 prompt synthesis
(`rag/synthesis.ts`). Ba nỗi đau chủ dự án chọn (theo thứ tự ưu tiên):

1. **Bot thụ động** — trả lời xong là hết, không dẫn dắt về mục tiêu (xin SĐT, chốt đơn).
2. **Không hiểu đúng ý khách** — nhất là câu ngắn, gõ tắt, tiếng lóng; `condenseFollowUpQuery`
   chỉ chạy cho follow-up ngắn và chỉ viết lại câu tìm kiếm, không nhận diện ý định.
3. **Giọng máy móc** — lặp mẫu câu, dài dòng, chưa giống nhân viên bán hàng VN.

Benchmark đối thủ (Intercom Fin, Tidio Lyro, Gorgias; VN: AhaChat, Hana, Botbanhang):
kỹ thuật cốt lõi họ dùng là (a) intent recognition trước khi trả lời, (b) hành vi bot theo
mục tiêu hội thoại, (c) lead qualification ngay trong chat, (d) dữ liệu cấu trúc + actions.
Đợt này làm (a)(b)(c); (d) để đợt sau (chủ dự án không chọn "sai giá" là nỗi đau chính).

## 2. Quyết định thiết kế đã chốt

- **Phương án A** — thêm tầng HIỂU (1 call LLM nhanh) trước retrieval; nâng prompt synthesis
  thành goal-driven. KHÔNG làm function calling / catalog cấu trúc đợt này.
- **Mục tiêu hội thoại per-bot, chủ shop tự chọn**: `lead` (lấy liên hệ — mặc định) /
  `order` (chốt đơn trong chat) / `consult` (tư vấn thuần).
- **Lead đi đâu:** bảng `leads` Supabase + tab "Khách tiềm năng" trên dashboard + thông báo
  Telegram cho chủ shop (per-bot chat id, tùy chọn).

## 3. Kiến trúc — luồng mới trong `generateRAGAnswer` (mọi kênh)

```
Tin khách
  → [TẦNG HIỂU] understand() — 1 call Gemini, thinkingBudget 0, timeout 3s
      trả JSON: {
        intent: "hoi_gia" | "hoi_san_pham" | "tin_hieu_mua" | "cung_cap_lien_he"
              | "phan_nan" | "chit_chat" | "khac",
        searchQuery: string,          // câu tìm kiếm độc lập (thay condenseFollowUpQuery)
        buyingSignal: "nong" | "am" | "lanh",
        contact: { phone?: string, name?: string, address?: string } | null,
        interest: string | null       // món khách đang quan tâm, tóm 1 câu
      }
  → [RETRIEVAL] embed(searchQuery) + rankBySimilarity top-K   (giữ nguyên)
  → [TẦNG NÓI] synthesizeAnswer() — prompt mới nhận thêm:
      intent + buyingSignal + conversationGoal(bot) + goalState(session)
  → trả lời khách
  → nếu contact.phone hợp lệ & mới → lưu leads + notify Telegram (không chặn reply)
```

**Chi phí/độ trễ:** tầng HIỂU *thay thế* call `condenseFollowUpQuery` sẵn có và chạy cho MỌI
tin (trước chỉ follow-up ngắn). Tổng vẫn ~3 call/tin. Độ trễ +~0.5-1s cho câu dài. Kênh
Botcake async không nhạy độ trễ.

**Fail-open bắt buộc:** understand() lỗi/timeout/JSON hỏng → dùng
`buildEmbedQuery(query, lastUserText)` như cũ, intent `"khac"`, buyingSignal `"lanh"`,
contact null. Bot KHÔNG BAO GIỜ chết vì tầng mới.

## 4. Tầng HIỂU — `rag/understand.ts` (file mới)

- `buildUnderstandPrompt(query, history)` — pure, unit-test được. System instruction yêu cầu
  CHỈ in JSON đúng schema trên; history 6 lượt gần nhất (tái dùng format của
  `condenseFollowUpQuery`); ví dụ few-shot ngắn cho gõ tắt VN ("ib gia" → hoi_gia,
  searchQuery "giá sản phẩm").
- `parseUnderstandOutput(raw)` — pure: strip ```json fence, JSON.parse, validate từng field
  (enum sai → giá trị mặc định), KHÔNG throw — trả object mặc định khi hỏng.
- `understand(ai, query, history)` — gọi Gemini `GEN_MODEL`, temperature 0,
  `maxOutputTokens 256`, `thinkingBudget: 0`, `responseMimeType: "application/json"`,
  timeout 3s (Promise.race); catch mọi lỗi → mặc định fail-open.
- `isValidVNPhone(s)` — pure: regex SĐT VN `(0|\+?84)(3|5|7|8|9)\d{8}` sau khi bỏ
  khoảng trắng/chấm/gạch. LLM chỉ *tìm*, regex *gác cổng* trước khi lưu lead.
- `condenseFollowUpQuery` trong `rag/retriever.ts` bị thay thế — xoá cùng call-site
  trong `generateRAGAnswer` (giữ `buildEmbedQuery`/`isShortFollowUp` làm fallback).
- Chế độ `fast` (bridge sync cũ): bỏ qua tầng HIỂU như đang bỏ qua condense — giữ nguyên
  hành vi fail-open mặc định.

## 5. Tầng NÓI — sửa `rag/synthesis.ts`

`SynthesisOpts` thêm: `intent`, `buyingSignal`, `goal: "lead"|"order"|"consult"`,
`goalState: { hasContact: boolean, askedCount: number }`.

**a) Khối mục tiêu trong prompt** (thay `buildStyleRule` sales hiện tại):

- `lead`: tư vấn cho ĐÃ giá trị trước; chỉ mời để lại SĐT khi buyingSignal ấm/nóng HOẶC
  tài liệu không đủ trả lời; mời kèm lý do tự nhiên ("để bên em gọi tư vấn kỹ hơn").
- `order`: thấy `tin_hieu_mua` → chốt từng bước: xác nhận món + số lượng → xin tên/SĐT/địa
  chỉ → tóm tắt đơn xác nhận lại. Mỗi tin chỉ hỏi 1-2 thứ, không dồn.
- `consult`: map hành vi "reference" hiện có — không CTA, không xin gì. (Trường
  `answerStyle` cũ giữ nguyên cho tương thích; `goal` mới quyết định hành vi; bot cũ chưa
  set goal → suy từ answerStyle: sales→lead, reference→consult.)

**b) Quy tắc đúng thời điểm (chống spam):**

- Không mời SĐT/chốt ở tin đầu tiên của hội thoại; không mời khi intent `chit_chat`/`phan_nan`.
- `goalState.hasContact === true` → TUYỆT ĐỐI không xin lại liên hệ; chuyển giọng chăm sóc.
- `goalState.askedCount` — đếm số lần bot đã mời (server đếm bằng đánh dấu tin bot chứa lời
  mời, đơn giản: regex trên history các câu bot có "số điện thoại|sđt|liên hệ lại"). Đã mời
  ≥1 lần trong 3 lượt gần nhất → không mời tiếp lượt này. Khách từ chối → tôn trọng.

**c) Giọng VN tự nhiên:** câu ngắn, tách dòng thoáng; mặc định ≤4-5 câu (trừ khi khách hỏi
chi tiết); tối đa 1 emoji khi hợp; KHÔNG lặp cùng mẫu câu mở đầu với lượt trước (đưa 2 câu
mở đầu gần nhất của bot vào prompt để né); intent `phan_nan` → nhận lỗi/xoa dịu trước rồi
mới xử lý; intent `hoi_gia` → nói giá ngay câu đầu nếu tài liệu có.

**d) Few-shot:** nhúng 3-4 cặp hội thoại mẫu cố định (hỏi giá / tín hiệu mua+goal order /
phàn nàn / không có thông tin+goal lead) — viết sẵn trong code, không phụ thuộc tài liệu shop.

**e) Bảng intent→hướng dẫn** cố định trong code (`INTENT_GUIDANCE: Record<intent,string>`),
chèn 1 dòng `Ý ĐỊNH KHÁCH: ...` vào prompt. Rào cũ giữ nguyên: bám tài liệu, không bịa,
expand mode, quy tắc xưng hô.

## 6. Lead capture

**Bảng `leads` (migration `leads.sql`, chạy tay trên Supabase như các migration trước):**

```sql
create table if not exists leads (
  id text primary key,
  "botId" text not null,
  "sessionId" text,
  name text, phone text not null, address text,
  interest text,
  "buyingSignal" text,
  channel text,
  status text default 'new',        -- new | contacted | won | lost
  "createdAt" timestamptz default now()
);
alter table bots add column if not exists "conversationGoal" text;      -- lead|order|consult
alter table bots add column if not exists "notifyTelegramChatId" text;  -- báo lead
```

**Luồng lưu:** sau khi trả lời khách (không chặn reply): `contact.phone` qua
`isValidVNPhone` → tra lead cùng `botId+phone`: đã có → update `interest`/`sessionId`;
chưa → insert + đánh dấu `goalState.hasContact` cho session + notify. In-memory mirror +
Supabase (theo pattern bots/chatSessions hiện có; mất DB → RAM vẫn chạy, log warn).

**Notify Telegram:** bot có `notifyTelegramChatId` → gửi qua hạ tầng Telegram sẵn có:
"🔥 Lead mới — Tên · SĐT · Quan tâm: ... · Kênh: botcake". Chủ shop lấy chat id bằng cách
nhắn `/id` cho bot Telegram của mình (thêm handler `/id` trả về chat id — vài dòng trong
webhook Telegram sẵn có). Lỗi gửi → nuốt + log, không ảnh hưởng gì.

**API:** `GET /api/bots/:botId/leads` (list, mới nhất trước) ·
`PATCH /api/leads/:id` (đổi status) ·
`POST /api/bots/:botId/assistant-config` (lưu `conversationGoal` + `notifyTelegramChatId`).

## 7. Dashboard (src/App.tsx)

- **Tab "Khách tiềm năng"** (menu trái, cạnh "Lịch sử & Takeover"): bảng lead — tên, SĐT
  (bấm copy), quan tâm, kênh, thời gian, dropdown status; badge đếm lead `new` trên menu.
- **Card "Trợ lý bán hàng"** trong Cấu hình Bot AI: radio Mục tiêu hội thoại (Lấy liên hệ /
  Chốt đơn trong chat / Tư vấn thuần) + ô "Chat ID Telegram nhận thông báo lead" + nút Lưu.
- Sau deploy backend, deploy Pages thủ công như quy trình hiện tại.

## 8. Kiểm thử

- **Unit (vitest):** `parseUnderstandOutput` (JSON chuẩn/thiếu field/enum sai/fence/rác →
  không throw, ra mặc định) · `isValidVNPhone` (hợp lệ 0/84, loại số ảo, số có chấm/cách) ·
  quy tắc goalState (tin đầu không mời; hasContact không xin lại; askedCount chặn nhịp) ·
  `buildGroundedPrompt` chứa đúng intent/goal/few-shot · fail-open khi understand ném lỗi.
- **Bộ hội thoại chuẩn** `docs/eval/sales-conversations.md` — ~20 kịch bản VN (hỏi giá, "ib
  gia", tín hiệu mua, cho SĐT, từ chối cho SĐT, phàn nàn, chit-chat, hỏi ngoài tài liệu...)
  kèm hành vi kỳ vọng (CÓ/KHÔNG mời liên hệ, CÓ/KHÔNG chốt). Chạy tay qua Playground trước
  merge; đây là checklist nghiệm thu hành vi, không phải test tự động.
- **Kênh thật:** test lại qua Botcake async với Page hiện có (`bot-85wdtpqyv`).

## 9. Ngoài phạm vi đợt này

Function calling / catalog sản phẩm cấu trúc / tra tồn kho (đợt sau — Phương án C);
tự động follow-up khách im lặng; đa ngôn ngữ; A/B prompt.

## 10. Việc chủ dự án làm tay

Chạy `leads.sql` trên Supabase trước khi dùng thật (thiếu → leads chỉ nằm RAM, mất khi
restart — giống bài học botcakeAsync.sql).
