# Huấn luyện phản hồi bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép mỗi tenant tự thêm "ví dụ mẫu Q&A" và "quy tắc chung" cho bot của mình qua tab mới "Huấn luyện phản hồi", chèn thẳng vào prompt Gemini mỗi lần bot trả lời — không fine-tune model.

**Architecture:** 2 bảng Supabase mới (`bot_training_examples`, `bot_training_rules`) + lớp service CRUD (`supabaseService.ts`) + API Express theo đúng pattern bot-guard/`assertResourceBotAccess` đã có + inject 2 block mới vào `buildGroundedPrompt` (`rag/synthesis.ts`) + tab React mới (`TrainingPanel.tsx`) mirror cấu trúc `ContentPanel.tsx`. Quota theo gói dùng cùng mô hình `usageVerdict`/`checkContentGate` đã có, nhưng đếm tổng số đang lưu (không theo tháng).

**Tech Stack:** Express (server.ts) + Supabase/Postgres + Google Gemini (`rag/synthesis.ts`) + React 19 (`src/App.tsx`) + Vitest.

## Global Constraints

- Hạn mức theo gói (từ spec, KHÔNG đổi số khi implement): `free {examples:5, rules:5}`, `starter {examples:20, rules:15}`, `pro {examples:50, rules:30}`, `business {examples:150, rules:50}`, `enterprise {examples:999999, rules:999999}`.
- Hạn mức là TỔNG SỐ ĐANG LƯU, không theo tháng, không reset chu kỳ (khác `CONTENT_LIMITS`).
- Tên bảng chính xác: `bot_training_examples`, `bot_training_rules`. Cột camelCase double-quoted (`"botId"`, `"isActive"`, `"createdAt"`) — đúng convention `knowledge_chunks`/`content_posts`.
- Mọi route `/api/bots/:botId/training/*` đi qua bot-guard middleware có sẵn (tự động, không cần code thêm). Mọi route theo resource id (`/api/training/examples/:id`, `/api/training/rules/:id`) PHẢI gọi `assertResourceBotAccess` trước khi đọc/sửa/xóa.
- Rules và Examples áp dụng cho CẢ HAI `answerStyle` ("sales" và "reference") — không chỉ mode sales như `FEW_SHOTS` hardcode.
- Không dùng embedding/similarity-selection cho examples ở v1 — luôn chèn toàn bộ (đã giới hạn nhỏ theo quota).
- Không sửa trực tiếp từ lịch sử hội thoại thật, không versioning — v1 chỉ CRUD đơn giản qua tab huấn luyện riêng.
- Test bằng Vitest (`npm test`), typecheck bằng `npm run lint` (= `tsc --noEmit`). Theo đúng precedent của codebase: chỉ logic thuần (billing constants, `buildGroundedPrompt`) có unit test tự động; route Express và component React verify thủ công qua Playground (route Express trong `server.ts` không có test tự động ở bất kỳ chỗ nào khác trong repo).

---

### Task 1: `TRAINING_LIMITS` trong billing.ts

**Files:**
- Modify: `billing.ts:11` (ngay sau khối `CONTENT_LIMITS`)
- Test: `__tests__/training-gate.test.ts` (mới)

**Interfaces:**
- Produces: `TRAINING_LIMITS: Record<"free"|"starter"|"pro"|"business"|"enterprise", { examples: number; rules: number }>` — Task 6 (`checkTrainingLimit`) import từ `billing.js`.

- [ ] **Step 1: Viết test trước (sẽ fail vì `TRAINING_LIMITS` chưa tồn tại)**

Tạo file `__tests__/training-gate.test.ts`:
```ts
// __tests__/training-gate.test.ts
import { describe, it, expect } from "vitest";
import { TRAINING_LIMITS, usageVerdict } from "../billing.js";

describe("TRAINING_LIMITS", () => {
  it("gói cao > gói thấp cho cả examples và rules", () => {
    expect(TRAINING_LIMITS.pro.examples).toBeGreaterThan(TRAINING_LIMITS.free.examples);
    expect(TRAINING_LIMITS.pro.rules).toBeGreaterThan(TRAINING_LIMITS.free.rules);
    expect(TRAINING_LIMITS.enterprise.examples).toBeGreaterThan(TRAINING_LIMITS.business.examples);
    expect(TRAINING_LIMITS.enterprise.rules).toBeGreaterThan(TRAINING_LIMITS.business.rules);
  });
  it("verdict chặn khi vượt 110% hạn mức examples của gói free", () => {
    expect(usageVerdict(TRAINING_LIMITS.free.examples + 1, TRAINING_LIMITS.free.examples)).not.toBe("ok");
    expect(usageVerdict(6, 5)).toBe("blocked");
  });
  it("verdict chặn khi vượt 110% hạn mức rules của gói free", () => {
    expect(usageVerdict(TRAINING_LIMITS.free.rules + 1, TRAINING_LIMITS.free.rules)).not.toBe("ok");
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npx vitest run __tests__/training-gate.test.ts`
Expected: FAIL — `TRAINING_LIMITS` is not exported from `billing.js` (hoặc lỗi `undefined`).

- [ ] **Step 3: Thêm `TRAINING_LIMITS` vào billing.ts**

Trong `billing.ts`, ngay sau khối `CONTENT_LIMITS` (dòng 17), thêm:
```ts
// Hạn mức Huấn luyện phản hồi (ví dụ mẫu Q&A + quy tắc chung) mỗi bot theo gói.
// Đây là hạn mức TỔNG SỐ ĐANG LƯU (không phải theo tháng như CONTENT_LIMITS) — không reset chu kỳ.
export const TRAINING_LIMITS: Record<"free" | "starter" | "pro" | "business" | "enterprise", { examples: number; rules: number }> = {
  free:       { examples: 5,   rules: 5 },
  starter:    { examples: 20,  rules: 15 },
  pro:        { examples: 50,  rules: 30 },
  business:   { examples: 150, rules: 50 },
  enterprise: { examples: 999999, rules: 999999 },
};
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npx vitest run __tests__/training-gate.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add billing.ts __tests__/training-gate.test.ts
git commit -m "feat(training): them TRAINING_LIMITS theo goi thue bao"
```

---

### Task 2: Migration `training.sql`

**Files:**
- Create: `training.sql` (root, cùng cấp `content.sql`)

**Interfaces:**
- Produces: schema `bot_training_examples(id, "botId", question, answer, "createdAt")`, `bot_training_rules(id, "botId", rule, "isActive", "createdAt")` — Task 3 (supabaseService CRUD) và Task 6 (routes) phụ thuộc đúng tên cột này.

- [ ] **Step 1: Tạo file `training.sql`**

```sql
-- Bảng Huấn luyện phản hồi bot: ví dụ mẫu Q&A (few-shot) + quy tắc chung (v1).
create table if not exists public.bot_training_examples (
  id text primary key,
  "botId" text not null,
  question text not null,
  answer text not null,
  "createdAt" timestamptz default now()
);
create index if not exists bot_training_examples_botid_idx on public.bot_training_examples ("botId");

create table if not exists public.bot_training_rules (
  id text primary key,
  "botId" text not null,
  rule text not null,
  "isActive" boolean not null default true,
  "createdAt" timestamptz default now()
);
create index if not exists bot_training_rules_botid_idx on public.bot_training_rules ("botId");
```

- [ ] **Step 2: Đối chiếu tên cột với `content.sql` để đảm bảo cùng convention (lowercase `create table`, `public.` prefix, không RLS/policy — giống `content_posts`/`content_voice`)**

Run: xem lại `content.sql` cạnh `training.sql`, xác nhận style khớp (không cần lệnh, chỉ đọc lại 2 file).
Expected: cùng style — không có gì phải sửa.

- [ ] **Step 3: Commit**

```bash
git add training.sql
git commit -m "feat(training): them migration bot_training_examples + bot_training_rules"
```

---

### Task 3: Lớp service Supabase (CRUD) trong `supabaseService.ts`

**Files:**
- Modify: `supabaseService.ts` (thêm vào cuối file, sau dòng 1830 — hàm cuối cùng hiện tại là `dbIncrementContentUsage`)

**Interfaces:**
- Consumes: bảng `bot_training_examples`/`bot_training_rules` từ Task 2.
- Produces (Task 6, Task 7 import những cái này từ `./supabaseService.js`):
  - `interface TrainingExample { id: string; botId: string; question: string; answer: string; createdAt?: string; }`
  - `interface TrainingRule { id: string; botId: string; rule: string; isActive: boolean; createdAt?: string; }`
  - `dbListTrainingExamples(botId: string): Promise<TrainingExample[]>`
  - `dbCountTrainingExamples(botId: string): Promise<number>`
  - `dbSaveTrainingExample(example: TrainingExample): Promise<boolean>`
  - `dbDeleteTrainingExample(id: string): Promise<boolean>`
  - `dbListTrainingRules(botId: string, activeOnly?: boolean): Promise<TrainingRule[]>`
  - `dbCountTrainingRules(botId: string): Promise<number>`
  - `dbSaveTrainingRule(rule: TrainingRule): Promise<boolean>`
  - `dbUpdateTrainingRule(id: string, isActive: boolean): Promise<boolean>`
  - `dbDeleteTrainingRule(id: string): Promise<boolean>`

- [ ] **Step 1: Thêm types + functions vào cuối `supabaseService.ts`**

Nối vào cuối file (sau dòng 1830):
```ts

// ===== Huấn luyện phản hồi bot: ví dụ mẫu Q&A (few-shot) + quy tắc chung =====
export interface TrainingExample {
  id: string;
  botId: string;
  question: string;
  answer: string;
  createdAt?: string;
}

export interface TrainingRule {
  id: string;
  botId: string;
  rule: string;
  isActive: boolean;
  createdAt?: string;
}

export async function dbListTrainingExamples(botId: string): Promise<TrainingExample[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client.from("bot_training_examples").select("*").eq("botId", botId).order("createdAt", { ascending: false });
  if (error) { console.warn("dbListTrainingExamples:", error.message); return []; }
  return (data as TrainingExample[]) || [];
}

export async function dbCountTrainingExamples(botId: string): Promise<number> {
  const client = getSupabaseClient();
  if (!client) return 0;
  const { count, error } = await client.from("bot_training_examples").select("id", { count: "exact", head: true }).eq("botId", botId);
  if (error) { console.warn("dbCountTrainingExamples:", error.message); return 0; }
  return count || 0;
}

export async function dbSaveTrainingExample(example: TrainingExample): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const { error } = await client.from("bot_training_examples").insert(example);
  if (error) { console.warn("dbSaveTrainingExample:", error.message); return false; }
  return true;
}

export async function dbDeleteTrainingExample(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const { error } = await client.from("bot_training_examples").delete().eq("id", id);
  if (error) { console.warn("dbDeleteTrainingExample:", error.message); return false; }
  return true;
}

export async function dbListTrainingRules(botId: string, activeOnly = false): Promise<TrainingRule[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  let query = client.from("bot_training_rules").select("*").eq("botId", botId);
  if (activeOnly) query = query.eq("isActive", true);
  const { data, error } = await query.order("createdAt", { ascending: false });
  if (error) { console.warn("dbListTrainingRules:", error.message); return []; }
  return (data as TrainingRule[]) || [];
}

export async function dbCountTrainingRules(botId: string): Promise<number> {
  const client = getSupabaseClient();
  if (!client) return 0;
  const { count, error } = await client.from("bot_training_rules").select("id", { count: "exact", head: true }).eq("botId", botId);
  if (error) { console.warn("dbCountTrainingRules:", error.message); return 0; }
  return count || 0;
}

export async function dbSaveTrainingRule(rule: TrainingRule): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const { error } = await client.from("bot_training_rules").insert(rule);
  if (error) { console.warn("dbSaveTrainingRule:", error.message); return false; }
  return true;
}

export async function dbUpdateTrainingRule(id: string, isActive: boolean): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const { error } = await client.from("bot_training_rules").update({ isActive }).eq("id", id);
  if (error) { console.warn("dbUpdateTrainingRule:", error.message); return false; }
  return true;
}

export async function dbDeleteTrainingRule(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const { error } = await client.from("bot_training_rules").delete().eq("id", id);
  if (error) { console.warn("dbDeleteTrainingRule:", error.message); return false; }
  return true;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: không lỗi TypeScript liên quan tới `supabaseService.ts` (0 errors trong file này).

- [ ] **Step 3: Commit**

```bash
git add supabaseService.ts
git commit -m "feat(training): them lop service CRUD cho vi du mau + quy tac"
```

---

### Task 4: Đăng ký bảng mới vào `getSQLSchema()` (BYO Supabase)

**Files:**
- Modify: `supabaseService.ts:519-542` (chèn section 13 ngay trước dòng đóng template literal của `getSQLSchema()`)

**Interfaces:**
- Consumes: tên bảng/cột giống hệt Task 2 (`bot_training_examples`, `bot_training_rules`).
- Produces: khách dùng Supabase riêng (BYO) bấm "Khởi tạo bảng" sẽ tạo được 2 bảng này — không có API mới, chỉ nối chuỗi SQL.

- [ ] **Step 1: Chèn section 13 vào `getSQLSchema()`**

Trong `supabaseService.ts`, tìm đoạn kết thúc section 12 (`telegram_groups`, dòng 535-542):
```
ALTER TABLE telegram_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read tg_groups" ON telegram_groups;
DROP POLICY IF EXISTS "Allow public insert tg_groups" ON telegram_groups;
DROP POLICY IF EXISTS "Allow public update tg_groups" ON telegram_groups;
CREATE POLICY "Allow public read tg_groups" ON telegram_groups FOR SELECT USING (true);
CREATE POLICY "Allow public insert tg_groups" ON telegram_groups FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update tg_groups" ON telegram_groups FOR UPDATE USING (true);
`;
}
```

Thay bằng (chèn section 13 trước dấu `` ` ``đóng):
```
ALTER TABLE telegram_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read tg_groups" ON telegram_groups;
DROP POLICY IF EXISTS "Allow public insert tg_groups" ON telegram_groups;
DROP POLICY IF EXISTS "Allow public update tg_groups" ON telegram_groups;
CREATE POLICY "Allow public read tg_groups" ON telegram_groups FOR SELECT USING (true);
CREATE POLICY "Allow public insert tg_groups" ON telegram_groups FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update tg_groups" ON telegram_groups FOR UPDATE USING (true);

-- =========================================================================
-- 13. HUẤN LUYỆN PHẢN HỒI BOT (ví dụ mẫu Q&A + quy tắc chung)
-- =========================================================================
CREATE TABLE IF NOT EXISTS bot_training_examples (
  id TEXT PRIMARY KEY,
  "botId" TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bot_training_examples_bot_idx ON bot_training_examples ("botId");

ALTER TABLE bot_training_examples ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read bot_training_examples" ON bot_training_examples;
DROP POLICY IF EXISTS "Allow public insert bot_training_examples" ON bot_training_examples;
DROP POLICY IF EXISTS "Allow public update bot_training_examples" ON bot_training_examples;
CREATE POLICY "Allow public read bot_training_examples" ON bot_training_examples FOR SELECT USING (true);
CREATE POLICY "Allow public insert bot_training_examples" ON bot_training_examples FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update bot_training_examples" ON bot_training_examples FOR UPDATE USING (true);

CREATE TABLE IF NOT EXISTS bot_training_rules (
  id TEXT PRIMARY KEY,
  "botId" TEXT NOT NULL,
  rule TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bot_training_rules_bot_idx ON bot_training_rules ("botId");

ALTER TABLE bot_training_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read bot_training_rules" ON bot_training_rules;
DROP POLICY IF EXISTS "Allow public insert bot_training_rules" ON bot_training_rules;
DROP POLICY IF EXISTS "Allow public update bot_training_rules" ON bot_training_rules;
CREATE POLICY "Allow public read bot_training_rules" ON bot_training_rules FOR SELECT USING (true);
CREATE POLICY "Allow public insert bot_training_rules" ON bot_training_rules FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update bot_training_rules" ON bot_training_rules FOR UPDATE USING (true);
`;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: 0 lỗi.

- [ ] **Step 3: Commit**

```bash
git add supabaseService.ts
git commit -m "feat(training): dang ky bang training vao getSQLSchema cho BYO Supabase"
```

---

### Task 5: Inject rules/examples vào `buildGroundedPrompt` (`rag/synthesis.ts`)

**Files:**
- Modify: `rag/synthesis.ts` (extend `SynthesisOpts`, thêm 2 helper, sửa `return` cuối `buildGroundedPrompt`)
- Test: `rag/__tests__/synthesis.test.ts` (thêm test cases vào describe block hiện có)

**Interfaces:**
- Consumes: không phụ thuộc task khác (chỉ dùng `string[]`/`{question,answer}[]` thuần).
- Produces: `SynthesisOpts.trainingRules?: string[]`, `SynthesisOpts.trainingExamples?: { question: string; answer: string }[]` — Task 7 (`server.ts`) truyền 2 field này vào `synthCtx`.

- [ ] **Step 1: Viết test trước (sẽ fail — field chưa tồn tại nên block không xuất hiện trong prompt)**

Trong `rag/__tests__/synthesis.test.ts`, chèn các `it(...)` sau vào NGAY TRƯỚC dòng `});` đóng `describe` cuối file (dòng 92):
```ts
  it("co trainingRules -> chen block quy tac rieng cua shop", () => {
    const p = buildGroundedPrompt(bot, passages, {
      answerStyle: "sales",
      trainingRules: ["Luôn hỏi số điện thoại trước khi báo giá", "Không dùng từ 'rẻ'"],
    });
    expect(p).toContain("QUY TẮC RIÊNG CỦA SHOP");
    expect(p).toContain("Luôn hỏi số điện thoại trước khi báo giá");
    expect(p).toContain("Không dùng từ 'rẻ'");
  });

  it("co trainingExamples -> chen vi du mau cua shop", () => {
    const p = buildGroundedPrompt(bot, passages, {
      answerStyle: "sales",
      trainingExamples: [{ question: "Có ship COD không?", answer: "Dạ có ạ, COD toàn quốc." }],
    });
    expect(p).toContain("VÍ DỤ MẪU DO SHOP CUNG CẤP");
    expect(p).toContain("Có ship COD không?");
    expect(p).toContain("Dạ có ạ, COD toàn quốc.");
  });

  it("trainingRules/trainingExamples ap dung ca mode reference", () => {
    const p = buildGroundedPrompt(bot, passages, {
      answerStyle: "reference",
      trainingRules: ["Luôn trả lời bằng tiếng Việt có dấu"],
      trainingExamples: [{ question: "Giá bao nhiêu?", answer: "Dạ giá niêm yết trong tài liệu ạ." }],
    });
    expect(p).toContain("QUY TẮC RIÊNG CỦA SHOP");
    expect(p).toContain("VÍ DỤ MẪU DO SHOP CUNG CẤP");
  });

  it("khong co trainingRules/trainingExamples -> khong chen block", () => {
    const p = buildGroundedPrompt(bot, passages, { answerStyle: "sales" });
    expect(p).not.toContain("QUY TẮC RIÊNG CỦA SHOP");
    expect(p).not.toContain("VÍ DỤ MẪU DO SHOP CUNG CẤP");
  });
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npx vitest run rag/__tests__/synthesis.test.ts`
Expected: FAIL — 4 test mới thất bại vì `buildGroundedPrompt` chưa đọc `trainingRules`/`trainingExamples`.

- [ ] **Step 3: Extend `SynthesisOpts`**

Trong `rag/synthesis.ts`, sửa type `SynthesisOpts` (dòng 15-32) — thêm 2 field cuối:
```ts
export type SynthesisOpts = {
  answerStyle: "sales" | "reference";
  // Chỉ áp dụng cho mode "reference": cho phép gợi ý sản phẩm ngắn gọn khi khách hỏi liên quan.
  allowProductIntro?: boolean;
  customer?: CustomerCtx;
  history?: HistoryTurn[];
  // Chế độ "mở rộng": cho phép bổ sung kiến thức chung TRONG CÙNG lĩnh vực của bot,
  // hòa quyện tự nhiên, vẫn kéo về sản phẩm/dịch vụ — không bịa thông tin riêng của shop.
  expand?: boolean;
  // Chế độ "nhanh": tắt thinking để cắt độ trễ (dùng cho kênh bridge phải trả lời
  // đồng bộ trong thời gian chờ giới hạn của nền tảng thứ 3, vd Botcake ~5s).
  fast?: boolean;
  // Tầng HIỂU + mục tiêu hội thoại (goal-driven). Không truyền → hành vi sales cũ.
  intent?: Intent;
  buyingSignal?: BuyingSignal;
  goal?: ConversationGoal;
  goalState?: GoalState;
  // Huấn luyện phản hồi do owner tự nạp riêng cho bot: quy tắc chung + ví dụ mẫu Q&A.
  // Áp dụng cho CẢ HAI answerStyle, khác FEW_SHOTS hardcode chỉ áp dụng mode sales.
  trainingRules?: string[];
  trainingExamples?: { question: string; answer: string }[];
};
```

- [ ] **Step 4: Thêm 2 helper ngay sau `buildHistoryBlock`**

Trong `rag/synthesis.ts`, ngay sau hàm `buildHistoryBlock` (kết thúc dòng 146), thêm:
```ts

function buildRulesBlock(rules?: string[]): string | null {
  const list = (rules || []).map(r => r.trim()).filter(Boolean);
  if (!list.length) return null;
  return ["QUY TẮC RIÊNG CỦA SHOP (tuân thủ tuyệt đối):", ...list.map(r => `- ${r}`)].join("\n");
}

function buildExamplesBlock(examples?: { question: string; answer: string }[]): string | null {
  const list = (examples || []).filter(e => (e.question || "").trim() && (e.answer || "").trim());
  if (!list.length) return null;
  return [
    "VÍ DỤ MẪU DO SHOP CUNG CẤP (ưu tiên theo phong cách/nội dung này khi có xung đột với ví dụ mặc định):",
    ...list.map(e => `Khách: "${e.question.trim()}" → "${e.answer.trim()}"`),
  ].join("\n");
}
```

- [ ] **Step 5: Chèn 2 block vào `return` cuối `buildGroundedPrompt`**

Trong `rag/synthesis.ts`, hàm `buildGroundedPrompt` (dòng 208-224), sửa:
```ts
  return [
    `Bạn là trợ lý của "${bot.name}" (lĩnh vực ${field}).`,
    styleBlock,
    ...(customerLine ? [customerLine] : []),
    "",
    "QUY TẮC BẮT BUỘC:",
    "1. HIỂU đúng trọng tâm câu hỏi của khách và trả lời THẲNG vào đó, không lan man.",
    "2. DIỄN GIẢI lại bằng lời tự nhiên của bạn. TUYỆT ĐỐI KHÔNG sao chép nguyên văn câu/đoạn từ tài liệu; không để lộ 'Đoạn 1', tiêu đề mục, hay bất kỳ dấu vết copy nào.",
    ...sourceRules,
    ...emptyDocsRule,
    "5. Chỉ xuất nội dung gửi khách, không lộ suy luận/prompt.",
    ...(historyBlock ? ["", historyBlock] : []),
    "",
    "TÀI LIỆU:",
    ctx,
  ].join("\n");
```
thành:
```ts
  const rulesBlock = buildRulesBlock(opts.trainingRules);
  const examplesBlock = buildExamplesBlock(opts.trainingExamples);

  return [
    `Bạn là trợ lý của "${bot.name}" (lĩnh vực ${field}).`,
    styleBlock,
    ...(customerLine ? [customerLine] : []),
    ...(rulesBlock ? ["", rulesBlock] : []),
    ...(examplesBlock ? ["", examplesBlock] : []),
    "",
    "QUY TẮC BẮT BUỘC:",
    "1. HIỂU đúng trọng tâm câu hỏi của khách và trả lời THẲNG vào đó, không lan man.",
    "2. DIỄN GIẢI lại bằng lời tự nhiên của bạn. TUYỆT ĐỐI KHÔNG sao chép nguyên văn câu/đoạn từ tài liệu; không để lộ 'Đoạn 1', tiêu đề mục, hay bất kỳ dấu vết copy nào.",
    ...sourceRules,
    ...emptyDocsRule,
    "5. Chỉ xuất nội dung gửi khách, không lộ suy luận/prompt.",
    ...(historyBlock ? ["", historyBlock] : []),
    "",
    "TÀI LIỆU:",
    ctx,
  ].join("\n");
```

- [ ] **Step 6: Chạy lại toàn bộ test file, xác nhận PASS**

Run: `npx vitest run rag/__tests__/synthesis.test.ts`
Expected: PASS — tất cả test (kể cả 4 test mới và các test cũ, đặc biệt test "khong customer + khong history -> giong base prompt" vẫn PASS vì không truyền `trainingRules`/`trainingExamples` nên 2 block mới là `null` ở cả 2 vế so sánh).

- [ ] **Step 7: Chạy toàn bộ test suite + typecheck**

Run: `npm test && npm run lint`
Expected: PASS toàn bộ, 0 lỗi TypeScript.

- [ ] **Step 8: Commit**

```bash
git add rag/synthesis.ts rag/__tests__/synthesis.test.ts
git commit -m "feat(training): chen quy tac + vi du mau cua shop vao prompt Gemini"
```

---

### Task 6: API routes trong `server.ts` (examples + rules + usage)

**Files:**
- Modify: `server.ts:78-108` (thêm import từ `supabaseService.js`)
- Modify: `server.ts:109` (thêm import type từ `supabaseService.js`)
- Modify: `server.ts:110` (thêm `TRAINING_LIMITS` vào import từ `billing.js`)
- Modify: `server.ts:335` (mở rộng union type tham số `table` của `assertResourceBotAccess`)
- Modify: `server.ts:3745-3752` (thêm routes ngay sau route `GET /api/bots/:botId/content/usage` hiện có)
- Modify: `server.ts:5166-5178` (thêm hàm `checkTrainingLimit` ngay sau `checkContentGate`)

**Interfaces:**
- Consumes: mọi hàm `db*Training*` + type `TrainingExample`/`TrainingRule` từ Task 3 (`./supabaseService.js`); `TRAINING_LIMITS` từ Task 1 (`./billing.js`); `assertResourceBotAccess`, `dbGetBots`, `getTrustedEmail`, `resolveOwnerPlan`, `usageVerdict` đã có sẵn trong `server.ts`.
- Produces: routes `GET/POST /api/bots/:botId/training/examples`, `DELETE /api/training/examples/:id`, `GET/POST /api/bots/:botId/training/rules`, `PATCH/DELETE /api/training/rules/:id`, `GET /api/bots/:botId/training/usage` — Task 8 (`TrainingPanel.tsx`) gọi các endpoint này. Response shape:
  - `TrainingExample`/`TrainingRule` JSON (giống Task 3).
  - `GET .../usage` trả `{ examples: { count, limit, verdict }, rules: { count, limit, verdict } }`.

- [ ] **Step 1: Mở rộng import từ `supabaseService.js`**

Trong `server.ts`, sửa khối import (dòng 78-108), thêm các dòng sau NGAY TRƯỚC dòng `} from "./supabaseService.js";` (dòng 108):
```ts
  dbListTrainingExamples,
  dbCountTrainingExamples,
  dbSaveTrainingExample,
  dbDeleteTrainingExample,
  dbListTrainingRules,
  dbCountTrainingRules,
  dbSaveTrainingRule,
  dbUpdateTrainingRule,
  dbDeleteTrainingRule,
```

Sửa dòng 109 từ:
```ts
import type { PaymentOrder } from "./supabaseService.js";
```
thành:
```ts
import type { PaymentOrder, TrainingExample, TrainingRule } from "./supabaseService.js";
```

Sửa dòng 110 từ:
```ts
import { currentYearMonth, usageVerdict, PLAN_LIMITS, CONTENT_LIMITS } from "./billing.js";
```
thành:
```ts
import { currentYearMonth, usageVerdict, PLAN_LIMITS, CONTENT_LIMITS, TRAINING_LIMITS } from "./billing.js";
```

- [ ] **Step 2: Mở rộng union type của `assertResourceBotAccess`**

Trong `server.ts`, tìm hàm `assertResourceBotAccess` (khoảng dòng 338-345), sửa tham số `table` từ:
```ts
  table: "knowledge_chunks" | "knowledge_sources" | "chat_sessions" | "schedules" | "content_posts",
```
thành:
```ts
  table: "knowledge_chunks" | "knowledge_sources" | "chat_sessions" | "schedules" | "content_posts" | "bot_training_examples" | "bot_training_rules",
```

- [ ] **Step 3: Thêm `checkTrainingLimit` ngay sau `checkContentGate`**

Trong `server.ts`, ngay sau hàm `checkContentGate` (kết thúc ở dòng 5178 theo bản gốc — tìm dòng `return { allowed: verdict !== "blocked", verdict, count, limit };` rồi dấu `}` đóng hàm `checkContentGate`), thêm:
```ts

// Kiểm tra hạn mức Huấn luyện phản hồi (ví dụ mẫu HOẶC quy tắc) TRƯỚC khi thêm mới.
// Khác checkContentGate: không theo tháng — đây là tổng số đang lưu, không reset chu kỳ.
async function checkTrainingLimit(
  bot: BotConfig,
  kind: "examples" | "rules",
  emailHint?: string
): Promise<{ allowed: boolean; verdict: "ok" | "warn" | "blocked"; count: number; limit: number }> {
  const ownerKey = bot.userId || "";
  if (!ownerKey) return { allowed: true, verdict: "ok", count: 0, limit: 0 };
  const { tier } = await resolveOwnerPlan(ownerKey, emailHint);
  if (tier === "none") return { allowed: false, verdict: "blocked", count: 0, limit: 0 };
  const limit = TRAINING_LIMITS[tier as keyof typeof TRAINING_LIMITS]?.[kind] ?? TRAINING_LIMITS.free[kind];
  const count = kind === "examples"
    ? await dbCountTrainingExamples(bot.id)
    : await dbCountTrainingRules(bot.id);
  const verdict = usageVerdict(count, limit);
  return { allowed: verdict !== "blocked", verdict, count, limit };
}
```

- [ ] **Step 4: Thêm routes ngay sau `GET /api/bots/:botId/content/usage`**

Trong `server.ts`, ngay sau route (dòng 3745-3751):
```ts
app.get("/api/bots/:botId/content/usage", async (req, res) => {
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === req.params.botId);
  if (!bot) return res.status(404).json({ error: "Không tìm thấy bot." });
  const gate = await checkContentGate(bot, getTrustedEmail(req));
  res.json({ count: gate.count, limit: gate.limit, verdict: gate.verdict });
});
```
thêm:
```ts

// ===== Huấn luyện phản hồi bot: ví dụ mẫu Q&A + quy tắc chung =====
app.get("/api/bots/:botId/training/examples", async (req, res) => {
  const examples = await dbListTrainingExamples(req.params.botId);
  res.json(examples);
});

app.post("/api/bots/:botId/training/examples", async (req, res) => {
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === req.params.botId);
  if (!bot) return res.status(404).json({ error: "Không tìm thấy bot." });

  const question = String(req.body?.question || "").trim().slice(0, 2000);
  const answer = String(req.body?.answer || "").trim().slice(0, 4000);
  if (!question || !answer) return res.status(400).json({ error: "Cần nhập cả câu hỏi và câu trả lời." });

  const gate = await checkTrainingLimit(bot, "examples", getTrustedEmail(req));
  if (!gate.allowed) {
    return res.status(429).json({ error: "Bạn đã đạt giới hạn số ví dụ mẫu của gói. Nâng gói để thêm nhiều hơn.", gate });
  }

  const example: TrainingExample = {
    id: "texample-" + Math.random().toString(36).substr(2, 9),
    botId: bot.id, question, answer, createdAt: new Date().toISOString(),
  };
  const ok = await dbSaveTrainingExample(example);
  if (!ok) return res.status(500).json({ error: "Lưu ví dụ mẫu thất bại, thử lại sau." });
  res.json(example);
});

app.delete("/api/training/examples/:id", async (req, res) => {
  if (!(await assertResourceBotAccess(req, res, "bot_training_examples", req.params.id))) return;
  await dbDeleteTrainingExample(req.params.id);
  res.json({ success: true });
});

app.get("/api/bots/:botId/training/rules", async (req, res) => {
  const rules = await dbListTrainingRules(req.params.botId);
  res.json(rules);
});

app.post("/api/bots/:botId/training/rules", async (req, res) => {
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === req.params.botId);
  if (!bot) return res.status(404).json({ error: "Không tìm thấy bot." });

  const rule = String(req.body?.rule || "").trim().slice(0, 500);
  if (!rule) return res.status(400).json({ error: "Cần nhập nội dung quy tắc." });

  const gate = await checkTrainingLimit(bot, "rules", getTrustedEmail(req));
  if (!gate.allowed) {
    return res.status(429).json({ error: "Bạn đã đạt giới hạn số quy tắc của gói. Nâng gói để thêm nhiều hơn.", gate });
  }

  const trainingRule: TrainingRule = {
    id: "trule-" + Math.random().toString(36).substr(2, 9),
    botId: bot.id, rule, isActive: true, createdAt: new Date().toISOString(),
  };
  const ok = await dbSaveTrainingRule(trainingRule);
  if (!ok) return res.status(500).json({ error: "Lưu quy tắc thất bại, thử lại sau." });
  res.json(trainingRule);
});

app.patch("/api/training/rules/:id", async (req, res) => {
  if (!(await assertResourceBotAccess(req, res, "bot_training_rules", req.params.id))) return;
  const isActive = req.body?.isActive !== false;
  const ok = await dbUpdateTrainingRule(req.params.id, isActive);
  if (!ok) return res.status(500).json({ error: "Cập nhật quy tắc thất bại, thử lại sau." });
  res.json({ success: true });
});

app.delete("/api/training/rules/:id", async (req, res) => {
  if (!(await assertResourceBotAccess(req, res, "bot_training_rules", req.params.id))) return;
  await dbDeleteTrainingRule(req.params.id);
  res.json({ success: true });
});

app.get("/api/bots/:botId/training/usage", async (req, res) => {
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === req.params.botId);
  if (!bot) return res.status(404).json({ error: "Không tìm thấy bot." });
  const [examplesGate, rulesGate] = await Promise.all([
    checkTrainingLimit(bot, "examples", getTrustedEmail(req)),
    checkTrainingLimit(bot, "rules", getTrustedEmail(req)),
  ]);
  res.json({
    examples: { count: examplesGate.count, limit: examplesGate.limit, verdict: examplesGate.verdict },
    rules: { count: rulesGate.count, limit: rulesGate.limit, verdict: rulesGate.verdict },
  });
});
```

- [ ] **Step 5: Typecheck**

Run: `npm run lint`
Expected: 0 lỗi TypeScript.

- [ ] **Step 6: Commit**

```bash
git add server.ts
git commit -m "feat(training): them API routes cho vi du mau + quy tac + usage"
```

---

### Task 7: Wire `trainingExamples`/`trainingRules` vào `generateRAGAnswer`

**Files:**
- Modify: `server.ts:5299` (thêm fetch ngay sau `botChunks`)
- Modify: `server.ts:5334-5337` (thêm 2 field vào `synthCtx`)

**Interfaces:**
- Consumes: `dbListTrainingExamples`/`dbListTrainingRules` (Task 3), `SynthesisOpts.trainingRules`/`trainingExamples` (Task 5).
- Produces: mỗi câu trả lời bot thật (Playground, Telegram, Facebook, Botcake, Website, Zalo — tất cả đi qua `generateRAGAnswer`) đều áp dụng huấn luyện của bot đó.

- [ ] **Step 1: Fetch training data ngay sau khi lấy `botChunks`**

Trong `server.ts`, hàm `generateRAGAnswer`, ngay sau dòng:
```ts
  const botChunks = await dbGetChunks(bot.id, knowledgeChunks.filter(c => c.botId === bot.id && c.isActive));
```
thêm:
```ts

  // Huấn luyện phản hồi: ví dụ mẫu Q&A + quy tắc chung (chỉ rule đang bật) do owner tự nạp cho bot này.
  const [trainingExamples, trainingRules] = await Promise.all([
    dbListTrainingExamples(bot.id),
    dbListTrainingRules(bot.id, true),
  ]);
```

- [ ] **Step 2: Truyền vào `synthCtx`**

Sửa khối `synthCtx` (dòng 5334-5337) từ:
```ts
  const synthCtx = {
    customer: customerCtx, history, allowProductIntro, expand, fast,
    intent: und.intent, buyingSignal: und.buyingSignal, goal, goalState,
  };
```
thành:
```ts
  const synthCtx = {
    customer: customerCtx, history, allowProductIntro, expand, fast,
    intent: und.intent, buyingSignal: und.buyingSignal, goal, goalState,
    trainingExamples: trainingExamples.map(e => ({ question: e.question, answer: e.answer })),
    trainingRules: trainingRules.map(r => r.rule),
  };
```

- [ ] **Step 3: Typecheck**

Run: `npm run lint`
Expected: 0 lỗi TypeScript.

- [ ] **Step 4: Commit**

```bash
git add server.ts
git commit -m "feat(training): noi vi du mau + quy tac vao luong tra loi that cua bot"
```

---

### Task 8: `TrainingPanel.tsx` (component React)

**Files:**
- Create: `src/TrainingPanel.tsx`

**Interfaces:**
- Consumes: các API endpoint từ Task 6 (`GET/POST /api/bots/:botId/training/examples`, `DELETE /api/training/examples/:id`, `GET/POST /api/bots/:botId/training/rules`, `PATCH/DELETE /api/training/rules/:id`, `GET /api/bots/:botId/training/usage`).
- Produces: `export function TrainingPanel({ botId }: { botId: string | null | undefined })` — Task 9 (`App.tsx`) import và render component này.

- [ ] **Step 1: Tạo `src/TrainingPanel.tsx`**

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { GraduationCap, Plus, Trash2, AlertCircle, Sparkles, Power } from 'lucide-react';

interface TrainingExample {
  id: string;
  botId: string;
  question: string;
  answer: string;
  createdAt?: string;
}

interface TrainingRule {
  id: string;
  botId: string;
  rule: string;
  isActive: boolean;
  createdAt?: string;
}

type Verdict = 'ok' | 'warn' | 'blocked';
interface TrainingUsage {
  examples: { count: number; limit: number; verdict: Verdict };
  rules: { count: number; limit: number; verdict: Verdict };
}

export function TrainingPanel({ botId }: { botId: string | null | undefined }) {
  const [examples, setExamples] = useState<TrainingExample[]>([]);
  const [rules, setRules] = useState<TrainingRule[]>([]);
  const [usage, setUsage] = useState<TrainingUsage | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [ruleText, setRuleText] = useState('');
  const [error, setError] = useState('');
  const [savingExample, setSavingExample] = useState(false);
  const [savingRule, setSavingRule] = useState(false);

  const loadAll = useCallback(async () => {
    if (!botId) return;
    try {
      const [exRes, ruleRes, usageRes] = await Promise.all([
        fetch(`/api/bots/${botId}/training/examples`),
        fetch(`/api/bots/${botId}/training/rules`),
        fetch(`/api/bots/${botId}/training/usage`),
      ]);
      if (exRes.ok) setExamples(await exRes.json());
      if (ruleRes.ok) setRules(await ruleRes.json());
      if (usageRes.ok) setUsage(await usageRes.json());
    } catch { /* im lặng */ }
  }, [botId]);

  useEffect(() => {
    setError('');
    if (botId) {
      loadAll();
    } else {
      setExamples([]);
      setRules([]);
      setUsage(null);
    }
  }, [botId, loadAll]);

  const handleAddExample = async () => {
    if (!botId || !question.trim() || !answer.trim()) return;
    setSavingExample(true);
    setError('');
    try {
      const res = await fetch(`/api/bots/${botId}/training/examples`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), answer: answer.trim() }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setError(data?.error || 'Bạn đã đạt giới hạn số ví dụ mẫu của gói. Nâng gói để thêm nhiều hơn.');
      } else if (!res.ok) {
        setError(data?.error || 'Thêm ví dụ mẫu thất bại, thử lại sau.');
      } else {
        setQuestion('');
        setAnswer('');
        loadAll();
      }
    } catch {
      setError('Không kết nối được máy chủ, thử lại sau ít phút.');
    } finally {
      setSavingExample(false);
    }
  };

  const handleDeleteExample = async (id: string) => {
    if (!window.confirm('Xóa ví dụ mẫu này?')) return;
    try {
      const res = await fetch(`/api/training/examples/${id}`, { method: 'DELETE' });
      if (!res.ok) { setError('Xóa ví dụ mẫu thất bại, thử lại sau.'); return; }
      loadAll();
    } catch {
      setError('Không kết nối được máy chủ, thử lại sau ít phút.');
    }
  };

  const handleAddRule = async () => {
    if (!botId || !ruleText.trim()) return;
    setSavingRule(true);
    setError('');
    try {
      const res = await fetch(`/api/bots/${botId}/training/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule: ruleText.trim() }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setError(data?.error || 'Bạn đã đạt giới hạn số quy tắc của gói. Nâng gói để thêm nhiều hơn.');
      } else if (!res.ok) {
        setError(data?.error || 'Thêm quy tắc thất bại, thử lại sau.');
      } else {
        setRuleText('');
        loadAll();
      }
    } catch {
      setError('Không kết nối được máy chủ, thử lại sau ít phút.');
    } finally {
      setSavingRule(false);
    }
  };

  const handleToggleRule = async (id: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/training/rules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) { setError('Cập nhật quy tắc thất bại, thử lại sau.'); return; }
      loadAll();
    } catch {
      setError('Không kết nối được máy chủ, thử lại sau ít phút.');
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!window.confirm('Xóa quy tắc này?')) return;
    try {
      const res = await fetch(`/api/training/rules/${id}`, { method: 'DELETE' });
      if (!res.ok) { setError('Xóa quy tắc thất bại, thử lại sau.'); return; }
      loadAll();
    } catch {
      setError('Không kết nối được máy chủ, thử lại sau ít phút.');
    }
  };

  if (!botId) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-8 text-center text-sm text-slate-500">
        Chọn bot trước để dùng tính năng huấn luyện phản hồi.
      </div>
    );
  }

  const renderUsageBadge = (label: string, u: { count: number; limit: number; verdict: Verdict } | undefined) => (
    <div className="flex items-center gap-2 text-xs text-slate-600">
      <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
      {u ? (
        u.limit >= 100000 ? (
          <span>{label}: <span className="font-bold">{u.count}</span> · <span className="font-bold text-emerald-600">Không giới hạn</span></span>
        ) : (
          <span>{label}: <span className="font-bold">{u.count}/{u.limit}</span></span>
        )
      ) : (
        <span className="text-slate-400">Đang tải hạn mức...</span>
      )}
      {u && u.verdict !== 'ok' && (
        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-0.5">
          {u.verdict === 'blocked' ? 'Hết hạn mức — nâng gói' : 'Sắp hết hạn mức'}
        </span>
      )}
    </div>
  );

  const exampleLimitReached = usage ? usage.examples.verdict === 'blocked' : false;
  const ruleLimitReached = usage ? usage.rules.verdict === 'blocked' : false;

  return (
    <div className="space-y-8">
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-xs text-emerald-800 flex items-start gap-2">
        <GraduationCap className="w-4 h-4 shrink-0 mt-0.5" />
        <span>Thay đổi ở đây có hiệu lực ngay cho các câu trả lời tiếp theo. Thử ngay ở tab <span className="font-semibold">Playground Chat Thử</span> để kiểm tra.</span>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 md:p-8 space-y-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Ví dụ mẫu (Hỏi → Trả lời)</h2>
            <p className="text-xs text-slate-500 mt-1">Dạy bot cách trả lời cụ thể theo mẫu — bot học phong cách, không copy nguyên văn.</p>
          </div>
          {renderUsageBadge('Ví dụ mẫu', usage?.examples)}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Câu hỏi khách</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="VD: Bên mình có ship COD không?"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Câu trả lời mong muốn</label>
            <input
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="VD: Dạ có ạ! Shop hỗ trợ COD toàn quốc ạ 😊"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleAddExample}
          disabled={savingExample || !question.trim() || !answer.trim() || exampleLimitReached}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" /> {savingExample ? 'Đang thêm...' : exampleLimitReached ? 'Đã hết hạn mức' : 'Thêm ví dụ'}
        </button>

        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {examples.length === 0 && <p className="text-xs text-slate-400">Chưa có ví dụ mẫu nào.</p>}
          {examples.map(ex => (
            <div key={ex.id} className="border border-slate-200 rounded-lg p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700">Khách: {ex.question}</p>
                <p className="text-xs text-slate-500 mt-1">→ {ex.answer}</p>
              </div>
              <button type="button" onClick={() => handleDeleteExample(ex.id)} className="shrink-0 text-rose-600 hover:text-rose-700">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 md:p-8 space-y-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Quy tắc chung</h2>
            <p className="text-xs text-slate-500 mt-1">Chỉ thị áp dụng cho mọi câu trả lời — VD "luôn hỏi số điện thoại trước khi báo giá".</p>
          </div>
          {renderUsageBadge('Quy tắc', usage?.rules)}
        </div>

        <div className="flex gap-3">
          <input
            type="text"
            value={ruleText}
            onChange={(e) => setRuleText(e.target.value)}
            placeholder="VD: Không bao giờ hứa thời gian giao hàng cụ thể"
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={handleAddRule}
            disabled={savingRule || !ruleText.trim() || ruleLimitReached}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center gap-2 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" /> {savingRule ? 'Đang thêm...' : ruleLimitReached ? 'Đã hết hạn mức' : 'Thêm quy tắc'}
          </button>
        </div>

        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {rules.length === 0 && <p className="text-xs text-slate-400">Chưa có quy tắc nào.</p>}
          {rules.map(r => (
            <div key={r.id} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3">
              <p className={`text-xs flex-1 min-w-0 ${r.isActive ? 'text-slate-700 font-semibold' : 'text-slate-400 line-through'}`}>{r.rule}</p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleToggleRule(r.id, !r.isActive)}
                  className={`flex items-center gap-1 text-[11px] font-bold ${r.isActive ? 'text-emerald-600 hover:text-emerald-700' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Power className="w-3.5 h-3.5" /> {r.isActive ? 'Đang bật' : 'Đang tắt'}
                </button>
                <button type="button" onClick={() => handleDeleteRule(r.id)} className="text-rose-600 hover:text-rose-700">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TrainingPanel;
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: 0 lỗi TypeScript.

- [ ] **Step 3: Commit**

```bash
git add src/TrainingPanel.tsx
git commit -m "feat(training): them component TrainingPanel"
```

---

### Task 9: Wire tab "Huấn luyện phản hồi" vào `App.tsx`

**Files:**
- Modify: `src/App.tsx:3-7` (thêm icon `Wand2` vào import lucide-react)
- Modify: `src/App.tsx:11` (import `TrainingPanel`)
- Modify: `src/App.tsx:90` (mở rộng union `activeTab`)
- Modify: `src/App.tsx:2486-2490` (thêm nav button ngay sau nút "playground")
- Modify: `src/App.tsx:2709` (thêm header title mapping ngay sau dòng `activeTab === 'playground'`)
- Modify: `src/App.tsx:4754-4756` (thêm render panel ngay sau `ContentPanel`)

**Interfaces:**
- Consumes: `TrainingPanel` (Task 8), biến `selectedBotId` đã có sẵn trong `App.tsx` (dùng để truyền `botId` giống `ContentPanel`).

- [ ] **Step 1: Thêm icon `Wand2` vào import lucide-react**

Sửa dòng 6 từ:
```tsx
  Menu, X, Clock, Calendar, Zap, Power, Eye, Globe, PenSquare
```
thành:
```tsx
  Menu, X, Clock, Calendar, Zap, Power, Eye, Globe, PenSquare, Wand2
```

- [ ] **Step 2: Import `TrainingPanel`**

Sửa dòng 11 từ:
```tsx
import { ContentPanel } from './ContentPanel';
```
thành:
```tsx
import { ContentPanel } from './ContentPanel';
import { TrainingPanel } from './TrainingPanel';
```

- [ ] **Step 3: Mở rộng union `activeTab`**

Sửa dòng 90 từ:
```tsx
const [activeTab, setActiveTab] = useState<'dashboard' | 'config' | 'train' | 'kb' | 'playground' | 'telegram' | 'facebook' | 'zalo' | 'website' | 'content' | 'conversations' | 'analytics' | 'supabase' | 'billing' | 'schedules' | 'train-schedules' | 'admin' | 'leads'>(() => isAdminRoute() ? 'admin' : 'dashboard');
```
thành (thêm `'training'` ngay sau `'playground'`):
```tsx
const [activeTab, setActiveTab] = useState<'dashboard' | 'config' | 'train' | 'kb' | 'playground' | 'training' | 'telegram' | 'facebook' | 'zalo' | 'website' | 'content' | 'conversations' | 'analytics' | 'supabase' | 'billing' | 'schedules' | 'train-schedules' | 'admin' | 'leads'>(() => isAdminRoute() ? 'admin' : 'dashboard');
```

- [ ] **Step 4: Thêm nav button ngay sau nút "Playground Chat Thử"**

Trong `src/App.tsx`, ngay sau khối (dòng 2484-2490):
```tsx
          <button
            onClick={() => { setActiveTab('playground'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-150 ${activeTab === 'playground' ? 'bg-emerald-500/10 text-emerald-400 border-l-4 border-emerald-500 font-semibold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
          >
            <Play className="w-4 h-4" />
            Playground Chat Thử
          </button>
```
thêm:
```tsx

          <button
            onClick={() => { setActiveTab('training'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-150 ${activeTab === 'training' ? 'bg-emerald-500/10 text-emerald-400 border-l-4 border-emerald-500 font-semibold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
          >
            <Wand2 className="w-4 h-4" />
            Huấn luyện phản hồi
          </button>
```

- [ ] **Step 5: Thêm header title mapping**

Trong `src/App.tsx`, ngay sau dòng (dòng 2709):
```tsx
                  {activeTab === 'playground' && 'Playground Chat Thử Nghiệm'}
```
thêm:
```tsx
                  {activeTab === 'training' && 'Huấn luyện phản hồi bot'}
```

- [ ] **Step 6: Render `TrainingPanel`**

Trong `src/App.tsx`, ngay sau khối (dòng 4754-4756):
```tsx
          {activeTab === 'content' && (
            <ContentPanel botId={selectedBotId} />
          )}
```
thêm:
```tsx

          {activeTab === 'training' && (
            <TrainingPanel botId={selectedBotId} />
          )}
```

- [ ] **Step 7: Typecheck**

Run: `npm run lint`
Expected: 0 lỗi TypeScript.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx
git commit -m "feat(training): them tab Huan luyen phan hoi vao sidebar"
```

---

### Task 10: Xác minh thủ công đầu-cuối

**Files:** (không tạo/sửa file — chỉ chạy và quan sát)

**Interfaces:**
- Consumes: toàn bộ Task 1-9.

- [ ] **Step 1: Chạy toàn bộ test suite + typecheck**

Run: `npm test && npm run lint`
Expected: PASS toàn bộ (bao gồm 3 test `TRAINING_LIMITS` + 4 test mới trong `synthesis.test.ts` + toàn bộ test cũ không bị vỡ), 0 lỗi TypeScript.

- [ ] **Step 2: Chạy migration trên Supabase dự án dev (nếu có) hoặc ghi chú nợ vận hành**

Nếu có project Supabase dev để test: dán nội dung `training.sql` vào SQL Editor, chạy, xác nhận 2 bảng `bot_training_examples`/`bot_training_rules` xuất hiện trong Table Editor không lỗi.
Nếu không có project dev sẵn: bỏ qua bước chạy thật, ghi chú lại "Nợ vận hành" — owner phải chạy `training.sql` trên Supabase gốc trước khi bật tab (đúng như spec).

- [ ] **Step 3: Khởi động dev server**

Run: `npm run dev`
Expected: server start trên cổng cấu hình (log "Server đang chạy..." hoặc tương đương), không lỗi khi boot.

- [ ] **Step 4: Kiểm tra thủ công trên trình duyệt**

Mở dashboard, chọn 1 bot có sẵn (hoặc tạo bot test), vào tab "Huấn luyện phản hồi":
1. Thêm 1 ví dụ mẫu (VD câu hỏi "Bên mình có ship COD không?" → trả lời "Dạ có ạ, COD toàn quốc.") — xác nhận xuất hiện trong danh sách, badge quota tăng lên 1.
2. Thêm 1 quy tắc (VD "Luôn xưng hô là 'em'") — xác nhận xuất hiện, toggle bật/tắt hoạt động, badge quota tăng lên 1.
3. Sang tab "Playground Chat Thử", hỏi đúng câu đã dạy ("Bên mình có ship COD không?") — xác nhận câu trả lời bot bám theo ví dụ mẫu đã nạp.
4. Quay lại tab "Huấn luyện phản hồi", xóa ví dụ/quy tắc vừa thêm — xác nhận biến mất khỏi danh sách, badge quota giảm lại.

Expected: cả 4 bước hoạt động đúng như mô tả, không lỗi console.

- [ ] **Step 5: Xác minh cách ly tenant (thủ công)**

Codebase này không có test tự động cho tầng route Express (đã ghi trong Global Constraints) — `assertResourceBotAccess`/bot-guard middleware cũng chưa từng được unit test cho bất kỳ resource nào khác (`content_posts` cũng chỉ verify thủ công). Vì spec yêu cầu xác nhận cách ly tenant, verify thủ công bằng cách:
1. Tạo/dùng 2 bot thuộc 2 tài khoản (userId) khác nhau, lấy `id` một ví dụ mẫu vừa tạo ở bot A.
2. Đăng nhập tài khoản B (chủ bot B), gọi `DELETE /api/training/examples/<id của bot A>` (VD qua DevTools Network hoặc curl kèm cookie/token của tài khoản B).

Run: `curl -X DELETE "http://localhost:<port>/api/training/examples/<id>" -H "Authorization: Bearer <token của tài khoản B>"`
Expected: HTTP 403 với body `{ "error": "Bạn không có quyền truy cập tài nguyên này." }` — ví dụ mẫu của bot A KHÔNG bị xóa.

- [ ] **Step 6: Ghi chú kết quả xác minh**

Không cần file mới — chỉ báo cáo lại cho người dùng: đã chạy `npm test`/`npm run lint` PASS, đã (hoặc chưa, nếu không có Supabase dev) chạy thử migration, đã verify luồng UI→Playground bằng tay.
