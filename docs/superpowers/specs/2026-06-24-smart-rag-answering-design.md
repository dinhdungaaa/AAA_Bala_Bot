# Thiết kế: Nâng "trí thông minh" trả lời của bot (RAG kiểu NotebookLM)

- **Ngày:** 2026-06-24
- **Trạng thái:** Đã duyệt thiết kế, chờ viết plan
- **Mục tiêu:** Bot trả lời bám tài liệu, hiểu đúng trọng tâm câu hỏi, diễn giải tự nhiên (không copy nguyên văn) — giống cảm giác NotebookLM.

---

## 1. Bối cảnh & vấn đề

Hệ thống là multi-bot trên Express (`server.ts`), Gemini (`@google/genai`), Supabase. Pipeline trả lời hiện tại (`generateRAGAnswer`):

- **Truy hồi (retrieval):** chấm điểm **từ khoá + heuristic theo domain** (`scoreTextRetrieval`, `getChunkMetadata`, `inferChunkMetadata`) — nhận diện chủ đề "giá/thời lượng/ship", "ngày học", "giai đoạn khoá". KHÔNG dùng embedding.
- **Sinh:** Gemini với system prompt persona bán hàng, cấm trích nguyên văn.

**Pain người dùng báo:** câu trả lời **chung chung, máy móc, copy nguyên văn chữ trong tài liệu, đôi khi lệch trọng tâm câu hỏi.**

**Hai gốc rễ:**
1. Truy hồi từ-khoá đem nhầm/không trúng đoạn khi khách hỏi diễn đạt khác → **lệch trọng tâm**.
2. Khâu sinh "nhả" lại tài liệu thay vì hiểu rồi diễn giải trúng câu hỏi → **máy móc/copy**.

---

## 2. Quyết định đã chốt

| Hạng mục | Quyết định |
|---|---|
| Hướng | **A — Truy hồi ngữ nghĩa (embeddings) + viết lại khâu tổng hợp** |
| Lưu vector | Cột `embedding` trong bảng `knowledge_chunks` (mảng float JSON); load vào RAM, cosine bằng JS. KHÔNG dùng pgvector (chỉ cần khi scale hàng nghìn+ chunk) |
| Phong cách trả lời | **Per-bot**: trường `answerStyle` (`sales` hybrid bán hàng vs `reference` tra cứu trung lập) |
| Heuristic domain cũ | Gỡ/giảm (giá/ngày học/giai đoạn) — semantic thay thế tín hiệu chính |
| Chi phí model | **Tiết kiệm**: embedding dùng model rẻ/miễn phí; sinh dùng flash rẻ nhất đủ tốt; batch embedding lúc nạp |

---

## 3. Global constraints

- **Model tiết kiệm chi phí** (ràng buộc bắt buộc):
  - Embedding: model embedding rẻ/miễn phí của Gemini (vd dòng `text-embedding-*`). Batch nhiều chunk/lần gọi khi nạp tài liệu để giảm số request.
  - Sinh câu trả lời: model **flash** rẻ nhất còn đủ thông minh. **Xác minh id model hợp lệ/đời mới khi implement** (code hiện ghi `gemini-3.5-flash` — phải kiểm tra lại, nếu không hợp lệ thì đổi sang id thật).
  - Không gọi embedding lại nếu nội dung chunk không đổi (lưu vector kèm hash/nội dung).
- Không phá hành vi đa kênh hiện có (Telegram/Facebook/Zalo đều gọi chung `generateRAGAnswer`).
- Suy giảm mượt: Supabase/embedding lỗi → fallback an toàn (không crash, dùng câu chốt chuyển nhân viên của bot).
- Tiếng Việt, giữ hậu xử lý `postProcessBotReply`.

---

## 4. Kiến trúc — các unit

| Unit | Trách nhiệm | Phụ thuộc |
|---|---|---|
| `ragEmbeddings` | `embedText(text): Promise<number[]>` + `embedBatch(texts): Promise<number[][]>` qua Gemini embedding. `cosineSim(a,b): number`. | `@google/genai` |
| Ingestion (sửa) | Khi cắt chunk: tính embedding, lưu cột `knowledge_chunks.embedding`. | `ragEmbeddings`, Supabase |
| Backfill | Endpoint/owner-only `POST /api/rag/reembed` (hoặc script) re-embed các chunk đang `isActive` chưa có embedding. | `ragEmbeddings`, Supabase |
| `semanticRetriever` | `retrieve(bot, query, topK)` → embed query → cosine với chunk active của bot → top-K `{chunk, score}`. | `ragEmbeddings` |
| `groundedSynthesis` | Dựng prompt grounded + cắm `answerStyle`, gọi Gemini, trả `{text, sources, fallbackTriggered}`. | Gemini |
| `generateRAGAnswer` (sửa) | Điều phối: retrieve → ngưỡng tự tin → synthesis/fallback. Giữ nguyên chữ ký để các kênh không phải đổi. | trên |

Giữ **đúng chữ ký** `generateRAGAnswer(bot, query, userInfo?, replyOptions?): Promise<{text, sources, fallbackTriggered}>` để Telegram/Facebook/Zalo không phải sửa.

---

## 5. Luồng dữ liệu (truy vấn)

```
câu hỏi
  → (tùy chọn) viết lại câu hỏi cho truy hồi tốt hơn
  → embedText(query)
  → cosine với embedding các chunk active của bot → top-K {chunk, score}
  → maxScore < THRESHOLD ?
       ├─ yes → đường "ít tự tin": trả lời "chưa có thông tin trong tài liệu" + fallback bot (chuyển nhân viên)
       └─ no  → groundedSynthesis(bot, query, topK passages, answerStyle)
  → postProcessBotReply
  → { text, sources: topK→{id,name,score}, fallbackTriggered }
```

- `THRESHOLD`: ngưỡng cosine tối thiểu (cấu hình hằng số; tinh chỉnh bằng bộ eval ở §8).
- `topK`: mặc định 4–6 đoạn (cấu hình hằng số).

---

## 6. Khâu tổng hợp grounded (chống máy móc/copy — gốc rễ pain)

System prompt mới, các điều khoản bắt buộc:
1. **Hiểu trọng tâm**: xác định khách thực sự hỏi gì, trả lời thẳng vào đó (không lan man).
2. **Diễn giải lại**: viết bằng lời tự nhiên của trợ lý; **CẤM copy nguyên văn** câu/đoạn từ tài liệu; cấm để lộ tiêu đề/mã mục/"Tài liệu nguồn #".
3. **Bám tài liệu**: chỉ dùng thông tin trong các đoạn được cấp; được tổng hợp/đối chiếu nhiều đoạn.
4. **Thành thật**: nếu các đoạn không chứa câu trả lời → nói rõ chưa có thông tin và chuyển hướng theo fallback của bot; KHÔNG bịa.
5. **Phong cách theo `answerStyle`**:
   - `sales`: giọng thân thiện, chốt đơn, có CTA — nhưng vẫn bám tài liệu + trúng trọng tâm.
   - `reference`: giọng trung lập, súc tích, có thể nêu nguồn — không bán hàng.
- Nhiệt độ ~0.4 (cân bằng tự nhiên vs chính xác).
- Truyền top-K đoạn (đánh số) + câu hỏi + (tùy chọn) vài lượt hội thoại gần nhất (`recentMessages`).

---

## 7. Cấu hình per-bot

- Thêm `answerStyle?: "sales" | "reference"` vào `BotConfig` (`src/types.ts`), mặc định `sales` (giữ hành vi cũ cho bot chưa set).
- Lưu kèm bot (Supabase + local). Hiện trong admin UI (ô select cạnh cấu hình bot), theo pattern các trường bot hiện có.

---

## 8. Đo lường / eval (để xác nhận "thông minh hơn" thật)

- **Bộ eval**: file `docs/rag-eval/<bot>.jsonl` gồm `{question, mustInclude[], mustNotBeVerbatimOf?}` cho vài bot thật.
- **Chạy qua** endpoint owner-only `POST /api/rag/eval` (hoặc script) gọi pipeline mới, chấm: (a) top-K có chứa chunk đúng không, (b) câu trả lời có chứa ý `mustInclude`, (c) không trùng nguyên văn quá ngưỡng (vd >40 ký tự liên tiếp khớp tài liệu = fail "copy").
- So **trước/sau** trên cùng bộ câu hỏi để chứng minh cải thiện trúng đích + giảm copy.
- Dùng để tinh chỉnh `THRESHOLD` và `topK`.

---

## 9. Unit test (logic thuần, vitest đã có)

- `cosineSim`: vector trùng → 1; trực giao → 0; thứ tự đúng.
- `semanticRetriever.retrieve` với embedding GIẢ (inject hàm embed) → xếp hạng đúng theo cosine, tôn trọng topK, lọc theo botId + isActive.
- Bộ dựng prompt grounded: chứa đủ đoạn, chứa luật cấm-copy, đổi theo `answerStyle`.
- Ngưỡng tự tin: maxScore < THRESHOLD → đường fallback (không gọi synthesis).

(Phần gọi Gemini thật + ingestion verify thủ công qua simulate, không unit test.)

---

## 10. Migration / tương thích

- SQL: thêm cột `embedding jsonb` (hoặc `text`) vào `knowledge_chunks` (idempotent `add column if not exists`).
- Backfill embedding cho chunk cũ qua `POST /api/rag/reembed` (owner-only) — chạy 1 lần sau deploy.
- Gỡ heuristic domain (`scoreTextRetrieval`, `getChunkMetadata`, `inferChunkMetadata`, retrieval profiles) khỏi đường truy hồi chính; giữ lại tiện ích còn dùng chỗ khác (rà trước khi xoá).
- Rollout an toàn: cờ env `SMART_RAG_ENABLED` (mặc định bật ở dev, có thể tắt để về đường cũ nếu sự cố) — hoặc nếu gỡ hẳn heuristic thì bỏ cờ. Quyết định ở plan sau khi rà mức độ phụ thuộc.

---

## 11. Ngoài phạm vi (YAGNI)

- Không pgvector (chỉ in-JS cosine).
- Không rerank model riêng (chỉ cosine + tùy chọn query-rewrite nhẹ).
- Không trích dẫn inline kiểu footnote của NotebookLM ở giao diện khách (chỉ `sources` như hiện tại) — trừ khi sau này muốn.
- Không đổi cơ chế chunking cốt lõi (chỉ thêm embedding); tinh chỉnh kích thước chunk để sau nếu eval đòi.

---

## 12. Tiêu chí thành công

1. Khách hỏi cùng ý nhưng **diễn đạt khác từ khoá** → vẫn lấy đúng đoạn (top-K chứa chunk đúng) — đo bằng eval §8.
2. Câu trả lời **không copy nguyên văn** (qua kiểm tra trùng chuỗi) và **trúng trọng tâm** câu hỏi.
3. Hỏi thứ **không có trong tài liệu** → bot nói chưa có/chuyển nhân viên, **không bịa**.
4. `answerStyle` đổi giọng đúng (sales vs reference) mà bộ não dùng chung.
5. Embedding **persistent** (không re-embed mỗi restart) và chi phí thấp (batch, không lặp).
6. Telegram/Facebook/Zalo vẫn chạy (chữ ký `generateRAGAnswer` không đổi).
