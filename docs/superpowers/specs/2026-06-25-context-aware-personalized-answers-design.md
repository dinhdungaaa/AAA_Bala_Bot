# Context-Aware & Personalized Answers — Design

**Date:** 2026-06-25
**Goal:** Bot trả lời thông minh hơn: xưng tên khách tự nhiên và đọc lịch sử hội thoại để hiểu câu hỏi nối tiếp, bám đúng trọng tâm.

## Vấn đề

`generateRAGAnswer` (server.ts) đã nhận `userInfo` (fullName/username) và `replyOptions.recentMessages`, và đã tính sẵn `targetName`/`pronoun` qua `getGenderAndName`. Nhưng các dữ liệu này **không được đưa vào** prompt tổng hợp (`rag/synthesis.ts`). Hệ quả:
- Câu trả lời chính không gọi tên khách (chỉ nhánh chit-chat dùng).
- LLM không thấy lịch sử → không hiểu câu hỏi nối tiếp ("cái đó", "loại kia"), dễ trả lời lạc trọng tâm.

## Quyết định (đã chốt với user)

- **Xưng tên:** tự nhiên, không lạm dụng — gọi tên ở câu chào / khi nhấn mạnh, không lặp mỗi câu. Không có tên thật → dùng "mình", không bịa.
- **Lịch sử:** đưa **6 lượt gần nhất** vào ngữ cảnh.

## Thay đổi

### 1. `rag/synthesis.ts` — prompt giàu ngữ cảnh

`buildGroundedPrompt(bot, passages, opts)` mở rộng `opts`:
```ts
opts: {
  answerStyle: "sales" | "reference";
  customer?: { lead: string; hasRealName: boolean }; // lead = "Anh Dũng" | "Chị Lan" | "mình"
  history?: { role: "user" | "bot"; text: string }[]; // <= 6, đã cắt sẵn
}
```
- Nếu `customer?.hasRealName`: chèn dòng hướng dẫn xưng hô tự nhiên + tên (`customer.lead`).
  Nếu không: chèn dòng dùng "mình", KHÔNG bịa tên.
- Nếu `history?.length`: render block "HỘI THOẠI GẦN ĐÂY" (mỗi dòng `Khách:`/`Bạn:`) + quy tắc hiểu câu hỏi nối tiếp; không lặp lại lời chào nếu đã chào ở lượt trước.
- History rỗng + customer rỗng → prompt **giống hệt** bản hiện tại (không hồi quy).

`synthesizeAnswer(...)` truyền nguyên `opts` xuống `buildGroundedPrompt`.

### 2. Truy hồi nhận biết ngữ cảnh (server.ts)

Trước khi embed câu hỏi: nếu câu hỏi ngắn/ám chỉ (độ dài < ~25 ký tự **hoặc** chứa từ chỉ định "cái đó/loại kia/nó/vậy/thế"), ghép câu **khách** hỏi liền trước (lượt user gần nhất trong `recentMessages`) vào text đem đi embed → tìm đúng chunk. Chỉ dùng cho embed; câu hiển thị/synthesis vẫn là câu gốc.

### 3. `generateRAGAnswer` (server.ts) nối dữ liệu

- Tính `customerLead`/`hasRealName` từ `targetName`/`pronoun` đã có.
- Map `recentMessages.slice(-6)` → `{role, text}` (bỏ message rỗng).
- Truyền `customer` + `history` vào **cả 2** nhánh `synthesizeAnswer` (grounded và low-conf).

## An toàn / không hồi quy

- Không thêm lần gọi LLM, không round-trip mới.
- Không đổi schema DB, không đổi UI.
- `postProcessBotReply` giữ nguyên (vẫn chống lặp lời chào).
- Thiếu dữ liệu → hành vi cũ.

## Test (`rag/synthesis.test.ts`)

1. Có tên thật → prompt chứa `customer.lead` và chỉ dẫn xưng hô tự nhiên.
2. Vô danh → prompt KHÔNG chứa tên bịa, có chỉ dẫn dùng "mình".
3. Có history → prompt chứa block hội thoại.
4. History rỗng + customer rỗng → prompt bằng đúng bản cũ (snapshot/contains base rules).
5. Helper gộp ngữ cảnh embed: câu ngắn "cái đó bao nhiêu?" + lượt trước "xà lách thủy canh" → text embed chứa cả hai.

## Chi phí

+~6 dòng hệ thống + ≤6 lượt ngắn mỗi request. Không đổi model (`gemini-2.5-flash` + `gemini-embedding-001`). Đúng tiêu chí hiệu quả kinh tế.
