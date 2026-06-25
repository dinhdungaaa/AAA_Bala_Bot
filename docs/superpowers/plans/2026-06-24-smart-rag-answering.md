# Smart RAG Answering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot trả lời bám tài liệu, trúng trọng tâm, diễn giải tự nhiên (không copy nguyên văn) bằng truy hồi ngữ nghĩa (embeddings) + khâu tổng hợp grounded — thay cho truy hồi từ-khoá/heuristic hiện tại.

**Architecture:** Thêm 3 module thuần `rag/embeddings.ts`, `rag/retriever.ts`, `rag/synthesis.ts` (logic tách bạch, test được với hàm embed giả). `generateRAGAnswer` trong `server.ts` được nối lại: embed query → cosine top-K → ngưỡng tự tin → tổng hợp grounded. Embedding lưu cột `knowledge_chunks.embedding`, tính cosine bằng JS (không pgvector). Phong cách trả lời cấu hình per-bot.

**Tech Stack:** Node/TS ESM, Express, `@google/genai` (Gemini embeddings + flash), Supabase, Vitest, React 19.

## Global Constraints

- **Model tiết kiệm chi phí**: embedding = `text-embedding-004` (rẻ/miễn phí); sinh = flash rẻ nhất hợp lệ. **Verify id model hợp lệ khi implement** (code cũ ghi `gemini-3.5-flash` — kiểm tra, đổi nếu sai). Batch embedding khi nạp.
- Không gọi embedding lại nếu nội dung chunk không đổi.
- **Giữ NGUYÊN chữ ký** `generateRAGAnswer(bot, query, userInfo?, replyOptions?): Promise<{text, sources, fallbackTriggered}>` (Telegram/Facebook/Zalo dùng chung).
- Suy giảm mượt: thiếu API key / embedding lỗi / Supabase lỗi → fallback an toàn, không crash.
- Tiếng Việt; giữ `postProcessBotReply`.
- ESM: import nội bộ dùng đuôi `.js`.

### Chữ ký/đối tượng có sẵn (consume, KHÔNG đổi)

```ts
// server.ts
function getAIClient(): GoogleGenAI | null;     // null nếu chưa cấu hình key
// gọi sinh: ai.models.generateContent({ model, contents, config: { systemInstruction, temperature } })
// trả về: response.text  (chuỗi)
let knowledgeChunks: KnowledgeChunk[];
function postProcessBotReply(text: string, options?: { shouldGreet?: boolean; recentMessages?: Message[] }): string;

// supabaseService.ts (đã export)
function getSupabaseClient(): SupabaseClient | null;
async function dbGetChunks(botId: string, localFallback: KnowledgeChunk[]): Promise<KnowledgeChunk[]>;
async function dbSaveChunk(chunk: KnowledgeChunk): Promise<boolean>;
async function dbUpdateChunk(id: string, updates: Partial<KnowledgeChunk>): Promise<boolean>;
```

### Type tham chiếu (src/types.ts)

```ts
interface KnowledgeChunk {
  id: string; botId: string; sourceId: string; title: string; content: string;
  category: 'product'|'policy'|'pricing'|'shipping'|'warranty'|'hdsd'|'faq';
  tags: string[]; isActive: boolean; metadata?: {...};
  // Task 1 thêm: embedding?: number[]; embeddingHash?: string;
}
interface BotConfig {
  id; name; field; tone: 'professional'|'friendly'|'brief'|'sales'|'support'; ...
  // Task 1 thêm: answerStyle?: 'sales' | 'reference';
}
```

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `rag/embeddings.ts` (Create) | `embedText`, `embedBatch` (Gemini), `cosineSim`. Cô lập mọi tương tác embedding API. |
| `rag/retriever.ts` (Create) | `rankBySimilarity` (thuần), `retrieveSemantic(bot, query, topK)` (embed query + cosine chunks). |
| `rag/synthesis.ts` (Create) | `buildGroundedPrompt(bot, query, passages, opts)` (thuần) + `synthesizeAnswer(...)` (gọi Gemini). |
| `rag/__tests__/*.test.ts` (Create) | Unit test cosine, ranking, prompt builder, ngưỡng. |
| `rag/constants.ts` (Create) | `EMBED_MODEL`, `GEN_MODEL`, `TOP_K`, `SIM_THRESHOLD`. |
| `src/types.ts` (Modify) | Thêm `embedding`/`embeddingHash` vào KnowledgeChunk; `answerStyle` vào BotConfig. |
| `server.ts` (Modify) | Nối retriever+synthesis vào `generateRAGAnswer`; tạo embedding lúc nạp chunk; endpoint `POST /api/rag/reembed` + `POST /api/rag/eval`; gỡ heuristic domain khỏi đường chính. |
| `smartRag.sql` (Create) | `alter table knowledge_chunks add column if not exists embedding jsonb`. |
| `src/App.tsx` (Modify) | Ô chọn `answerStyle` trong cấu hình bot. |
| `docs/rag-eval/sample.jsonl` (Create) | Bộ câu hỏi eval mẫu. |

> **Lưu ý API embedding:** `@google/genai` (^2.4) — `ai.models.embedContent({ model, contents })`. Shape trả về theo phiên bản có thể khác (vd `res.embeddings[0].values` hoặc `res.embedding.values`). Cô lập trong `rag/embeddings.ts`; nếu lệch, chỉ sửa file đó để trả `number[]`.

---

## Task 1: Migration, types, constants

**Files:**
- Create: `smartRag.sql`, `rag/constants.ts`
- Modify: `src/types.ts`

**Interfaces:**
- Produces: cột `knowledge_chunks.embedding`; `KnowledgeChunk.embedding?`, `KnowledgeChunk.embeddingHash?`; `BotConfig.answerStyle?`; hằng số `EMBED_MODEL, GEN_MODEL, TOP_K, SIM_THRESHOLD`.

- [ ] **Step 1: SQL migration `smartRag.sql`**

```sql
-- Luu vector embedding cho tung chunk (mang float JSON). Khong dung pgvector.
alter table knowledge_chunks add column if not exists embedding jsonb;
alter table knowledge_chunks add column if not exists embedding_hash text;
```

- [ ] **Step 2: Thêm field vào `src/types.ts`**

Trong `interface KnowledgeChunk`, sau `isActive: boolean;` thêm:
```ts
  embedding?: number[];
  embeddingHash?: string;
```
Trong `interface BotConfig`, sau `createdAt: string;` (trước `}`) thêm:
```ts
  answerStyle?: 'sales' | 'reference';
```

- [ ] **Step 3: Tạo `rag/constants.ts`**

```ts
// Model embedding re/mien phi cua Gemini.
export const EMBED_MODEL = "text-embedding-004";
// Model sinh: flash re. VERIFY id hop le khi implement (xem Task 5 Step 0).
export const GEN_MODEL = "gemini-2.5-flash";
// So doan truy hoi toi da dua vao prompt.
export const TOP_K = 5;
// Nguong cosine toi thieu de coi la "co bang chung" (tinh chinh bang eval Task 8).
export const SIM_THRESHOLD = 0.62;
```

- [ ] **Step 4: tsc check**

Run: `npx tsc --noEmit`
Expected: không lỗi mới tham chiếu các file trên.

- [ ] **Step 5: Commit**

```bash
git add smartRag.sql rag/constants.ts src/types.ts
git commit -m "feat(rag): add embedding column, chunk/bot fields, constants"
```

---

## Task 2: Embeddings module (cosine TDD + Gemini wrapper)

**Files:**
- Create: `rag/embeddings.ts`, `rag/__tests__/embeddings.test.ts`

**Interfaces:**
- Consumes: `getAIClient` (sẽ inject), `EMBED_MODEL`.
- Produces:
  - `cosineSim(a: number[], b: number[]): number`
  - `embedText(ai: GoogleGenAI, text: string): Promise<number[]>`
  - `embedBatch(ai: GoogleGenAI, texts: string[]): Promise<number[][]>`
  - `hashText(text: string): string` (để bỏ qua re-embed khi nội dung không đổi)

- [ ] **Step 1: Viết test thất bại `rag/__tests__/embeddings.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { cosineSim, hashText } from "../embeddings.js";

describe("cosineSim", () => {
  it("vector trung nhau -> 1", () => {
    expect(cosineSim([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
  });
  it("truc giao -> 0", () => {
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });
  it("nguoc huong -> -1", () => {
    expect(cosineSim([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });
  it("vector rong / lech chieu -> 0 (an toan)", () => {
    expect(cosineSim([], [])).toBe(0);
    expect(cosineSim([1, 2], [1])).toBe(0);
  });
});

describe("hashText", () => {
  it("on dinh va khac nhau theo noi dung", () => {
    expect(hashText("abc")).toBe(hashText("abc"));
    expect(hashText("abc")).not.toBe(hashText("abd"));
  });
});
```

- [ ] **Step 2: Chạy test — FAIL**

Run: `npm test`
Expected: FAIL — không import được `../embeddings.js`.

- [ ] **Step 3: Viết `rag/embeddings.ts`**

```ts
import type { GoogleGenAI } from "@google/genai";
import { createHash } from "crypto";
import { EMBED_MODEL } from "./constants.js";

export function cosineSim(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function hashText(text: string): string {
  return createHash("sha1").update(text || "").digest("hex");
}

// Chuan hoa shape tra ve cua embedContent ve number[] (cach ly khac biet phien ban SDK).
function extractVector(res: any): number[] {
  const e = res?.embeddings?.[0] ?? res?.embedding;
  const v = e?.values ?? e;
  return Array.isArray(v) ? (v as number[]) : [];
}
function extractVectors(res: any): number[][] {
  const arr = res?.embeddings ?? [];
  return arr.map((e: any) => (Array.isArray(e?.values) ? e.values : Array.isArray(e) ? e : []));
}

export async function embedText(ai: GoogleGenAI, text: string): Promise<number[]> {
  const res = await ai.models.embedContent({ model: EMBED_MODEL, contents: text } as any);
  return extractVector(res);
}

export async function embedBatch(ai: GoogleGenAI, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await ai.models.embedContent({ model: EMBED_MODEL, contents: texts } as any);
  const vecs = extractVectors(res);
  // Fallback: neu SDK khong batch, embed tung cai.
  if (vecs.length !== texts.length) {
    const out: number[][] = [];
    for (const t of texts) out.push(await embedText(ai, t));
    return out;
  }
  return vecs;
}
```

> **Verify khi implement:** chạy thử `embedText` với key thật (hoặc xem `node_modules/@google/genai` types) để xác nhận shape; `extractVector` đã thử cả `embeddings[0].values` lẫn `embedding.values`. Nếu khác, chỉ sửa `extractVector/extractVectors`.

- [ ] **Step 4: Chạy test — PASS**

Run: `npm test`
Expected: PASS (cosine + hash). (embedText/embedBatch không test ở đây — gọi API thật.)

- [ ] **Step 5: Commit**

```bash
git add rag/embeddings.ts rag/__tests__/embeddings.test.ts
git commit -m "feat(rag): embeddings module (cosine, hash, gemini embed)"
```

---

## Task 3: Semantic retriever (TDD với embed giả)

**Files:**
- Create: `rag/retriever.ts`, `rag/__tests__/retriever.test.ts`

**Interfaces:**
- Consumes: `cosineSim` (Task 2); `KnowledgeChunk`; `TOP_K`.
- Produces:
  - `rankBySimilarity(queryVec: number[], chunks: KnowledgeChunk[], topK: number): Array<{ chunk: KnowledgeChunk; score: number }>` — chỉ xét chunk có `embedding`, sắp xếp giảm dần cosine, cắt topK.

- [ ] **Step 1: Viết test thất bại `rag/__tests__/retriever.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { rankBySimilarity } from "../retriever.js";
import type { KnowledgeChunk } from "../../src/types.js";

function chunk(id: string, embedding: number[]): KnowledgeChunk {
  return { id, botId: "b1", sourceId: "s1", title: id, content: id,
    category: "product", tags: [], isActive: true, embedding } as KnowledgeChunk;
}

describe("rankBySimilarity", () => {
  const q = [1, 0, 0];
  const chunks = [
    chunk("near", [0.9, 0.1, 0]),
    chunk("far", [0, 1, 0]),
    chunk("mid", [0.6, 0.5, 0]),
    chunk("no-embed", undefined as any),
  ];
  it("xep theo cosine giam dan, bo chunk khong co embedding", () => {
    const r = rankBySimilarity(q, chunks, 10);
    expect(r.map(x => x.chunk.id)).toEqual(["near", "mid", "far"]);
    expect(r.every(x => typeof x.score === "number")).toBe(true);
  });
  it("ton trong topK", () => {
    expect(rankBySimilarity(q, chunks, 2).length).toBe(2);
  });
  it("queryVec rong -> []", () => {
    expect(rankBySimilarity([], chunks, 5)).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy test — FAIL**

Run: `npm test`
Expected: FAIL — không import được `../retriever.js`.

- [ ] **Step 3: Viết `rag/retriever.ts`**

```ts
import type { KnowledgeChunk } from "../src/types.js";
import { cosineSim } from "./embeddings.js";

export function rankBySimilarity(
  queryVec: number[],
  chunks: KnowledgeChunk[],
  topK: number
): Array<{ chunk: KnowledgeChunk; score: number }> {
  if (!queryVec?.length) return [];
  return chunks
    .filter(c => Array.isArray(c.embedding) && c.embedding.length > 0)
    .map(c => ({ chunk: c, score: cosineSim(queryVec, c.embedding as number[]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, topK));
}
```

- [ ] **Step 4: Chạy test — PASS**

Run: `npm test`
Expected: PASS (toàn bộ suite vẫn xanh).

- [ ] **Step 5: Commit**

```bash
git add rag/retriever.ts rag/__tests__/retriever.test.ts
git commit -m "feat(rag): semantic ranking by cosine with tests"
```

---

## Task 4: Grounded synthesis prompt (TDD) + Gemini call

**Files:**
- Create: `rag/synthesis.ts`, `rag/__tests__/synthesis.test.ts`

**Interfaces:**
- Consumes: `BotConfig`, `KnowledgeChunk`, `GEN_MODEL`, `getAIClient`-style `GoogleGenAI`.
- Produces:
  - `buildGroundedPrompt(bot: BotConfig, passages: Array<{chunk: KnowledgeChunk}>, opts: { answerStyle: 'sales'|'reference' }): string`
  - `synthesizeAnswer(ai, bot, query, passages, opts): Promise<string>`

- [ ] **Step 1: Viết test thất bại `rag/__tests__/synthesis.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildGroundedPrompt } from "../synthesis.js";
import type { BotConfig, KnowledgeChunk } from "../../src/types.js";

const bot = { id: "b1", name: "Shop AAA", field: "nông sản" } as BotConfig;
const passages = [
  { chunk: { title: "Giá rau", content: "Súp lơ 45k/kg, giao 2h nội thành." } as KnowledgeChunk },
];

describe("buildGroundedPrompt", () => {
  it("chua noi dung doan + luat cam copy nguyen van", () => {
    const p = buildGroundedPrompt(bot, passages, { answerStyle: "sales" });
    expect(p).toContain("Súp lơ 45k/kg");
    expect(p.toLowerCase()).toMatch(/không.*nguyên văn|cấm.*sao chép|diễn giải/);
  });
  it("doi giong theo answerStyle", () => {
    const sales = buildGroundedPrompt(bot, passages, { answerStyle: "sales" });
    const ref = buildGroundedPrompt(bot, passages, { answerStyle: "reference" });
    expect(sales).not.toBe(ref);
    expect(sales.toLowerCase()).toMatch(/bán|chốt|tư vấn|CTA/i);
    expect(ref.toLowerCase()).toMatch(/trung lập|khách quan|súc tích/);
  });
  it("khong co doan -> yeu cau noi chua co thong tin", () => {
    const p = buildGroundedPrompt(bot, [], { answerStyle: "reference" });
    expect(p.toLowerCase()).toMatch(/chưa có thông tin|không có trong tài liệu/);
  });
});
```

- [ ] **Step 2: Chạy test — FAIL**

Run: `npm test`
Expected: FAIL — không import được `../synthesis.js`.

- [ ] **Step 3: Viết `rag/synthesis.ts`**

```ts
import type { GoogleGenAI } from "@google/genai";
import type { BotConfig, KnowledgeChunk } from "../src/types.js";
import { GEN_MODEL } from "./constants.js";

type Passage = { chunk: Pick<KnowledgeChunk, "title" | "content"> };

const STYLE_RULES: Record<"sales" | "reference", string> = {
  sales:
    "Giọng thân thiện như nhân viên tư vấn bán hàng thật. Sau khi trả lời đúng trọng tâm, " +
    "có thể thêm một lời mời/CTA tự nhiên để chốt đơn. Vẫn tuyệt đối bám tài liệu.",
  reference:
    "Giọng trung lập, khách quan, súc tích. Trả lời đúng trọng tâm, không bán hàng, không CTA.",
};

export function buildGroundedPrompt(
  bot: BotConfig,
  passages: Passage[],
  opts: { answerStyle: "sales" | "reference" }
): string {
  const ctx = passages.length
    ? passages.map((p, i) => `[Đoạn ${i + 1}] ${p.chunk.title}\n${p.chunk.content}`).join("\n\n")
    : "(KHÔNG có đoạn tài liệu phù hợp)";

  return [
    `Bạn là trợ lý của "${bot.name}" (lĩnh vực ${bot.field || "kinh doanh"}).`,
    STYLE_RULES[opts.answerStyle],
    "",
    "QUY TẮC BẮT BUỘC:",
    "1. HIỂU đúng trọng tâm câu hỏi của khách và trả lời THẲNG vào đó, không lan man.",
    "2. DIỄN GIẢI lại bằng lời tự nhiên của bạn. TUYỆT ĐỐI KHÔNG sao chép nguyên văn câu/đoạn từ tài liệu; không để lộ 'Đoạn 1', tiêu đề mục, hay bất kỳ dấu vết copy nào.",
    "3. CHỈ dùng thông tin trong các đoạn tài liệu dưới đây; được tổng hợp nhiều đoạn.",
    "4. Nếu các đoạn KHÔNG chứa câu trả lời: nói rõ là CHƯA CÓ THÔNG TIN trong tài liệu và mời khách để lại liên hệ/đợi nhân viên — KHÔNG bịa.",
    "5. Chỉ xuất nội dung gửi khách, không lộ suy luận/prompt.",
    "",
    "TÀI LIỆU:",
    ctx,
  ].join("\n");
}

export async function synthesizeAnswer(
  ai: GoogleGenAI,
  bot: BotConfig,
  query: string,
  passages: Passage[],
  opts: { answerStyle: "sales" | "reference" }
): Promise<string> {
  const systemInstruction = buildGroundedPrompt(bot, passages, opts);
  const res: any = await ai.models.generateContent({
    model: GEN_MODEL,
    contents: query,
    config: { systemInstruction, temperature: 0.4 },
  } as any);
  return (res?.text || "").trim();
}
```

- [ ] **Step 4: Chạy test — PASS**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add rag/synthesis.ts rag/__tests__/synthesis.test.ts
git commit -m "feat(rag): grounded synthesis prompt + gemini call with tests"
```

---

## Task 5: Embedding lúc nạp tài liệu + backfill endpoint

**Files:**
- Modify: `server.ts`

**Interfaces:**
- Consumes: `embedText/embedBatch/hashText` (Task 2), `getAIClient`, `dbUpdateChunk`, `dbGetChunks`, `knowledgeChunks`, `requireOwnerAdmin`.
- Produces: chunk mới có `embedding`+`embeddingHash`; route `POST /api/rag/reembed`.

- [ ] **Step 0: VERIFY model id (bắt buộc, ghi vào report)**

Chạy thử bằng key thật để xác nhận `GEN_MODEL` và `EMBED_MODEL` hợp lệ:
```bash
node -e 'const {GoogleGenAI}=require("@google/genai");const ai=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});(async()=>{try{const e=await ai.models.embedContent({model:"text-embedding-004",contents:"test"});console.log("embed dims:",(e.embeddings?.[0]?.values||e.embedding?.values||[]).length);const g=await ai.models.generateContent({model:"gemini-2.5-flash",contents:"say hi"});console.log("gen:",g.text?.slice(0,30));}catch(err){console.log("ERR",err.message);}})();'
```
Nếu model id lỗi → đổi `GEN_MODEL`/`EMBED_MODEL` trong `rag/constants.ts` sang id hợp lệ (vd `gemini-2.0-flash`, `gemini-flash-latest`) và ghi lại id đã chọn.

- [ ] **Step 1: Thêm import vào `server.ts`** (cạnh các import hiện có)

```ts
import { embedText, embedBatch, hashText } from "./rag/embeddings.js";
```

- [ ] **Step 2: Helper tạo embedding cho 1 chunk** (đặt gần các helper RAG, trước `generateRAGAnswer`)

```ts
// Tao embedding cho mot chunk (an toan: loi -> bo qua, khong chan luong nap).
async function attachChunkEmbedding(chunk: KnowledgeChunk): Promise<KnowledgeChunk> {
  const ai = getAIClient();
  if (!ai) return chunk;
  const text = `${chunk.title}\n${chunk.content}`.trim();
  const h = hashText(text);
  if (chunk.embedding && chunk.embeddingHash === h) return chunk; // khong doi -> bo qua
  try {
    chunk.embedding = await embedText(ai, text);
    chunk.embeddingHash = h;
  } catch (e: any) {
    console.warn("[RAG] embed chunk failed:", e?.message || e);
  }
  return chunk;
}
```

- [ ] **Step 3: Gọi khi tạo chunk mới** — tại MỖI nơi `knowledgeChunks.push(newChunk)` rồi `dbSaveChunk(newChunk)` (server.ts ~983, ~1203, ~1334), chèn `await attachChunkEmbedding(newChunk);` NGAY TRƯỚC `dbSaveChunk(newChunk)`. Ví dụ:

```ts
await attachChunkEmbedding(newChunk);
await dbSaveChunk(newChunk);
```

- [ ] **Step 4: Endpoint backfill `POST /api/rag/reembed`** (đặt cạnh route `/api/supabase/...`, owner-only)

```ts
app.post("/api/rag/reembed", async (req, res) => {
  if (!requireOwnerAdmin(req, res)) return;
  const ai = getAIClient();
  if (!ai) return res.status(400).json({ error: "GEMINI_API_KEY chưa cấu hình" });
  const botId = (req.body?.botId as string) || "";
  let all = await dbGetChunks(botId, knowledgeChunks.filter(c => !botId || c.botId === botId));
  all = all.filter(c => c.isActive);
  let done = 0, skipped = 0, failed = 0;
  for (const c of all) {
    const text = `${c.title}\n${c.content}`.trim();
    const h = hashText(text);
    if (c.embedding && c.embeddingHash === h) { skipped++; continue; }
    try {
      const vec = await embedText(ai, text);
      await dbUpdateChunk(c.id, { embedding: vec, embeddingHash: h } as any);
      const mem = knowledgeChunks.find(x => x.id === c.id);
      if (mem) { mem.embedding = vec; mem.embeddingHash = h; }
      done++;
    } catch (e: any) { failed++; console.warn("[RAG reembed] fail", c.id, e?.message); }
  }
  res.json({ total: all.length, done, skipped, failed });
});
```

- [ ] **Step 5: tsc + boot smoke (flag off Supabase ok)**

Run: `npx tsc --noEmit` → clean.
Run: `npm run build` → thành công.

- [ ] **Step 6: Commit**

```bash
git add server.ts
git commit -m "feat(rag): embed chunks on ingest + owner reembed endpoint"
```

---

## Task 6: Nối semantic retrieval + grounded synthesis vào generateRAGAnswer

**Files:**
- Modify: `server.ts` (hàm `generateRAGAnswer`, ~3193–3470)

**Interfaces:**
- Consumes: `rankBySimilarity` (Task 3), `synthesizeAnswer` (Task 4), `embedText` (Task 2), `TOP_K`, `SIM_THRESHOLD`, `getAIClient`, `dbGetChunks`, `postProcessBotReply`.

- [ ] **Step 1: Thêm import**

```ts
import { rankBySimilarity } from "./rag/retriever.js";
import { synthesizeAnswer } from "./rag/synthesis.js";
import { TOP_K, SIM_THRESHOLD } from "./rag/constants.js";
```

- [ ] **Step 2: Thay khối truy hồi từ-khoá** trong `generateRAGAnswer`. Giữ phần đầu (pronoun, chit-chat detection, `botChunks = await dbGetChunks(...)`). THAY block từ `const queryProfile = buildQueryProfile(query);` (~3226) đến hết phần dựng `contextString`/synthesis cũ (~tới trước `return` fallback ~3460) bằng đường semantic:

```ts
  // 2. Semantic retrieval
  const ai = getAIClient();
  const answerStyle: "sales" | "reference" = bot.answerStyle === "reference" ? "reference" : "sales";

  if (!ai) {
    // Khong co key -> fallback an toan
    return {
      text: postProcessBotReply(bot.fallbackMessage || "Dạ em xin phép kết nối nhân viên hỗ trợ mình ngay ạ.", replyOptions),
      sources: [],
      fallbackTriggered: true,
    };
  }

  let topChunks: Array<{ chunk: KnowledgeChunk; score: number }> = [];
  try {
    const qVec = await embedText(ai, query);
    topChunks = rankBySimilarity(qVec, botChunks, TOP_K);
  } catch (e: any) {
    console.warn("[RAG] retrieve failed:", e?.message || e);
  }

  const maxScore = topChunks[0]?.score ?? 0;
  const grounded = maxScore >= SIM_THRESHOLD ? topChunks : [];

  // 3. Khong du bang chung -> noi chua co thong tin + fallback bot
  if (grounded.length === 0) {
    const lowConf = await synthesizeAnswer(ai, bot, query, [], { answerStyle })
      .catch(() => bot.fallbackMessage || "Dạ thông tin này em chưa có trong tài liệu, em xin phép chuyển nhân viên hỗ trợ mình ạ.");
    return {
      text: postProcessBotReply(lowConf, replyOptions),
      sources: [],
      fallbackTriggered: true,
    };
  }

  // 4. Tong hop grounded
  try {
    const answer = await synthesizeAnswer(ai, bot, query, grounded, { answerStyle });
    return {
      text: postProcessBotReply(answer, replyOptions),
      sources: grounded.map(g => ({ id: g.chunk.id, name: g.chunk.title, score: Math.min(0.99, g.score) })),
      fallbackTriggered: false,
    };
  } catch (e: any) {
    console.warn("[RAG] synthesis failed:", e?.message || e);
    return {
      text: postProcessBotReply(bot.fallbackMessage || "Dạ em xin phép kết nối nhân viên hỗ trợ mình ngay ạ.", replyOptions),
      sources: [],
      fallbackTriggered: true,
    };
  }
```

> **Lưu ý gỡ heuristic:** sau khi thay, các hàm `buildQueryProfile`, `scoreTextRetrieval`, `getChunkMetadata`, `inferChunkMetadata`, `extractDurationAnswer` có thể không còn được `generateRAGAnswer` dùng. RÀ `grep` từng tên trước khi xoá; nếu chỗ khác (vd reminder/training) còn dùng thì GIỮ. Chỉ xoá hàm thực sự mồ côi. Mục tiêu: đường trả lời chính chỉ còn semantic.

- [ ] **Step 3: tsc + build**

Run: `npx tsc --noEmit` → clean (sửa import/biến thừa nếu báo).
Run: `npm test` → 19+ test cũ + test rag vẫn pass.
Run: `npm run build` → thành công.

- [ ] **Step 4: Smoke test đường trả lời** (cần GEMINI_API_KEY + đã reembed). Dùng simulate:
```bash
node -e 'fetch("http://localhost:3000/api/zalo/simulate",{method:"POST",headers:{"content-type":"application/json","x-balabot-user-email":"ox102.crypto@gmail.com"},body:JSON.stringify({botId:"<BOT_ID>",text:"súp lơ bao nhiêu tiền 1kg?"})}).then(r=>r.json()).then(d=>console.log(d.reply||d)).catch(e=>console.log(e.message))'
```
Expected: câu trả lời trúng giá, diễn giải tự nhiên (không nguyên văn).

- [ ] **Step 5: Commit**

```bash
git add server.ts
git commit -m "feat(rag): semantic retrieval + grounded synthesis in generateRAGAnswer"
```

---

## Task 7: Per-bot answerStyle trong admin UI

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: API cập nhật bot hiện có (PUT/POST bot). `BotConfig.answerStyle`.

- [ ] **Step 1: Tìm chỗ sửa cấu hình bot** — `grep -n "tone\|welcomeMessage\|fallbackMessage" src/App.tsx` để thấy form sửa bot và cách bind field.

- [ ] **Step 2: Thêm select answerStyle** cạnh field `tone`, theo đúng pattern binding của form đó:

```tsx
<label>Phong cách trả lời (RAG)
  <select value={botDraft.answerStyle || 'sales'}
    onChange={e => setBotDraft({ ...botDraft, answerStyle: e.target.value as 'sales' | 'reference' })}>
    <option value="sales">Bán hàng (thân thiện, có CTA)</option>
    <option value="reference">Tra cứu (trung lập, súc tích)</option>
  </select>
</label>
```
> Thay `botDraft`/`setBotDraft` bằng tên state thật của form bot tìm ở Step 1. Đảm bảo `answerStyle` được gửi trong payload lưu bot.

- [ ] **Step 3: Build**

Run: `npm run build` → thành công, không lỗi type.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(rag): per-bot answerStyle selector in admin UI"
```

---

## Task 8: Eval harness (đo trước/sau)

**Files:**
- Create: `docs/rag-eval/sample.jsonl`
- Modify: `server.ts` (endpoint `POST /api/rag/eval`)

**Interfaces:**
- Consumes: `generateRAGAnswer`, `dbGetBots`, `requireOwnerAdmin`.

- [ ] **Step 1: Bộ eval mẫu `docs/rag-eval/sample.jsonl`** (mỗi dòng 1 JSON; thay bằng câu thật của bạn)

```jsonl
{"botId":"REPLACE","question":"súp lơ bao nhiêu tiền 1kg","mustInclude":["45"]}
{"botId":"REPLACE","question":"ship nội thành mất bao lâu","mustInclude":["2h","2 giờ","nội thành"]}
{"botId":"REPLACE","question":"có giao tỉnh không","mustInclude":[]}
```

- [ ] **Step 2: Endpoint `POST /api/rag/eval`** (owner-only)

```ts
app.post("/api/rag/eval", async (req, res) => {
  if (!requireOwnerAdmin(req, res)) return;
  const cases: Array<{ botId: string; question: string; mustInclude?: string[] }> = req.body?.cases || [];
  const allBots = await dbGetBots(bots);
  const results = [];
  for (const c of cases) {
    const bot = allBots.find(b => b.id === c.botId);
    if (!bot) { results.push({ ...c, ok: false, reason: "bot_not_found" }); continue; }
    const ans = await generateRAGAnswer(bot, c.question, { fullName: "Eval" }, { shouldGreet: false, recentMessages: [] });
    const text = (ans.text || "").toLowerCase();
    const hit = (c.mustInclude || []).every(s => text.includes(s.toLowerCase()));
    results.push({ question: c.question, ok: hit, fallback: ans.fallbackTriggered, reply: ans.text, sources: ans.sources?.length || 0 });
  }
  const passed = results.filter(r => r.ok).length;
  res.json({ total: results.length, passed, results });
});
```

- [ ] **Step 3: tsc + build**

Run: `npx tsc --noEmit` → clean. `npm run build` → ok.

- [ ] **Step 4: Commit**

```bash
git add server.ts docs/rag-eval/sample.jsonl
git commit -m "feat(rag): owner eval endpoint + sample eval set"
```

---

## Self-Review

**Spec coverage:**
- §4 units → Task 2 (embeddings), Task 3 (retriever), Task 4 (synthesis), Task 1 (constants), Task 5 (ingestion+backfill), Task 6 (orchestration).
- §5 luồng + ngưỡng → Task 6 (SIM_THRESHOLD, low-conf path).
- §6 chống copy/máy móc → Task 4 (prompt rules) + test.
- §7 per-bot answerStyle → Task 1 (type) + Task 4 (prompt) + Task 7 (UI).
- §8 eval → Task 8.
- §9 unit tests → Task 2/3/4.
- §10 migration + backfill + gỡ heuristic → Task 1 (SQL), Task 5 (reembed), Task 6 (gỡ heuristic có rà).
- §3 model tiết kiệm + verify id → Task 1 (constants), Task 5 Step 0 (verify).
- Giữ chữ ký generateRAGAnswer → Task 6 (không đổi signature).

**Placeholder scan:** Mã trong các step là mã thật. Hai điểm phụ thuộc môi trường nêu rõ cách chốt: shape API embedding (Task 2 — `extractVector` thử nhiều shape + ghi chú verify) và id model (Task 5 Step 0 — lệnh verify cụ thể). `REPLACE` botId trong eval mẫu là dữ liệu người dùng tự điền (đã ghi rõ "thay bằng câu thật").

**Type consistency:** `embedText(ai, text)`, `embedBatch(ai, texts)`, `cosineSim(a,b)`, `hashText(text)`, `rankBySimilarity(queryVec, chunks, topK)→{chunk,score}[]`, `buildGroundedPrompt(bot, passages, {answerStyle})`, `synthesizeAnswer(ai, bot, query, passages, {answerStyle})` — dùng nhất quán Task 2→6. `answerStyle: 'sales'|'reference'` thống nhất type/prompt/UI. `KnowledgeChunk.embedding?: number[]` thống nhất Task 1/3/5.
