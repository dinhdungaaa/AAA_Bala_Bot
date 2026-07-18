# Huấn luyện phản hồi bot (v1)

Ngày: 2026-07-18. Trạng thái: đã duyệt thiết kế.

## Mục tiêu
Cho phép mỗi tenant tự "dạy" bot của mình cách trả lời khi thấy câu trả lời mặc định chưa phù hợp — không cần sửa code hay chờ nâng cấp sản phẩm. Hai hình thức huấn luyện, đều thuần prompt engineering (không fine-tune model):
- **Ví dụ mẫu (Q&A)**: cặp câu hỏi khách hay gặp + câu trả lời mong muốn → dạy bot cách trả lời cụ thể theo văn phong/nội dung mẫu.
- **Quy tắc chung**: chỉ thị ngắn dạng mệnh lệnh ("luôn làm X", "không bao giờ nói Y") → chèn thẳng vào system prompt, áp dụng cho mọi câu trả lời.

## Quyết định phạm vi (đã chốt)
- **Vị trí:** tab mới hoàn toàn trong sidebar, tên "Huấn luyện bot" — tách biệt với tab "Cấu hình" (tone/answerStyle/conversationGoal) và tab "train" hiện có (nạp tài liệu Kho Kiến Thức). Không trộn vào 2 tab đó để tránh nhầm lẫn giữa "tài liệu tra cứu" và "cách trả lời".
- **Điểm kích hoạt:** chỉ qua khu vực huấn luyện riêng này. Không sửa trực tiếp từ lịch sử hội thoại thật ở v1.
- **Cơ chế áp dụng Q&A:** few-shot chèn vào system prompt mỗi lần gọi Gemini — không lưu vào `knowledge_chunks`, không tham gia retrieval/similarity. Vì quota giới hạn số lượng nhỏ nên chèn toàn bộ (không cần embedding/similarity-selection cho examples ở v1).
- **Giới hạn:** theo gói thuê bao, cùng mô hình với `CONTENT_LIMITS` trong `billing.ts` — gói cao dùng thoải mái hơn, gói thấp giới hạn ít.

## Kiến trúc

### Dữ liệu — `training.sql`
Hai bảng mới, độc lập với `knowledge_chunks` (bản chất khác nhau: tài liệu tra cứu vs ví dụ hội thoại):

```sql
create table bot_training_examples (
  id text primary key,
  "botId" text not null references bots(id) on delete cascade,
  question text not null,
  answer text not null,
  "createdAt" timestamptz default now()
);
create index on bot_training_examples ("botId");

create table bot_training_rules (
  id text primary key,
  "botId" text not null references bots(id) on delete cascade,
  rule text not null,
  "isActive" boolean not null default true,
  "createdAt" timestamptz default now()
);
create index on bot_training_rules ("botId");
```
Không cần cột embedding — xem "Cơ chế áp dụng Q&A" ở trên.

### Giới hạn theo gói — `TRAINING_LIMITS` (billing.ts)
```ts
export const TRAINING_LIMITS: Record<"free"|"starter"|"pro"|"business"|"enterprise", { examples: number; rules: number }> = {
  free:       { examples: 5,   rules: 5 },
  starter:    { examples: 20,  rules: 15 },
  pro:        { examples: 50,  rules: 30 },
  business:   { examples: 150, rules: 50 },
  enterprise: { examples: 999999, rules: 999999 },
};
```
Đây là hạn mức **tổng số đang lưu** (không phải theo tháng như `CONTENT_LIMITS`) — không có khái niệm reset chu kỳ. Chặn cứng khi thêm mới vượt hạn mức của `resolveOwnerPlan` chủ bot (đồng bộ cách `checkContentGate` đang làm). Số cụ thể chỉnh được sau.

### Backend — API (server.ts)
Đi qua middleware bot-guard (token) hiện có + `assertResourceBotAccess` cho route theo id, đồng bộ [[tenant-authz-model]]:
- `GET /api/bots/:botId/training/examples` — list.
- `POST /api/bots/:botId/training/examples` — body `{ question, answer }`; kiểm `TRAINING_LIMITS[tier].examples` trước khi insert (đếm `bot_training_examples` theo `botId`).
- `DELETE /api/training/examples/:id`
- `GET /api/bots/:botId/training/rules` — list.
- `POST /api/bots/:botId/training/rules` — body `{ rule }`; kiểm `TRAINING_LIMITS[tier].rules`.
- `PATCH /api/training/rules/:id` — toggle `isActive` (không xóa cứng khi tắt tạm).
- `DELETE /api/training/rules/:id`

### Tích hợp vào prompt — `rag/synthesis.ts`
`buildGroundedPrompt` nhận thêm 2 field trong `SynthesisOpts`:
```ts
trainingExamples?: { question: string; answer: string }[];
trainingRules?: string[]; // chỉ rule có isActive=true, đã fetch sẵn ở tầng gọi
```
- **Rules**: chèn block mới `"QUY TẮC RIÊNG CỦA SHOP:"` ngay sau `styleBlock`, áp dụng cho **cả 2 mode** sales và reference (khác `FEW_SHOTS` hardcode chỉ áp dụng mode sales/goal).
- **Examples**: nối thêm ngay sau `FEW_SHOTS` (khi `useGoalMode`) hoặc thêm block riêng ngay sau `styleBlock` (khi mode reference), dạng:
  ```
  VÍ DỤ MẪU DO SHOP CUNG CẤP (ưu tiên theo phong cách này khi có xung đột với ví dụ mặc định):
  Khách: "{question}" → "{answer}"
  ```
- Tầng gọi (`server.ts`, nơi build `SynthesisOpts` hiện tại) fetch `bot_training_examples`/`bot_training_rules` theo `botId` — cache theo cùng cơ chế đang cache bot config, invalidate khi user thêm/xóa (giống cache invalidation của knowledge chunks).

### Frontend — tab "Huấn luyện bot" (App.tsx)
Theo pattern Tailwind card hiện có (`bg-white rounded-xl border border-slate-200 p-6`, accent emerald):
- Section "Ví dụ mẫu": form thêm (2 ô: câu hỏi khách / câu trả lời mong muốn), danh sách bên dưới, nút xóa từng dòng.
- Section "Quy tắc chung": form thêm 1 dòng rule, danh sách với toggle bật/tắt + nút xóa.
- Header mỗi section hiển thị "Đã dùng X/Y" theo `TRAINING_LIMITS` của gói hiện tại; disable nút thêm + hiện CTA nâng gói khi chạm giới hạn (tái dùng component usage-badge/CTA đang có ở Content Studio).
- Không xây preview riêng — ghi chú trong UI hướng dẫn dùng tab **Playground** sẵn có để thử ngay câu hỏi và xem bot trả lời theo huấn luyện mới (thay đổi có hiệu lực ngay, không cần "publish"/"deploy" riêng).

## Bảo mật & đa tenant
Mọi route training đi qua middleware token (bot-guard) + `assertResourceBotAccess`, đồng bộ [[tenant-authz-model]] — một bot không đọc/sửa được ví dụ/quy tắc của bot khác kể cả khi đoán được id.

## Kiểm thử
- Unit test `buildGroundedPrompt` với `trainingExamples`/`trainingRules` rỗng và có dữ liệu — xác nhận block xuất hiện đúng vị trí, đúng cả 2 mode sales/reference.
- Test quota: thêm example/rule tới đúng giới hạn gói → request tiếp theo bị chặn với thông báo rõ ràng.
- Test tenant-isolation: bot A không xóa/sửa được example của bot B (403).
- Kiểm thử thủ công sau deploy: nhập vài ví dụ/quy tắc mâu thuẫn nhẹ với default, xác nhận qua Playground bot ưu tiên theo bản huấn luyện của shop.

## Phạm vi & pha
- **Pha 1 (spec này):** 2 bảng + API CRUD + quota theo gói + tích hợp prompt + tab UI.
- Ngoài phạm vi v1: sửa trực tiếp từ lịch sử hội thoại thật, versioning/lịch sử chỉnh sửa, embedding/similarity-selection cho examples (chỉ cần nếu sau này tăng quota lên rất lớn).

## Nợ vận hành
- Owner chạy `training.sql` trên Supabase gốc trước khi bật tab.
- Thêm `bot_training_examples`/`bot_training_rules` vào `getSQLSchema()` (`supabaseService.ts`/`server.ts`) để khách dùng Supabase riêng ([[byo-supabase]]) tạo được 2 bảng này qua nút "Khởi tạo bảng" — nếu bỏ sót, tab huấn luyện sẽ lỗi khi lưu trên các bot BYO.
- Không cần env mới (dùng `GEMINI_API_KEY` sẵn có).
