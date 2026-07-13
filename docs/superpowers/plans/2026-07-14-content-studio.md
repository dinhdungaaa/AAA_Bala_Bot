# Content Studio (fbtool v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm tab "Tạo bài viết" vào BalaBot: từ Kho Kiến Thức của bot, sinh bài quảng bá + bài thương hiệu cá nhân (text) qua Gemini, có giới hạn theo gói.

**Architecture:** Port lõi engine thuần TS của fbtool (`lib/engine` + `lib/pipeline` nhánh POST) vào thư mục `contentEngine/` của BalaBot; thay lớp LLM bằng adapter gọi `getAIClient()` (Gemini) sẵn có; thêm bảng `content_posts` + quota `content_usage`; routes dưới middleware token; tab UI trong App.tsx.

**Tech Stack:** Node/Express + TypeScript ESM (`.js` import specifiers), `@google/genai`, Supabase, React (Vite), Vitest.

## Global Constraints
- ESM: mọi import nội bộ dùng đuôi `.js` (vd `from "./types.js"`), khớp cấu hình BalaBot (`tsc` + esbuild bundle).
- Không thêm dependency mới; chỉ dùng `@google/genai` + Supabase sẵn có. KHÔNG port `lib/ai/*` đa provider (groq/openrouter/fallback), credits, calendar, ad-*, thumbnail-*.
- Mọi route bot đi qua middleware token đã có; route theo id tài nguyên gọi `assertResourceBotAccess(req,res,"content_posts",id,memoryBotId)`.
- Nguồn port: `D:/Vibe Code/Content AAA/AI-Facebook-Content-Tool-v1/webapp/studio` (gọi tắt `SRC`).
- Test chạy: `npx vitest run <path>`. Typecheck: `npx tsc --noEmit`.

---

## File Structure

**Tạo mới:**
- `contentEngine/types.ts` `post-formulas.ts` `poke-holes.ts` `pillars.ts` `quality-gate.ts` `sanitize.ts` `guardrails.ts` `length.ts` `schemas.ts` `model-policy.ts` `prompts.ts` `generatePost.ts` — port từ SRC.
- `contentEngine/llm.ts` — interface `LlmClient` (port) + `buildGeminiLlmClient()` (mới, adapter Gemini).
- `contentEngine/brandFromBot.ts` — dựng `Brand` + `ingredients` từ `BotConfig` + chunks (mới).
- `content.sql` — migration bảng `content_posts` + `content_usage`.
- `__tests__/content-engine.test.ts` (gộp test port) + `__tests__/content-brand.test.ts` + `__tests__/content-gate.test.ts`.

**Sửa:**
- `supabaseService.ts` — thêm CRUD `content_posts` + usage.
- `billing.ts` — thêm `CONTENT_LIMITS`.
- `server.ts` — `checkContentGate`, `recordContentUse`, routes content.
- `src/App.tsx` — tab "Tạo bài viết" + nav.

---

## Task 1: Port engine thuần (không phụ thuộc LLM)

**Files:**
- Create: `contentEngine/types.ts`, `post-formulas.ts`, `poke-holes.ts`, `pillars.ts`, `quality-gate.ts`, `sanitize.ts`, `guardrails.ts`, `length.ts`
- Test: `__tests__/content-engine.test.ts`

**Interfaces:**
- Produces: `PostType` (`"D1".."D7"`), `Brand`, `getFormula(postType): PostFormula`, `evaluateQualityGate(scores: Record<string,boolean>): QualityResult`, `sanitizePostContent(s: string): string`, `findMarkdownViolations(s: string): string[]`, `hasVietnameseDiacritics(s: string): boolean`, `resolveLength(pref, medianWords?): LengthTarget`, `LENGTH_OPTIONS`, `POKE_HOLE_FILTERS`, `QUALITY_ITEMS`.

- [ ] **Step 1: Copy 8 file engine, đổi import sang `.js`**

Copy nguyên văn từ `SRC/lib/engine/{types,post-formulas,poke-holes,pillars,quality-gate,sanitize}.ts` và `SRC/lib/pipeline/{guardrails,length}.ts` vào `contentEngine/`. Trong mỗi file, đổi mọi import nội bộ thành đuôi `.js` và bỏ tiền tố `../engine/`/`../pipeline/` (giờ cùng thư mục), ví dụ:
- trong `quality-gate.ts`: `from "./types"` → `from "./types.js"`.
- trong `poke-holes.ts`, `post-formulas.ts`, `sanitize.ts`, `pillars.ts`: sửa tương tự.
- `guardrails.ts`, `length.ts`: không có import nội bộ engine → chỉ thêm `.js` nếu có.

- [ ] **Step 2: Gộp test port vào 1 file**

Tạo `__tests__/content-engine.test.ts` gộp nội dung các test tương ứng từ `SRC/lib/engine/*.test.ts` và `SRC/lib/pipeline/{guardrails,length}.test.ts`, đổi import sang `../contentEngine/<file>.js`. Giữ nguyên các `describe/it/expect`.

- [ ] **Step 3: Chạy test — kỳ vọng PASS**

Run: `npx vitest run __tests__/content-engine.test.ts`
Expected: tất cả test port PASS (post-formulas D1–D7, quality-gate ngưỡng 85 + required fail, sanitize bỏ markdown, guardrails, length buckets).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 5: Commit**

```bash
git add contentEngine/ __tests__/content-engine.test.ts
git commit -m "feat(content): port engine thuan (formulas, quality-gate, sanitize, length)"
```

---

## Task 2: Port schemas + model-policy + prompts

**Files:**
- Create: `contentEngine/schemas.ts`, `contentEngine/model-policy.ts`, `contentEngine/prompts.ts`
- Test: thêm vào `__tests__/content-engine.test.ts`

**Interfaces:**
- Consumes: từ Task 1 — `getFormula`, `POKE_HOLE_FILTERS`, `QUALITY_ITEMS`, `LengthTarget`, `PostType`.
- Produces: `IDEA_SCHEMA`, `SCORING_SCHEMA` (object), `pickModel(postType): string`, `PromptInput`, `buildIdeaPrompt/buildDraftPrompt/buildRevisePrompt/buildScoringPrompt(input, ...): string`.

- [ ] **Step 1: Copy schemas + model-policy + prompts, đổi import `.js`**

Copy `SRC/lib/ai/schemas.ts` → `contentEngine/schemas.ts`; `SRC/lib/pipeline/model-policy.ts` → `contentEngine/model-policy.ts`; `SRC/lib/pipeline/prompts.ts` → `contentEngine/prompts.ts`. Đổi import: trong `prompts.ts` `from "../engine/post-formulas"` → `from "./post-formulas.js"`, `from "../engine/poke-holes"` → `from "./poke-holes.js"`, `from "../engine/quality-gate"` → `from "./quality-gate.js"`, `from "./length"` → `from "./length.js"`, `from "../engine/types"` → `from "./types.js"`. Trong `model-policy.ts` nếu import types → `.js`.

- [ ] **Step 2: Sửa model mặc định về model BalaBot đang dùng**

Trong `contentEngine/model-policy.ts`, đặt model trả về = hằng model Gemini BalaBot dùng cho sinh nội dung. Mở `rag/constants.ts` đọc `GEN_MODEL`; đặt `pickModel()` trả đúng chuỗi đó (vd `"gemini-2.5-flash"` — copy đúng giá trị `GEN_MODEL` hiện tại). Nếu file có nhiều model theo postType, cho tất cả trả về `GEN_MODEL` để v1 đơn giản.

- [ ] **Step 3: Copy test tương ứng, đổi import**

Thêm vào `__tests__/content-engine.test.ts` nội dung `SRC/lib/pipeline/prompts.test.ts` (đổi import `../contentEngine/prompts.js`). Nếu test model-policy phụ thuộc nhiều model, sửa kỳ vọng cho khớp giá trị mới (đều = GEN_MODEL).

- [ ] **Step 4: Chạy test + typecheck**

Run: `npx vitest run __tests__/content-engine.test.ts && npx tsc --noEmit`
Expected: PASS, EXIT 0.

- [ ] **Step 5: Commit**

```bash
git add contentEngine/ __tests__/content-engine.test.ts
git commit -m "feat(content): port schemas, model-policy, prompts"
```

---

## Task 3: Port orchestrator runGeneration + test với fake LlmClient

**Files:**
- Create: `contentEngine/llm.ts` (chỉ interface phần này), `contentEngine/generatePost.ts`
- Test: `__tests__/content-generate.test.ts`

**Interfaces:**
- Consumes: Task 1–2.
- Produces: `LlmClient { generateJson<T>(schema,prompt,model): Promise<T>; generateText(prompt,model): Promise<string> }`; `runGeneration(input: GenerationInput, deps: GenerationDeps): Promise<GenerationResult>`; types `GenerationInput`, `GenerationDeps`, `GenerationResult`, `ProgressEvent`.

- [ ] **Step 1: Tạo `contentEngine/llm.ts` (interface)**

```ts
// Trừu tượng LLM để pipeline test được với fake. Adapter Gemini thêm ở Task 4.
export interface LlmClient {
  generateJson<T>(schema: object, prompt: string, model: string): Promise<T>;
  generateText(prompt: string, model: string): Promise<string>;
}
```

- [ ] **Step 2: Copy `generate-post.ts` → `generatePost.ts`, đổi import `.js`**

Copy `SRC/lib/pipeline/generate-post.ts`. Đổi import: `from "../engine/types"` → `from "./types.js"`, `from "../ai/llm"` → `from "./llm.js"`, `from "../engine/sanitize"` → `from "./sanitize.js"`, `from "../engine/quality-gate"` → `from "./quality-gate.js"`, `from "../ai/schemas"` → `from "./schemas.js"`, `from "./model-policy"` → `from "./model-policy.js"`, `from "./guardrails"` → `from "./guardrails.js"`, `from "./prompts"` → `from "./prompts.js"`, `from "./length"` → `from "./length.js"`.

- [ ] **Step 3: Viết test với fake client**

```ts
// __tests__/content-generate.test.ts
import { describe, it, expect } from "vitest";
import { runGeneration } from "../contentEngine/generatePost.js";
import type { LlmClient } from "../contentEngine/llm.js";

function fakeClient(): LlmClient {
  return {
    async generateJson<T>(_schema: object, prompt: string): Promise<T> {
      // Idea prompt → angle; Scoring prompt → tất cả item pass.
      if (prompt.includes("content strategist")) return { angle: "Góc test" } as unknown as T;
      const scores: Record<string, boolean> = {
        hook: true, no_fluff: true, sell_outcome: true, cta: true, pillar: true,
        tone: true, address: true, specificity: true, depth: true, emoji: true, mobile: true,
      };
      return { scores, suggestions: [] } as unknown as T;
    },
    async generateText(): Promise<string> {
      return "Hook cụ thể ngày hôm qua.\n\nNội dung bài viết mẫu đủ dài.\n\nBạn nghĩ sao? Comment nhé.";
    },
  };
}

describe("runGeneration", () => {
  it("chạy pipeline, trả content + quality.passed", async () => {
    const res = await runGeneration(
      { brand: { name: "AAA" }, topic: "Ra mắt khóa học", postType: "D1" },
      { client: fakeClient() },
    );
    expect(res.content).toContain("Hook");
    expect(res.quality.passed).toBe(true);
    expect(res.rounds).toBe(1);
  });

  it("economy=true bỏ bước idea (angle = topic)", async () => {
    const res = await runGeneration(
      { brand: { name: "AAA" }, topic: "Chủ đề X", postType: "D2" },
      { client: fakeClient(), economy: true },
    );
    expect(res.angle).toBe("Chủ đề X");
  });
});
```

- [ ] **Step 4: Chạy test + typecheck**

Run: `npx vitest run __tests__/content-generate.test.ts && npx tsc --noEmit`
Expected: PASS, EXIT 0.

- [ ] **Step 5: Commit**

```bash
git add contentEngine/llm.ts contentEngine/generatePost.ts __tests__/content-generate.test.ts
git commit -m "feat(content): port runGeneration orchestrator + fake-client test"
```

---

## Task 4: Adapter Gemini cho LlmClient

**Files:**
- Modify: `contentEngine/llm.ts` (thêm `buildGeminiLlmClient`)
- Test: `__tests__/content-generate.test.ts` (thêm 1 ca cấu trúc; không gọi mạng)

**Interfaces:**
- Consumes: `getAIClient()` từ server (truyền vào để tránh vòng import) — adapter nhận `ai: GoogleGenAI`.
- Produces: `buildGeminiLlmClient(ai: GoogleGenAI): LlmClient`.

- [ ] **Step 1: Thêm adapter vào `contentEngine/llm.ts`**

```ts
import type { GoogleGenAI } from "@google/genai";

// Adapter Gemini: hiện thực LlmClient bằng client @google/genai của BalaBot.
// generateJson dùng responseMimeType JSON + responseSchema; generateText trả text thô.
export function buildGeminiLlmClient(ai: GoogleGenAI): LlmClient {
  return {
    async generateJson<T>(schema: object, prompt: string, model: string): Promise<T> {
      const res: any = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: schema as any, temperature: 0.7 },
      } as any);
      const text = (res?.text || "").trim();
      return JSON.parse(text) as T;
    },
    async generateText(prompt: string, model: string): Promise<string> {
      const res: any = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { temperature: 0.8, thinkingConfig: { thinkingBudget: 1024 } },
      } as any);
      return (res?.text || "").trim();
    },
  };
}
```

- [ ] **Step 2: Test cấu trúc adapter với fake `ai`**

```ts
// thêm vào __tests__/content-generate.test.ts
import { buildGeminiLlmClient } from "../contentEngine/llm.js";

describe("buildGeminiLlmClient", () => {
  it("generateJson parse JSON từ res.text", async () => {
    const fakeAi: any = { models: { generateContent: async () => ({ text: '{"ok":true}' }) } };
    const c = buildGeminiLlmClient(fakeAi);
    expect(await c.generateJson<{ ok: boolean }>({}, "p", "m")).toEqual({ ok: true });
  });
  it("generateText trả text", async () => {
    const fakeAi: any = { models: { generateContent: async () => ({ text: "  hello  " }) } };
    const c = buildGeminiLlmClient(fakeAi);
    expect(await c.generateText("p", "m")).toBe("hello");
  });
});
```

- [ ] **Step 3: Chạy test + typecheck**

Run: `npx vitest run __tests__/content-generate.test.ts && npx tsc --noEmit`
Expected: PASS, EXIT 0.

- [ ] **Step 4: Commit**

```bash
git add contentEngine/llm.ts __tests__/content-generate.test.ts
git commit -m "feat(content): adapter Gemini cho LlmClient"
```

---

## Task 5: Dựng Brand + ingredients từ bot

**Files:**
- Create: `contentEngine/brandFromBot.ts`
- Test: `__tests__/content-brand.test.ts`

**Interfaces:**
- Consumes: `BotConfig` (`src/types.ts`), `KnowledgeChunk`.
- Produces: `brandFromBot(bot: BotConfig): Brand`; `ingredientsFromChunks(chunks: {title?:string;content?:string}[], max?: number): string`.

- [ ] **Step 1: Viết test**

```ts
// __tests__/content-brand.test.ts
import { describe, it, expect } from "vitest";
import { brandFromBot, ingredientsFromChunks } from "../contentEngine/brandFromBot.js";

describe("brandFromBot", () => {
  it("lấy name từ bot", () => {
    const b = brandFromBot({ id: "b1", name: "AAA Shop" } as any);
    expect(b.name).toBe("AAA Shop");
  });
});

describe("ingredientsFromChunks", () => {
  it("ghép title+content, giới hạn số đoạn", () => {
    const chunks = [
      { title: "SP1", content: "Mô tả 1" },
      { title: "SP2", content: "Mô tả 2" },
      { title: "SP3", content: "Mô tả 3" },
    ];
    const out = ingredientsFromChunks(chunks, 2);
    expect(out).toContain("SP1");
    expect(out).toContain("SP2");
    expect(out).not.toContain("SP3");
  });
  it("rỗng → chuỗi rỗng", () => {
    expect(ingredientsFromChunks([], 3)).toBe("");
  });
});
```

- [ ] **Step 2: Viết `brandFromBot.ts`**

```ts
import type { BotConfig } from "../src/types.js";
import type { Brand } from "./types.js";

// Brand tối thiểu engine cần: chỉ name (pillars dùng mặc định của engine).
export function brandFromBot(bot: BotConfig): Brand {
  return { name: bot.name || "Thương hiệu" };
}

// Ghép các đoạn kiến thức thành "nguyên liệu" cho prompt. Giới hạn số đoạn để
// prompt không quá dài; mỗi đoạn gói gọn tiêu đề + nội dung.
export function ingredientsFromChunks(
  chunks: { title?: string; content?: string }[],
  max = 6,
): string {
  return (chunks || [])
    .slice(0, max)
    .map((c) => [c.title, c.content].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("\n");
}
```

- [ ] **Step 3: Chạy test + typecheck**

Run: `npx vitest run __tests__/content-brand.test.ts && npx tsc --noEmit`
Expected: PASS, EXIT 0.

- [ ] **Step 4: Commit**

```bash
git add contentEngine/brandFromBot.ts __tests__/content-brand.test.ts
git commit -m "feat(content): dung Brand + ingredients tu bot"
```

---

## Task 6: Migration SQL + DB layer content_posts & usage

**Files:**
- Create: `content.sql`
- Modify: `supabaseService.ts` (thêm ở cuối, trước export cuối cùng)

**Interfaces:**
- Produces (supabaseService.ts):
  - `dbSaveContentPost(post: ContentPost): Promise<boolean>`
  - `dbListContentPosts(botId: string): Promise<ContentPost[]>`
  - `dbUpdateContentPost(id: string, updates: Partial<ContentPost>): Promise<boolean>`
  - `dbDeleteContentPost(id: string): Promise<boolean>`
  - `dbGetContentUsage(ownerKey: string, ym: string): Promise<number>`
  - `dbIncrementContentUsage(ownerKey: string, ym: string): Promise<void>`
  - type `ContentPost { id; botId; userId; postType; topic; content; score; status; createdAt }`

- [ ] **Step 1: Viết `content.sql`**

```sql
-- Bảng bài viết Content Studio (v1).
create table if not exists public.content_posts (
  id text primary key,
  "botId" text not null,
  "userId" text,
  "postType" text not null,
  topic text,
  content text,
  score int default 0,
  status text default 'draft',
  "createdAt" timestamptz default now()
);
create index if not exists content_posts_botid_idx on public.content_posts ("botId");
create index if not exists content_posts_userid_idx on public.content_posts ("userId");

-- Đếm quota content theo chủ sở hữu theo tháng (tách khỏi quota tin nhắn).
create table if not exists public.content_usage (
  owner_key text not null,
  ym text not null,
  count int default 0,
  primary key (owner_key, ym)
);
```

- [ ] **Step 2: Thêm type + CRUD vào `supabaseService.ts`**

Thêm gần các `dbGet*` khác (theo mẫu `dbGetChunks`/`dbSaveChunk` sẵn có — có localFallback tùy nhu cầu; ở đây content không cần fallback in-memory, trả rỗng/false khi không có client):

```ts
export interface ContentPost {
  id: string; botId: string; userId?: string; postType: string;
  topic?: string; content?: string; score?: number; status?: string; createdAt?: string;
}

export async function dbSaveContentPost(post: ContentPost): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const { error } = await client.from("content_posts").insert(post);
  if (error) { console.warn("dbSaveContentPost:", error.message); return false; }
  return true;
}

export async function dbListContentPosts(botId: string): Promise<ContentPost[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client.from("content_posts").select("*").eq("botId", botId).order("createdAt", { ascending: false });
  if (error) { console.warn("dbListContentPosts:", error.message); return []; }
  return (data as ContentPost[]) || [];
}

export async function dbUpdateContentPost(id: string, updates: Partial<ContentPost>): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const { error } = await client.from("content_posts").update(updates).eq("id", id);
  if (error) { console.warn("dbUpdateContentPost:", error.message); return false; }
  return true;
}

export async function dbDeleteContentPost(id: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const { error } = await client.from("content_posts").delete().eq("id", id);
  if (error) { console.warn("dbDeleteContentPost:", error.message); return false; }
  return true;
}

export async function dbGetContentUsage(ownerKey: string, ym: string): Promise<number> {
  const client = getSupabaseClient();
  if (!client) return 0;
  const { data } = await client.from("content_usage").select("count").eq("owner_key", ownerKey).eq("ym", ym).maybeSingle();
  return Number((data as any)?.count) || 0;
}

export async function dbIncrementContentUsage(ownerKey: string, ym: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const cur = await dbGetContentUsage(ownerKey, ym);
  const { error } = await client.from("content_usage").upsert({ owner_key: ownerKey, ym, count: cur + 1 }, { onConflict: "owner_key,ym" });
  if (error) console.warn("dbIncrementContentUsage:", error.message);
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 4: Commit**

```bash
git add content.sql supabaseService.ts
git commit -m "feat(content): migration content_posts/usage + DB CRUD"
```

---

## Task 7: CONTENT_LIMITS + checkContentGate

**Files:**
- Modify: `billing.ts` (thêm `CONTENT_LIMITS`)
- Modify: `server.ts` (thêm `checkContentGate`, `recordContentUse` gần `checkUsageGate`)
- Test: `__tests__/content-gate.test.ts`

**Interfaces:**
- Consumes: `resolveOwnerPlan(ownerKey): Promise<{tier;limit}>` (đã có), `usageVerdict`, `currentYearMonth`, `dbGetContentUsage`, `dbIncrementContentUsage`.
- Produces: `CONTENT_LIMITS: Record<tier, number>`; `checkContentGate(bot): Promise<{allowed;verdict;count;limit}>`; `recordContentUse(bot): Promise<void>`.

- [ ] **Step 1: Thêm `CONTENT_LIMITS` vào `billing.ts`**

```ts
// Hạn mức số bài Content Studio mỗi tháng theo gói. Gói cao dùng thoải mái, gói
// thấp giới hạn. Chỉnh số tự do sau.
export const CONTENT_LIMITS: Record<"free" | "starter" | "pro" | "business" | "enterprise", number> = {
  free: 5, starter: 30, pro: 150, business: 600, enterprise: 999999,
};
```

- [ ] **Step 2: Viết test gate (thuần, không LLM)**

```ts
// __tests__/content-gate.test.ts
import { describe, it, expect } from "vitest";
import { CONTENT_LIMITS } from "../billing.js";
import { usageVerdict } from "../billing.js";

describe("CONTENT_LIMITS", () => {
  it("gói cao > gói thấp", () => {
    expect(CONTENT_LIMITS.pro).toBeGreaterThan(CONTENT_LIMITS.free);
    expect(CONTENT_LIMITS.enterprise).toBeGreaterThan(CONTENT_LIMITS.business);
  });
  it("verdict chặn khi vượt 110% hạn mức content", () => {
    expect(usageVerdict(CONTENT_LIMITS.free + 1, CONTENT_LIMITS.free)).not.toBe("ok");
    expect(usageVerdict(6, 5)).toBe("blocked"); // 6/5 = 120%
  });
});
```

- [ ] **Step 3: Thêm `checkContentGate` + `recordContentUse` vào `server.ts`**

Đặt ngay sau `recordUsageForBot`. Import `CONTENT_LIMITS`, `dbGetContentUsage`, `dbIncrementContentUsage` (thêm vào khối import supabaseService + billing).

```ts
async function checkContentGate(bot: BotConfig): Promise<{ allowed: boolean; verdict: "ok" | "warn" | "blocked"; count: number; limit: number }> {
  const ownerKey = bot.userId || "";
  if (!ownerKey) return { allowed: true, verdict: "ok", count: 0, limit: 0 };
  const { tier } = await resolveOwnerPlan(ownerKey);
  if (tier === "none") return { allowed: false, verdict: "blocked", count: 0, limit: 0 };
  const limit = CONTENT_LIMITS[tier as keyof typeof CONTENT_LIMITS] ?? CONTENT_LIMITS.free;
  const count = await dbGetContentUsage(ownerKey, currentYearMonth());
  const verdict = usageVerdict(count, limit);
  return { allowed: verdict !== "blocked", verdict, count, limit };
}

async function recordContentUse(bot: BotConfig): Promise<void> {
  const ownerKey = bot.userId || "";
  if (!ownerKey) return;
  await dbIncrementContentUsage(ownerKey, currentYearMonth());
}
```

- [ ] **Step 4: Chạy test + typecheck**

Run: `npx vitest run __tests__/content-gate.test.ts && npx tsc --noEmit`
Expected: PASS, EXIT 0.

- [ ] **Step 5: Commit**

```bash
git add billing.ts server.ts __tests__/content-gate.test.ts
git commit -m "feat(content): CONTENT_LIMITS + checkContentGate theo goi"
```

---

## Task 8: Routes API content

**Files:**
- Modify: `server.ts` (thêm routes + import từ contentEngine)

**Interfaces:**
- Consumes: `runGeneration`, `buildGeminiLlmClient`, `brandFromBot`, `ingredientsFromChunks`, `resolveLength`, `getAIClient`, `dbGetChunks`, `checkContentGate`, `recordContentUse`, `assertResourceBotAccess`, DB content CRUD.
- Produces: 5 endpoints.

- [ ] **Step 1: Thêm import contentEngine đầu server.ts**

```ts
import { runGeneration } from "./contentEngine/generatePost.js";
import { buildGeminiLlmClient } from "./contentEngine/llm.js";
import { brandFromBot, ingredientsFromChunks } from "./contentEngine/brandFromBot.js";
import { resolveLength } from "./contentEngine/length.js";
import type { PostType } from "./contentEngine/types.js";
```
Và trong khối import supabaseService: `dbSaveContentPost, dbListContentPosts, dbUpdateContentPost, dbDeleteContentPost, dbGetContentUsage, dbIncrementContentUsage`. Trong import billing: `CONTENT_LIMITS`.

- [ ] **Step 2: Thêm routes (đặt gần các route bot khác, vd sau `/api/bots/:botId/leads`)**

```ts
// Sinh 1 bài viết từ Kho Kiến Thức của bot. Middleware token đã bảo vệ /api/bots/:botId/*.
app.post("/api/bots/:botId/content/generate", async (req, res) => {
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === req.params.botId);
  if (!bot) return res.status(404).json({ error: "Không tìm thấy bot." });

  const gate = await checkContentGate(bot);
  if (!gate.allowed) {
    return res.status(429).json({ error: "Bạn đã hết lượt tạo bài của gói tháng này. Nâng gói để tạo thêm.", gate });
  }

  const ai = getAIClient();
  if (!ai) return res.status(400).json({ error: "Chưa cấu hình GEMINI_API_KEY." });

  const postType = String(req.body?.postType || "D1") as PostType;
  const topic = String(req.body?.topic || "").trim();
  if (!topic) return res.status(400).json({ error: "Thiếu chủ đề bài viết." });
  const goal = req.body?.goal ? String(req.body.goal) : undefined;
  const extra = req.body?.extraIngredients ? String(req.body.extraIngredients) : "";
  const lengthPref = (req.body?.lengthPreference || "auto");

  const chunks = await dbGetChunks(bot.id, knowledgeChunks.filter(c => c.botId === bot.id && c.isActive));
  const knowledge = ingredientsFromChunks(chunks as any, 6);
  const ingredients = [knowledge, extra].filter(Boolean).join("\n");

  try {
    const result = await runGeneration(
      {
        brand: brandFromBot(bot),
        topic, postType, goal, ingredients,
        lengthTarget: resolveLength(lengthPref),
      },
      { client: buildGeminiLlmClient(ai), economy: gate.limit <= CONTENT_LIMITS.free },
    );
    const post = {
      id: "cpost-" + Math.random().toString(36).substr(2, 9),
      botId: bot.id, userId: bot.userId, postType, topic,
      content: result.content, score: result.quality.score, status: "draft",
      createdAt: new Date().toISOString(),
    };
    await dbSaveContentPost(post);
    await recordContentUse(bot);
    res.json({ ...post, passed: result.quality.passed, failures: result.quality.failures });
  } catch (err: any) {
    console.error("[Content] generate lỗi:", err?.message || err);
    res.status(500).json({ error: "Tạo bài thất bại, thử lại sau ít phút." });
  }
});

app.get("/api/bots/:botId/content", async (req, res) => {
  const posts = await dbListContentPosts(req.params.botId);
  res.json(posts);
});

app.get("/api/bots/:botId/content/usage", async (req, res) => {
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === req.params.botId);
  if (!bot) return res.status(404).json({ error: "Không tìm thấy bot." });
  const gate = await checkContentGate(bot);
  res.json({ count: gate.count, limit: gate.limit, verdict: gate.verdict });
});

app.put("/api/content/:id", async (req, res) => {
  if (!(await assertResourceBotAccess(req, res, "content_posts", req.params.id))) return;
  const updates: any = {};
  if (typeof req.body?.content === "string") updates.content = req.body.content;
  if (typeof req.body?.status === "string") updates.status = req.body.status;
  await dbUpdateContentPost(req.params.id, updates);
  res.json({ success: true });
});

app.delete("/api/content/:id", async (req, res) => {
  if (!(await assertResourceBotAccess(req, res, "content_posts", req.params.id))) return;
  await dbDeleteContentPost(req.params.id);
  res.json({ success: true });
});
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build 2>&1 | tail -3`
Expected: EXIT 0, build xong.

- [ ] **Step 4: Test tay tại chỗ (không LLM) — list rỗng**

Run (server chạy local hoặc sau deploy staging): `GET /api/bots/<id>/content` trả `[]` (chưa có bài). Bỏ qua nếu chưa chạy DB.

- [ ] **Step 5: Commit**

```bash
git add server.ts
git commit -m "feat(content): routes generate/list/usage/update/delete"
```

---

## Task 9: Tab "Tạo bài viết" trong dashboard

**Files:**
- Modify: `src/App.tsx` (thêm nav item + panel + state)

**Interfaces:**
- Consumes: các endpoint Task 8; `selectedBotId`, `getScopedApiHeaders`/fetch interceptor (tự gắn token).

- [ ] **Step 1: Thêm nav item + tab id**

Tìm mảng/khối nav sidebar (nơi có 'dashboard','zalo','website'...). Thêm mục `{ id: 'content', label: 'Tạo bài viết', icon: <PenSquare .../> }` (dùng icon lucide có sẵn, vd `PenSquare` hoặc `FileText`). Thêm `activeTab === 'content'` render `<ContentPanel botId={selectedBotId} />` trong vùng nội dung chính.

- [ ] **Step 2: Viết `ContentPanel` (component trong App.tsx hoặc file mới `src/ContentPanel.tsx`)**

Component gồm: select loại bài (nhóm "Quảng bá": D4 how-to, D2 insight, ... map nhãn tiếng Việt; nhóm "Thương hiệu cá nhân": D1 storytelling, D3 hot take...), input chủ đề, input mục tiêu (goal), select độ dài (LENGTH_OPTIONS: auto/short/medium/long), textarea "nguyên liệu thêm", nút "Tạo bài". Khi bấm: `POST /api/bots/${botId}/content/generate` với body `{postType,topic,goal,lengthPreference,extraIngredients}`. Hiển thị loading, rồi kết quả: nội dung (textarea sửa được), điểm chất lượng, nút Copy / Lưu (PUT) / Xóa (DELETE). Dưới cùng: danh sách bài đã tạo (`GET .../content`) với Copy/Xóa. Trên cùng: thẻ quota (`GET .../content/usage`) "Đã dùng X/Y bài tháng này" + CTA nâng gói khi verdict!=='ok'.

(Mã đầy đủ component ~150 dòng — theo mẫu style panel hiện có trong App.tsx: Tailwind, emerald accent, fetch trực tiếp. Copy pattern từ panel Zalo/Website đã có để đồng bộ giao diện.)

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build 2>&1 | tail -3`
Expected: EXIT 0.

- [ ] **Step 4: Kiểm tra bundle chứa tab**

Run: `grep -c "Tạo bài viết" dist/assets/index-*.js` → ≥1.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/ContentPanel.tsx 2>/dev/null
git commit -m "feat(content): tab Tao bai viet + panel generate/list/quota"
```

---

## Task 10: Test tích hợp thật + deploy + tài liệu owner

**Files:**
- Modify: `docs/` (ghi chú owner chạy `content.sql`)

- [ ] **Step 1: Chạy full test + build**

Run: `npx vitest run && npx tsc --noEmit && npm run build 2>&1 | tail -3`
Expected: tất cả PASS, EXIT 0.

- [ ] **Step 2: Owner chạy `content.sql` trên Supabase gốc**

Vào Supabase SQL Editor → dán `content.sql` → Run. (Nợ vận hành như các migration khác.)

- [ ] **Step 3: Deploy backend + frontend**

```bash
git push origin main   # Railway auto-deploy backend
npm run build
npx wrangler pages deploy dist --project-name=aaa-balabot --branch=main --commit-dirty=true
```

- [ ] **Step 4: UAT thật**

Đăng nhập dashboard → chọn bot đã có kiến thức → tab "Tạo bài viết" → tạo 1 bài quảng bá (vd D4) và 1 bài cá nhân (D1) → kiểm nội dung bám sản phẩm, điểm chất lượng hiển thị, Copy/Lưu/Xóa chạy, quota tăng. Thử tài khoản gói free vượt 5 bài → bị chặn 429 + CTA nâng gói.

- [ ] **Step 5: Commit ghi chú**

```bash
git add docs/
git commit -m "docs(content): ghi chu owner chay content.sql + UAT"
```

---

## Self-Review (đã chạy)
- **Spec coverage:** engine port (T1–3), Gemini adapter (T4), brand-from-bot + ingredients từ kho kiến thức (T5), bảng + quota (T6–7 theo gói), routes bảo mật token (T8), tab UI (T9), deploy+UAT (T10). Loại trừ v1 (thumbnail/publish/calendar/ads) không có task — đúng phạm vi.
- **Placeholder:** Task 9 Step 2 mô tả component ~150 dòng theo mẫu panel có sẵn thay vì in full — đây là UI lặp mẫu hiện có; người thực thi copy pattern panel Zalo/Website. Các task khác có code đầy đủ.
- **Type nhất quán:** `ContentPost`, `LlmClient`, `runGeneration(GenerationInput,GenerationDeps)`, `PostType`, `checkContentGate` — khớp giữa các task.
