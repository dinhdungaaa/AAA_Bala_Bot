# Nâng cấp trợ lý bán hàng 2 tầng + Lead capture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot hiểu ý định khách mỗi tin nhắn (tầng HIỂU), dẫn dắt hội thoại theo mục tiêu chủ shop chọn (tầng NÓI goal-driven), và tự bắt lead (SĐT) → lưu Supabase + báo Telegram + tab dashboard.

**Architecture:** Thêm `rag/understand.ts` — 1 call Gemini nhanh trả JSON {intent, searchQuery, buyingSignal, contact, interest}, THAY THẾ `condenseFollowUpQuery`. `rag/synthesis.ts` nhận thêm intent/goal/goalState để prompt dẫn dắt đúng thời điểm với giọng VN tự nhiên. `server.ts::generateRAGAnswer` nối 2 tầng + capture lead fire-and-forget.

**Tech Stack:** Node/Express + TypeScript, Gemini (`@google/genai`, model `GEN_MODEL` = gemini-2.5-flash), Supabase, React 19 (src/App.tsx), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-07-sales-assistant-upgrade-design.md`

## Global Constraints

- Mọi copy hướng người dùng bằng tiếng Việt.
- **Fail-open bắt buộc:** `understand()` lỗi/timeout/JSON hỏng → trả `defaultUnderstanding(query)` (intent `"khac"`, searchQuery = câu gốc, buyingSignal `"lanh"`, contact null). KHÔNG BAO GIỜ throw ra ngoài.
- Config call understand: `temperature: 0`, `maxOutputTokens: 256`, `responseMimeType: "application/json"`, `thinkingConfig: { thinkingBudget: 0 }`, timeout tổng 3000ms (Promise.race).
- Regex SĐT VN gác cổng: `^(0|\+?84)(3|5|7|8|9)\d{8}$` sau khi bỏ `[\s.\-()]`.
- `conversationGoal` enum: `"lead" | "order" | "consult"`; bot chưa set → suy từ `answerStyle`: `"reference"` → `"consult"`, còn lại → `"lead"`.
- Intent enum: `"hoi_gia" | "hoi_san_pham" | "tin_hieu_mua" | "cung_cap_lien_he" | "phan_nan" | "chit_chat" | "khac"`. BuyingSignal enum: `"nong" | "am" | "lanh"`.
- Route lead PHẢI nằm dưới `/api/bots/:botId/...` để khớp regex scoping Supabase per-bot ở server.ts (~line 159).
- Chế độ `fast` (bridge sync cũ): BỎ QUA tầng hiểu (dùng default) — giữ hành vi cũ.
- Migration SQL chạy TAY trên Supabase (pattern như `botcakeAsync.sql`) — code phải chạy được bằng RAM khi chưa migrate (log warn, không crash).
- Không tự deploy frontend trừ khi task ghi rõ; backend deploy qua `git push origin main` (Railway auto).

---

## File Structure

| File | Vai trò |
|---|---|
| `rag/understand.ts` (mới) | Tầng HIỂU: build prompt, parse JSON an toàn, validate SĐT VN, hàm `understand()` |
| `rag/__tests__/understand.test.ts` (mới) | Unit test tầng hiểu |
| `rag/synthesis.ts` (sửa) | Tầng NÓI: goal rules, intent guidance, few-shots, giọng VN |
| `rag/__tests__/synthesis-goal.test.ts` (mới) | Unit test prompt goal-driven |
| `src/types.ts` (sửa) | `Lead` interface + 2 field mới trên `BotConfig` |
| `leads.sql` (mới) | Migration bảng leads + 2 cột bots |
| `supabaseService.ts` (sửa) | `dbGetLeads` / `dbSaveLead` / `dbUpdateLead` |
| `server.ts` (sửa) | Nối understand vào `generateRAGAnswer`, goalState, `captureLeadIfAny`, notify Telegram, handler `/id`, 3 routes |
| `src/App.tsx` (sửa) | Tab "Khách tiềm năng" + card "Trợ lý bán hàng" |
| `docs/eval/sales-conversations.md` (mới) | 20 kịch bản nghiệm thu hành vi |

---

### Task 1: Tầng HIỂU — `rag/understand.ts`

**Files:**
- Create: `rag/understand.ts`
- Test: `rag/__tests__/understand.test.ts`

**Interfaces:**
- Consumes: `GEN_MODEL` từ `rag/constants.ts`, `withRetry` từ `rag/embeddings.ts`, type `HistoryTurn` từ `rag/retriever.ts`.
- Produces (Task 2/3 dùng đúng các tên này):
  - `type Intent = "hoi_gia" | "hoi_san_pham" | "tin_hieu_mua" | "cung_cap_lien_he" | "phan_nan" | "chit_chat" | "khac"`
  - `type BuyingSignal = "nong" | "am" | "lanh"`
  - `type Understanding = { intent: Intent; searchQuery: string; buyingSignal: BuyingSignal; contact: { phone?: string; name?: string; address?: string } | null; interest: string | null }`
  - `defaultUnderstanding(query: string): Understanding`
  - `parseUnderstandOutput(raw: string, query: string): Understanding`
  - `isValidVNPhone(s: string): boolean` · `normalizeVNPhone(s: string): string`
  - `understand(ai: GoogleGenAI, query: string, history: HistoryTurn[]): Promise<Understanding>`

- [ ] **Step 1: Viết test fail trước**

Tạo `rag/__tests__/understand.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  parseUnderstandOutput, defaultUnderstanding,
  isValidVNPhone, normalizeVNPhone, buildUnderstandPrompt,
} from "../understand.js";

describe("parseUnderstandOutput", () => {
  const q = "giá bao nhiêu";

  it("JSON chuẩn → parse đủ field", () => {
    const raw = JSON.stringify({
      intent: "hoi_gia", searchQuery: "giá khóa học bao nhiêu",
      buyingSignal: "am", contact: { phone: "0912345678" }, interest: "khóa học",
    });
    const u = parseUnderstandOutput(raw, q);
    expect(u.intent).toBe("hoi_gia");
    expect(u.searchQuery).toBe("giá khóa học bao nhiêu");
    expect(u.buyingSignal).toBe("am");
    expect(u.contact?.phone).toBe("0912345678");
    expect(u.interest).toBe("khóa học");
  });

  it("có ```json fence → vẫn parse được", () => {
    const raw = '```json\n{"intent":"chit_chat","searchQuery":"chào","buyingSignal":"lanh","contact":null,"interest":null}\n```';
    expect(parseUnderstandOutput(raw, q).intent).toBe("chit_chat");
  });

  it("enum sai → về giá trị mặc định, KHÔNG throw", () => {
    const raw = '{"intent":"mua_ngay_lap_tuc","searchQuery":"x","buyingSignal":"sôi sục","contact":null,"interest":null}';
    const u = parseUnderstandOutput(raw, q);
    expect(u.intent).toBe("khac");
    expect(u.buyingSignal).toBe("lanh");
  });

  it("searchQuery rỗng/quá dài → dùng câu gốc", () => {
    expect(parseUnderstandOutput('{"intent":"khac","searchQuery":"","buyingSignal":"lanh"}', q).searchQuery).toBe(q);
    const longQ = '{"intent":"khac","searchQuery":"' + "x".repeat(300) + '","buyingSignal":"lanh"}';
    expect(parseUnderstandOutput(longQ, q).searchQuery).toBe(q);
  });

  it("rác không phải JSON → default, KHÔNG throw", () => {
    const u = parseUnderstandOutput("xin lỗi tôi không thể", q);
    expect(u).toEqual(defaultUnderstanding(q));
  });

  it("contact không phải object → null", () => {
    const u = parseUnderstandOutput('{"intent":"khac","searchQuery":"x","buyingSignal":"lanh","contact":"0912345678"}', q);
    expect(u.contact).toBeNull();
  });
});

describe("isValidVNPhone", () => {
  it("hợp lệ: 0 đầu, +84, 84, có chấm/cách/gạch", () => {
    expect(isValidVNPhone("0912345678")).toBe(true);
    expect(isValidVNPhone("+84912345678")).toBe(true);
    expect(isValidVNPhone("84912345678")).toBe(true);
    expect(isValidVNPhone("091 234 5678")).toBe(true);
    expect(isValidVNPhone("091.234.5678")).toBe(true);
  });
  it("không hợp lệ: thiếu số, đầu số sai, chữ", () => {
    expect(isValidVNPhone("091234567")).toBe(false);   // 9 số
    expect(isValidVNPhone("0112345678")).toBe(false);  // đầu 1
    expect(isValidVNPhone("abc0912345678")).toBe(false);
    expect(isValidVNPhone("")).toBe(false);
  });
});

describe("normalizeVNPhone", () => {
  it("+84/84 → 0, bỏ ngăn cách", () => {
    expect(normalizeVNPhone("+84 912 345 678")).toBe("0912345678");
    expect(normalizeVNPhone("84912345678")).toBe("0912345678");
    expect(normalizeVNPhone("091.234.5678")).toBe("0912345678");
  });
});

describe("buildUnderstandPrompt", () => {
  it("chứa hội thoại + tin cuối + schema JSON", () => {
    const p = buildUnderstandPrompt("có giá không em", [
      { role: "user", text: "khóa học AI thế nào" },
      { role: "bot", text: "Dạ khóa học AI gồm 10 buổi ạ" },
    ]);
    expect(p.systemInstruction).toContain("intent");
    expect(p.systemInstruction).toContain("searchQuery");
    expect(p.contents).toContain("khóa học AI");
    expect(p.contents).toContain("có giá không em");
  });
  it("history rỗng vẫn chạy", () => {
    const p = buildUnderstandPrompt("giá sao", []);
    expect(p.contents).toContain("giá sao");
  });
});
```

- [ ] **Step 2: Chạy test xác nhận FAIL**

Run: `npx vitest run rag/__tests__/understand.test.ts`
Expected: FAIL — `Cannot find module '../understand.js'`

- [ ] **Step 3: Viết `rag/understand.ts`**

```ts
import type { GoogleGenAI } from "@google/genai";
import { GEN_MODEL } from "./constants.js";
import { withRetry } from "./embeddings.js";
import type { HistoryTurn } from "./retriever.js";

// Tầng HIỂU: 1 call Gemini nhanh phân tích tin nhắn khách → JSON có cấu trúc.
// THAY THẾ condenseFollowUpQuery (gộp viết-lại-câu-tìm-kiếm vào đây) và bổ sung
// intent + tín hiệu mua + phát hiện liên hệ. Fail-open tuyệt đối: mọi lỗi → default.

export type Intent =
  | "hoi_gia" | "hoi_san_pham" | "tin_hieu_mua" | "cung_cap_lien_he"
  | "phan_nan" | "chit_chat" | "khac";
export type BuyingSignal = "nong" | "am" | "lanh";

export type Understanding = {
  intent: Intent;
  searchQuery: string;
  buyingSignal: BuyingSignal;
  contact: { phone?: string; name?: string; address?: string } | null;
  interest: string | null;
};

const INTENTS: Intent[] = ["hoi_gia", "hoi_san_pham", "tin_hieu_mua", "cung_cap_lien_he", "phan_nan", "chit_chat", "khac"];
const SIGNALS: BuyingSignal[] = ["nong", "am", "lanh"];

export function defaultUnderstanding(query: string): Understanding {
  return { intent: "khac", searchQuery: (query || "").trim(), buyingSignal: "lanh", contact: null, interest: null };
}

// SĐT VN: 0/84/+84 + đầu số 3|5|7|8|9 + 8 số. LLM chỉ TÌM, regex GÁC CỔNG.
export function isValidVNPhone(s: string): boolean {
  const digits = (s || "").replace(/[\s.\-()]/g, "");
  return /^(0|\+?84)(3|5|7|8|9)\d{8}$/.test(digits);
}

export function normalizeVNPhone(s: string): string {
  const digits = (s || "").replace(/[\s.\-()]/g, "");
  return digits.replace(/^\+?84/, "0");
}

export function buildUnderstandPrompt(
  query: string,
  history: HistoryTurn[]
): { systemInstruction: string; contents: string } {
  const turns = (history || []).filter(t => (t.text || "").trim()).slice(-6);
  const convo = turns.length
    ? turns.map(t => `${t.role === "user" ? "Khách" : "Bot"}: ${t.text.trim()}`).join("\n")
    : "(chưa có)";
  const systemInstruction = [
    "Bạn là bộ PHÂN TÍCH tin nhắn khách cho chatbot bán hàng tiếng Việt.",
    'Chỉ in ra MỘT object JSON, không giải thích, không markdown. Schema:',
    '{"intent": "...", "searchQuery": "...", "buyingSignal": "...", "contact": {"phone": "...", "name": "...", "address": "..."} | null, "interest": "..." | null}',
    "- intent (ý định của TIN NHẮN CUỐI):",
    '  hoi_gia = hỏi giá/chi phí/bảng giá, kể cả gõ tắt ("ib gia", "gia nhieu", "bn tien").',
    "  hoi_san_pham = hỏi tính năng/thông tin/so sánh sản phẩm dịch vụ.",
    '  tin_hieu_mua = muốn mua/đặt/chốt ("lấy cho mình 2 cái", "đặt thế nào", "ship về HN được không").',
    "  cung_cap_lien_he = tin nhắn chứa SĐT/tên/địa chỉ mà khách chủ động gửi để được liên hệ.",
    "  phan_nan = bực bội, chê, khiếu nại, đòi hoàn tiền.",
    "  chit_chat = chào hỏi/xã giao không liên quan sản phẩm.",
    "  khac = còn lại.",
    "- searchQuery: viết lại TIN NHẮN CUỐI thành MỘT câu tìm kiếm tài liệu độc lập, đầy đủ chủ đề/danh từ" +
      " (suy từ hội thoại, kể cả câu Bot). Câu đã rõ nghĩa thì giữ gần nguyên. KHÔNG thêm thông tin mới.",
    "- buyingSignal: nong = đòi mua/chốt ngay; am = quan tâm rõ (hỏi sâu về giá/cách mua/ship); lanh = mới tìm hiểu/xã giao.",
    "- contact: CHỈ điền khi TIN NHẮN CUỐI thực sự chứa SĐT/tên/địa chỉ khách cung cấp. Không có → null. TUYỆT ĐỐI KHÔNG bịa.",
    "- interest: món/dịch vụ khách đang quan tâm, tối đa 10 từ, suy từ hội thoại; không rõ → null.",
  ].join("\n");
  const contents = `HỘI THOẠI (cũ → mới):\n${convo}\n\nTIN NHẮN CUỐI CỦA KHÁCH: ${(query || "").trim()}\n\nJSON:`;
  return { systemInstruction, contents };
}

export function parseUnderstandOutput(raw: string, query: string): Understanding {
  const fallback = defaultUnderstanding(query);
  if (!raw || !raw.trim()) return fallback;
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return fallback;
  let obj: any;
  try { obj = JSON.parse(text.slice(start, end + 1)); } catch { return fallback; }
  if (!obj || typeof obj !== "object") return fallback;

  const intent: Intent = INTENTS.includes(obj.intent) ? obj.intent : "khac";
  const buyingSignal: BuyingSignal = SIGNALS.includes(obj.buyingSignal) ? obj.buyingSignal : "lanh";
  const sq = typeof obj.searchQuery === "string" ? obj.searchQuery.trim() : "";
  const searchQuery = sq && sq.length <= 200 ? sq : fallback.searchQuery;

  let contact: Understanding["contact"] = null;
  if (obj.contact && typeof obj.contact === "object" && !Array.isArray(obj.contact)) {
    const phone = typeof obj.contact.phone === "string" ? obj.contact.phone.trim() : undefined;
    const name = typeof obj.contact.name === "string" ? obj.contact.name.trim() : undefined;
    const address = typeof obj.contact.address === "string" ? obj.contact.address.trim() : undefined;
    if (phone || name || address) contact = { phone, name, address };
  }
  const interest = typeof obj.interest === "string" && obj.interest.trim() ? obj.interest.trim().slice(0, 120) : null;
  return { intent, searchQuery, buyingSignal, contact, interest };
}

// Gọi LLM với timeout cứng 3s. Mọi lỗi (mạng/timeout/JSON hỏng) → default (fail-open).
export async function understand(
  ai: GoogleGenAI,
  query: string,
  history: HistoryTurn[]
): Promise<Understanding> {
  try {
    const { systemInstruction, contents } = buildUnderstandPrompt(query, history);
    const call = withRetry(() => ai.models.generateContent({
      model: GEN_MODEL,
      contents,
      config: {
        systemInstruction, temperature: 0, maxOutputTokens: 256,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
      },
    } as any), 2);
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("understand timeout")), 3000));
    const res: any = await Promise.race([call, timeout]);
    return parseUnderstandOutput(res?.text || "", query);
  } catch (err: any) {
    console.warn("[Understand] fail-open:", err?.message || err);
    return defaultUnderstanding(query);
  }
}
```

- [ ] **Step 4: Chạy test xác nhận PASS**

Run: `npx vitest run rag/__tests__/understand.test.ts`
Expected: PASS toàn bộ. Rồi `npx tsc --noEmit -p .` — sạch.

- [ ] **Step 5: Commit**

```bash
git add rag/understand.ts rag/__tests__/understand.test.ts
git commit -m "feat(rag): tầng HIỂU — intent + rewrite + phát hiện liên hệ (fail-open)"
```

---

### Task 2: Tầng NÓI — prompt goal-driven trong `rag/synthesis.ts`

**Files:**
- Modify: `rag/synthesis.ts`
- Test: `rag/__tests__/synthesis-goal.test.ts` (mới)

**Interfaces:**
- Consumes: type `Intent`, `BuyingSignal` từ `rag/understand.ts` (import type).
- Produces (Task 3 dùng đúng tên):
  - `type ConversationGoal = "lead" | "order" | "consult"`
  - `type GoalState = { isFirstTurn: boolean; hasContact: boolean; askedRecently: boolean }`
  - `SynthesisOpts` thêm 4 field TÙY CHỌN: `intent?: Intent; buyingSignal?: BuyingSignal; goal?: ConversationGoal; goalState?: GoalState`
  - `buildGroundedPrompt` giữ nguyên chữ ký `(bot, passages, opts)`.

**Hành vi:** `goal === "consult"` (hoặc `answerStyle === "reference"`) → giữ nhánh reference cũ nguyên vẹn. `goal` `"lead"`/`"order"` → thay khối sales cũ bằng: giọng VN + quy tắc thời điểm + hướng dẫn intent + khối mục tiêu + few-shots.

- [ ] **Step 1: Viết test fail trước**

Tạo `rag/__tests__/synthesis-goal.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildGroundedPrompt } from "../synthesis.js";
import type { BotConfig } from "../../src/types.js";

const bot = { name: "Shop Test", field: "mỹ phẩm" } as BotConfig;
const passages = [{ chunk: { title: "Bảng giá", content: "Son A giá 200k" } }];
const base = { answerStyle: "sales" as const };

describe("buildGroundedPrompt — goal-driven", () => {
  it("goal lead + buyingSignal am → có khối mục tiêu mời liên hệ", () => {
    const p = buildGroundedPrompt(bot, passages, {
      ...base, goal: "lead", intent: "hoi_gia", buyingSignal: "am",
      goalState: { isFirstTurn: false, hasContact: false, askedRecently: false },
    });
    expect(p).toContain("MỤC TIÊU");
    expect(p).toMatch(/liên hệ|số điện thoại/i);
  });

  it("goalState.hasContact=true → cấm xin lại liên hệ", () => {
    const p = buildGroundedPrompt(bot, passages, {
      ...base, goal: "lead", intent: "hoi_san_pham", buyingSignal: "am",
      goalState: { isFirstTurn: false, hasContact: true, askedRecently: false },
    });
    expect(p).toMatch(/KHÔNG.*(xin|hỏi).*(lại|thêm).*(liên hệ|số)/i);
  });

  it("askedRecently=true hoặc isFirstTurn=true → cấm mời lượt này", () => {
    for (const gs of [
      { isFirstTurn: true, hasContact: false, askedRecently: false },
      { isFirstTurn: false, hasContact: false, askedRecently: true },
    ]) {
      const p = buildGroundedPrompt(bot, passages, { ...base, goal: "lead", intent: "khac", buyingSignal: "lanh", goalState: gs });
      expect(p).toMatch(/KHÔNG (mời|xin)/i);
    }
  });

  it("goal order + tin_hieu_mua → hướng dẫn chốt từng bước", () => {
    const p = buildGroundedPrompt(bot, passages, {
      ...base, goal: "order", intent: "tin_hieu_mua", buyingSignal: "nong",
      goalState: { isFirstTurn: false, hasContact: false, askedRecently: false },
    });
    expect(p).toMatch(/số lượng/i);
    expect(p).toMatch(/địa chỉ/i);
  });

  it("intent phan_nan → có hướng dẫn xoa dịu", () => {
    const p = buildGroundedPrompt(bot, passages, {
      ...base, goal: "lead", intent: "phan_nan", buyingSignal: "lanh",
      goalState: { isFirstTurn: false, hasContact: false, askedRecently: false },
    });
    expect(p).toMatch(/xoa dịu|nhận lỗi/i);
  });

  it("goal consult → đi nhánh reference cũ, không có khối MỤC TIÊU", () => {
    const p = buildGroundedPrompt(bot, passages, {
      answerStyle: "reference", allowProductIntro: false, goal: "consult",
      intent: "hoi_gia", buyingSignal: "am",
      goalState: { isFirstTurn: false, hasContact: false, askedRecently: false },
    });
    expect(p).not.toContain("MỤC TIÊU");
    expect(p).toContain("KHÔNG bán hàng");
  });

  it("không truyền intent/goal (tương thích cũ) → vẫn build được prompt sales", () => {
    const p = buildGroundedPrompt(bot, passages, base);
    expect(p).toContain("Shop Test");
    expect(p).toContain("TÀI LIỆU");
  });

  it("có few-shot ví dụ giọng", () => {
    const p = buildGroundedPrompt(bot, passages, {
      ...base, goal: "lead", intent: "hoi_gia", buyingSignal: "am",
      goalState: { isFirstTurn: false, hasContact: false, askedRecently: false },
    });
    expect(p).toContain("VÍ DỤ");
  });
});
```

- [ ] **Step 2: Chạy test xác nhận FAIL**

Run: `npx vitest run rag/__tests__/synthesis-goal.test.ts`
Expected: FAIL (prompt chưa có khối MỤC TIÊU/VÍ DỤ).

- [ ] **Step 3: Sửa `rag/synthesis.ts`**

3a. Thêm import + types (đầu file, sau các import sẵn có):

```ts
import type { Intent, BuyingSignal } from "./understand.js";

export type ConversationGoal = "lead" | "order" | "consult";
export type GoalState = { isFirstTurn: boolean; hasContact: boolean; askedRecently: boolean };
```

3b. Mở rộng `SynthesisOpts` (thêm vào cuối type hiện có):

```ts
  // Tầng HIỂU + mục tiêu hội thoại (goal-driven). Không truyền → hành vi sales cũ.
  intent?: Intent;
  buyingSignal?: BuyingSignal;
  goal?: ConversationGoal;
  goalState?: GoalState;
```

3c. Thêm các khối mới (sau `buildStyleRule`, trước `buildCustomerLine`):

```ts
// Hướng dẫn hành xử theo intent — bảng cố định, không để LLM tự đoán.
const INTENT_GUIDANCE: Record<string, string> = {
  hoi_gia: "Khách hỏi GIÁ: nếu tài liệu có giá, nói giá NGAY Ở CÂU ĐẦU, sau đó mới thêm giá trị/gợi ý.",
  hoi_san_pham: "Khách tìm hiểu sản phẩm: trả lời đúng trọng tâm, nêu 1-2 điểm mạnh liên quan nhất, không kể lể.",
  tin_hieu_mua: "Khách CÓ TÍN HIỆU MUA: không tư vấn lan man — xác nhận nhu cầu và tiến ngay tới bước tiếp theo của MỤC TIÊU.",
  cung_cap_lien_he: "Khách vừa GỬI THÔNG TIN LIÊN HỆ: cảm ơn, xác nhận đã ghi nhận, nói rõ bước tiếp theo (bên em sẽ liên hệ lại...). KHÔNG hỏi xin lại thông tin.",
  phan_nan: "Khách PHÀN NÀN: câu đầu tiên phải nhận lỗi/xoa dịu chân thành, rồi mới xử lý nội dung. TUYỆT ĐỐI không chào bán gì ở lượt này.",
  chit_chat: "Khách chỉ xã giao: đáp ngắn thân thiện, có thể gợi mở nhẹ về sản phẩm, không ép.",
  khac: "",
};

// Quy tắc dẫn dắt theo mục tiêu + trạng thái — phần "đúng thời điểm" chống spam.
function buildGoalRule(goal: ConversationGoal, state: GoalState, buyingSignal: BuyingSignal): string {
  if (state.hasContact) {
    return (
      "MỤC TIÊU: khách ĐÃ để lại thông tin liên hệ. TUYỆT ĐỐI KHÔNG xin/hỏi lại liên hệ hay số điện thoại thêm lần nào nữa — " +
      "chỉ tư vấn chu đáo và nhắc bên em sẽ liên hệ lại khi phù hợp."
    );
  }
  const holdOff = state.isFirstTurn || state.askedRecently;
  if (goal === "order") {
    return [
      "MỤC TIÊU: CHỐT ĐƠN ngay trong chat. Khi khách có tín hiệu mua: chốt TỪNG BƯỚC —",
      "(1) xác nhận món + số lượng; (2) xin tên + số điện thoại + địa chỉ giao; (3) tóm tắt đơn để khách xác nhận.",
      "Mỗi tin nhắn chỉ hỏi 1-2 thứ, KHÔNG dồn hết một lượt.",
      holdOff
        ? "Lượt này KHÔNG mời chốt/xin thông tin (mới vào chuyện hoặc vừa mời xong) — chỉ tư vấn cho tốt đã."
        : buyingSignal === "lanh"
          ? "Khách còn lạnh: tư vấn tạo giá trị trước, chưa vội chốt."
          : "Khách đang quan tâm: chủ động dẫn sang bước chốt một cách tự nhiên.",
    ].join("\n");
  }
  // goal === "lead"
  return [
    "MỤC TIÊU: lấy được THÔNG TIN LIÊN HỆ (số điện thoại) để nhân viên gọi tư vấn kỹ hơn.",
    holdOff
      ? "Lượt này KHÔNG mời để lại liên hệ (mới vào chuyện hoặc vừa mời gần đây) — tập trung tư vấn cho tốt."
      : buyingSignal !== "lanh"
        ? "Khách đang quan tâm rõ: sau khi trả lời, mời khách để lại số điện thoại kèm LÝ DO tự nhiên (vd: 'để bên em gọi tư vấn kỹ và báo ưu đãi cho mình nhé')."
        : "Khách còn lạnh: tư vấn tạo giá trị trước; CHỈ mời để lại liên hệ nếu tài liệu không đủ trả lời câu hỏi.",
    "Khách từ chối cho số → tôn trọng, tiếp tục tư vấn vui vẻ, KHÔNG nài thêm.",
  ].join("\n");
}

// Few-shot dạy GIỌNG (không phải nội dung) — nhân viên tư vấn VN thật.
const FEW_SHOTS = [
  "VÍ DỤ VỀ GIỌNG TRẢ LỜI CHUẨN (chỉ học cách nói, KHÔNG copy nội dung/giá vào câu trả lời thật):",
  'Khách: "son này bn tiền v" → "Dạ son A bên em 200k ạ 💄 Màu này đang bán chạy lắm, mình định lấy tone đỏ hay cam đất để em tư vấn kỹ hơn ạ?"',
  'Khách: "lấy cho mình 2 hộp" → "Dạ em chốt 2 hộp cho mình nha! Mình cho em xin tên + số điện thoại + địa chỉ nhận hàng để em lên đơn luôn ạ."',
  'Khách: "hàng gì mà giao chậm thế" → "Dạ em xin lỗi mình vì để mình đợi lâu ạ 🙏 Mình cho em xin mã đơn để em kiểm tra ngay giúp mình nhé."',
  'Khách hỏi điều tài liệu không có → "Dạ phần này em chưa có thông tin chính xác để trả lời mình ạ. Mình để lại số điện thoại để bạn tư vấn viên gọi giải đáp kỹ giúp mình nha?"',
].join("\n");
```

3d. Trong `buildGroundedPrompt`, thay logic chọn style. Nhánh reference/consult giữ NGUYÊN. Với goal lead/order, dựng khối mới. Thay dòng `buildStyleRule(opts.answerStyle, opts.allowProductIntro),` trong mảng return bằng đoạn tính trước đó:

```ts
  const goal: ConversationGoal =
    opts.goal || (opts.answerStyle === "reference" ? "consult" : "lead");
  const useGoalMode = goal !== "consult" && opts.answerStyle !== "reference";

  // 2 câu mở đầu gần nhất của bot — để LLM tránh lặp mẫu câu.
  const recentOpeners = (opts.history || [])
    .filter(t => t.role === "bot").slice(-2)
    .map(t => t.text.split(/[.!?\n]/)[0].trim()).filter(Boolean);

  const styleBlock = useGoalMode
    ? [
        "Giọng như nhân viên tư vấn bán hàng người Việt THẬT: câu ngắn, tách dòng thoáng, tối đa 4-5 câu " +
          "(trừ khi khách hỏi chi tiết), tối đa 1 emoji khi thật phù hợp. Vẫn tuyệt đối bám tài liệu.",
        ...(recentOpeners.length
          ? [`KHÔNG mở đầu giống các lượt trước (gần đây bạn đã mở đầu: ${recentOpeners.map(o => `"${o}"`).join(", ")}). Đổi cách vào câu.`]
          : []),
        ...(opts.intent && INTENT_GUIDANCE[opts.intent] ? [INTENT_GUIDANCE[opts.intent]] : []),
        buildGoalRule(goal, opts.goalState || { isFirstTurn: true, hasContact: false, askedRecently: false }, opts.buyingSignal || "lanh"),
        "",
        FEW_SHOTS,
      ].join("\n")
    : buildStyleRule(opts.answerStyle, opts.allowProductIntro);
```

và trong mảng return dùng `styleBlock` thay cho lời gọi `buildStyleRule(...)` cũ.

- [ ] **Step 4: Chạy test PASS + không vỡ test cũ**

Run: `npx vitest run rag/__tests__/ && npx tsc --noEmit -p .`
Expected: PASS toàn bộ (test synthesis cũ nếu có vẫn xanh — nhánh reference và default không đổi).

- [ ] **Step 5: Commit**

```bash
git add rag/synthesis.ts rag/__tests__/synthesis-goal.test.ts
git commit -m "feat(rag): prompt goal-driven — dẫn dắt đúng thời điểm + giọng VN + few-shot"
```

---

### Task 3: Nối tầng HIỂU vào `generateRAGAnswer` (server.ts)

**Files:**
- Modify: `server.ts` (hàm `generateRAGAnswer`, ~line 3856-3936)

**Interfaces:**
- Consumes: `understand`, `defaultUnderstanding`, type `Understanding` (Task 1); `ConversationGoal`, `GoalState` (Task 2). `bot.conversationGoal` chưa có trên BotConfig — Task 4 thêm; tạm cast `(bot as any).conversationGoal` ở task này và Task 4 gỡ cast.
- Produces: `generateRAGAnswer` trả về thêm field `understanding` trong kết quả nội bộ KHÔNG cần — thay vào đó Task 4 sẽ gọi capture bên trong hàm này; task này chỉ cần khai báo biến `und` ở scope hàm.

- [ ] **Step 1: Thêm import**

Trong `server.ts`, cạnh import từ `./rag/retriever.js` hiện có:

```ts
import { understand, defaultUnderstanding } from "./rag/understand.js";
import type { ConversationGoal, GoalState } from "./rag/synthesis.js";
```

(giữ import `buildEmbedQuery`/`isShortFollowUp` — vẫn là fallback; XÓA import `condenseFollowUpQuery` nếu không còn nơi khác dùng.)

- [ ] **Step 2: Thay khối rewrite bằng tầng HIỂU**

Trong `generateRAGAnswer`, NGAY SAU khối `detectOffTopicChitChat` (để chit-chat rẻ tiền vẫn short-circuit như cũ) và SAU khi có `ai`, thêm:

```ts
  // Tầng HIỂU: 1 call nhanh — intent + câu tìm kiếm + tín hiệu mua + liên hệ.
  // fast (bridge sync cũ) hoặc không có AI → default (fail-open, hành vi cũ).
  let und = defaultUnderstanding(query);
  if (ai && !fast) {
    und = await understand(ai, query, history);
  }
```

Sau đó trong khối retrieval, THAY:

```ts
    let searchText = buildEmbedQuery(query, lastUserText);
    if (!fast && isShortFollowUp(query) && history.length > 0) {
      searchText = await condenseFollowUpQuery(ai, query, history);
    }
```

BẰNG:

```ts
    // searchQuery từ tầng hiểu (đã viết lại đầy đủ chủ đề); default = câu gốc,
    // nên vẫn ghép ngữ cảnh kiểu cũ khi tầng hiểu fail-open.
    let searchText = und.searchQuery && und.searchQuery !== query.trim()
      ? und.searchQuery
      : buildEmbedQuery(query, lastUserText);
```

- [ ] **Step 3: Tính goal + goalState và truyền vào synthCtx**

Thay dòng `const synthCtx = { customer: customerCtx, history, allowProductIntro, expand, fast };` bằng:

```ts
  const goal: ConversationGoal =
    ((bot as any).conversationGoal as ConversationGoal) ||
    (answerStyle === "reference" ? "consult" : "lead");
  // Bot đã mời để lại liên hệ trong 3 lượt bot gần nhất chưa (chống spam nhịp mời).
  const ASK_CONTACT_RE = /(số điện thoại|sđt|sdt|hotline|để lại (số|thông tin|liên hệ)|xin (số|liên hệ))/i;
  const goalState: GoalState = {
    isFirstTurn: isFirstInteraction,
    hasContact: hasLeadForSession(bot.id, userInfo?.id),
    askedRecently: history.filter(t => t.role === "bot").slice(-3).some(t => ASK_CONTACT_RE.test(t.text)),
  };
  const synthCtx = {
    customer: customerCtx, history, allowProductIntro, expand, fast,
    intent: und.intent, buyingSignal: und.buyingSignal, goal, goalState,
  };
```

Lưu ý: `answerStyle` được tính ở dưới trong hàm hiện tại (dòng ~3911) — DI CHUYỂN dòng `const answerStyle = ...` LÊN TRƯỚC khối này. Thêm stub tạm để compile (Task 4 thay bằng bản thật):

```ts
// Task 4 thay bằng tra cứu leads thật. Stub để nối tầng trước.
function hasLeadForSession(_botId: string, _userKey?: string): boolean { return false; }
```

Đặt stub NGAY TRƯỚC `generateRAGAnswer`. Kiểm tra các call site `synthesizeAnswer(` trong `generateRAGAnswer` (cả nhánh thường + nhánh expand nếu có) — chúng spread `synthCtx`/truyền opts: đảm bảo object cuối cùng tới `synthesizeAnswer` chứa `intent/buyingSignal/goal/goalState` (nếu call site tự dựng object mới thì thêm 4 field từ `synthCtx`).

- [ ] **Step 4: Kiểm tra**

Run: `npx tsc --noEmit -p . && npx vitest run`
Expected: sạch + toàn bộ test xanh. `condenseFollowUpQuery` không còn được import ở server.ts (hàm vẫn ở retriever.ts cho tương thích — không xóa file).

Smoke thủ công: `npm run dev` (hoặc lệnh dev sẵn có) → Playground hỏi 2 câu: "khóa học AI giá bao nhiêu" rồi "còn ưu đãi không" → bot trả lời bình thường, không lỗi console.

- [ ] **Step 5: Commit**

```bash
git add server.ts
git commit -m "feat(server): nối tầng HIỂU vào generateRAGAnswer — intent/goal-driven, fail-open"
```

---

### Task 4: Lead storage + capture + Telegram notify + routes

**Files:**
- Modify: `src/types.ts` (thêm `Lead`, 2 field BotConfig)
- Create: `leads.sql`
- Modify: `supabaseService.ts` (3 hàm db)
- Modify: `server.ts` (leadsMem, `hasLeadForSession` thật, `captureLeadIfAny`, notify, `/id` handler, 3 routes)
- Test: `__tests__/leads.test.ts` (mới — pure helpers)

**Interfaces:**
- Consumes: `isValidVNPhone`, `normalizeVNPhone`, type `Understanding` (Task 1); `sendTelegramReminder(botToken, chatId, text)` sẵn có (server.ts ~4347); pattern `dbGetBots/dbUpdateBot/dbSaveConversation` (supabaseService.ts).
- Produces (Task 5 gọi):
  - `GET /api/bots/:botId/leads` → `{ leads: Lead[] }` (mới nhất trước)
  - `PATCH /api/bots/:botId/leads/:leadId` body `{ status }` → `{ success: true }`
  - `POST /api/bots/:botId/assistant-config` body `{ conversationGoal, notifyTelegramChatId }` → `{ success: true }`
  - `Lead` type trong `src/types.ts`.

- [ ] **Step 1: Types + migration**

`src/types.ts` — thêm vào `BotConfig` (cạnh `answerStyle`):

```ts
  // Trợ lý bán hàng: mục tiêu hội thoại + chat id Telegram nhận thông báo lead.
  conversationGoal?: 'lead' | 'order' | 'consult';
  notifyTelegramChatId?: string;
```

và interface mới (cuối file, cạnh các interface khác):

```ts
export interface Lead {
  id: string;
  botId: string;
  sessionId?: string;      // userKey kênh (vd "botcake:<psid>") — dùng tra hasContact
  name?: string;
  phone: string;           // đã normalize về dạng 0xxxxxxxxx
  address?: string;
  interest?: string;
  buyingSignal?: string;
  channel?: string;        // botcake | telegram | facebook | web
  status: 'new' | 'contacted' | 'won' | 'lost';
  createdAt: string;
}
```

Tạo `leads.sql` (root, cạnh `botcakeAsync.sql`):

```sql
-- Chạy tay trên Supabase SQL Editor (như botcakeAsync.sql).
create table if not exists leads (
  id text primary key,
  "botId" text not null,
  "sessionId" text,
  name text,
  phone text not null,
  address text,
  interest text,
  "buyingSignal" text,
  channel text,
  status text default 'new',
  "createdAt" timestamptz default now()
);
create index if not exists leads_bot_idx on leads ("botId", "createdAt" desc);
alter table bots add column if not exists "conversationGoal" text;
alter table bots add column if not exists "notifyTelegramChatId" text;
```

- [ ] **Step 2: supabaseService.ts — 3 hàm (theo pattern dbSaveConversation upsert)**

```ts
export async function dbGetLeads(botId: string, localFallback: Lead[]): Promise<Lead[]> {
  const client = getSupabaseClient();
  if (!client) return localFallback;
  try {
    const { data, error } = await client.from('leads').select('*')
      .eq('botId', botId).order('createdAt', { ascending: false });
    if (error) { console.warn("Supabase dbGetLeads error, dùng local:", error); return localFallback; }
    return (data as Lead[]) || [];
  } catch (err) { console.warn("Supabase dbGetLeads failed:", err); return localFallback; }
}

export async function dbSaveLead(lead: Lead): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('leads').upsert({ ...lead }, { onConflict: 'id' });
    if (error) throw error;
    return true;
  } catch (err) { console.warn("Supabase dbSaveLead failed (RAM vẫn giữ):", err); return false; }
}

export async function dbUpdateLead(id: string, updates: Partial<Lead>): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  try {
    const { error } = await client.from('leads').update(updates).eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) { console.warn("Supabase dbUpdateLead failed:", err); return false; }
}
```

(import `Lead` từ `./src/types.js` theo kiểu import sẵn có của file.)

- [ ] **Step 3: Test pure helper trước khi viết capture**

Tạo `__tests__/leads.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { channelFromUserKey, formatLeadNotify } from "../leadHelpers.js";

describe("channelFromUserKey", () => {
  it("prefix → kênh", () => {
    expect(channelFromUserKey("botcake:123")).toBe("botcake");
    expect(channelFromUserKey("fb:123")).toBe("fb");
    expect(channelFromUserKey("123456")).toBe("telegram");
    expect(channelFromUserKey(undefined)).toBe("web");
  });
});

describe("formatLeadNotify", () => {
  it("đủ tên/sđt/quan tâm/kênh", () => {
    const msg = formatLeadNotify({ name: "Chị Lan", phone: "0912345678", interest: "son đỏ", channel: "botcake" } as any);
    expect(msg).toContain("Chị Lan");
    expect(msg).toContain("0912345678");
    expect(msg).toContain("son đỏ");
    expect(msg).toContain("botcake");
  });
  it("thiếu field không vỡ", () => {
    const msg = formatLeadNotify({ phone: "0912345678" } as any);
    expect(msg).toContain("0912345678");
  });
});
```

Run: `npx vitest run __tests__/leads.test.ts` → FAIL (chưa có leadHelpers).

- [ ] **Step 4: Tạo `leadHelpers.ts` (root, cạnh botcakeAsync.ts)**

```ts
import type { Lead } from "./src/types.js";

// userKey các kênh: "botcake:<psid>", "fb:<psid>", Telegram = id số trần.
export function channelFromUserKey(userKey?: string): string {
  if (!userKey) return "web";
  const i = userKey.indexOf(":");
  if (i > 0) return userKey.slice(0, i);
  return "telegram";
}

export function formatLeadNotify(lead: Lead): string {
  const lines = [
    "🔥 LEAD MỚI từ bot!",
    lead.name ? `👤 Tên: ${lead.name}` : null,
    `📞 SĐT: ${lead.phone}`,
    lead.interest ? `🛍️ Quan tâm: ${lead.interest}` : null,
    lead.channel ? `📡 Kênh: ${lead.channel}` : null,
    "→ Gọi lại sớm để chốt nhé!",
  ].filter(Boolean);
  return lines.join("\n");
}
```

Run: `npx vitest run __tests__/leads.test.ts` → PASS.

- [ ] **Step 5: server.ts — storage thật + capture + notify**

5a. Import: `dbGetLeads, dbSaveLead, dbUpdateLead` (thêm vào import supabaseService sẵn có); `channelFromUserKey, formatLeadNotify` từ `./leadHelpers.js`; `isValidVNPhone, normalizeVNPhone` + type `Understanding` từ `./rag/understand.js`; `Lead` từ `./src/types.js`.

5b. Thay stub `hasLeadForSession` của Task 3 bằng bản thật + thêm leadsMem (đặt cạnh các store in-memory sẵn có như `chatSessions`):

```ts
// Leads in-memory mirror (Supabase là nguồn bền; RAM để chạy được khi chưa migrate).
const leadsMem: Lead[] = [];

function hasLeadForSession(botId: string, userKey?: string): boolean {
  return !!userKey && leadsMem.some(l => l.botId === botId && l.sessionId === userKey);
}

// Bắt lead từ kết quả tầng HIỂU. Fire-and-forget — KHÔNG chặn/không phá reply.
async function captureLeadIfAny(
  bot: BotConfig,
  und: Understanding,
  userInfo?: { fullName?: string; username?: string; id?: string }
): Promise<void> {
  try {
    const rawPhone = und.contact?.phone || "";
    if (!isValidVNPhone(rawPhone)) return;
    const phone = normalizeVNPhone(rawPhone);
    let lead = leadsMem.find(l => l.botId === bot.id && l.phone === phone);
    const isNew = !lead;
    if (lead) {
      lead.interest = und.interest || lead.interest;
      lead.sessionId = userInfo?.id || lead.sessionId;
      lead.name = und.contact?.name || lead.name;
    } else {
      lead = {
        id: "lead-" + Math.random().toString(36).substr(2, 9),
        botId: bot.id,
        sessionId: userInfo?.id,
        name: und.contact?.name || userInfo?.fullName,
        phone,
        address: und.contact?.address,
        interest: und.interest || undefined,
        buyingSignal: und.buyingSignal,
        channel: channelFromUserKey(userInfo?.id),
        status: "new",
        createdAt: new Date().toISOString(),
      };
      leadsMem.unshift(lead);
    }
    await dbSaveLead(lead);
    if (isNew && bot.notifyTelegramChatId && bot.telegramToken) {
      try {
        await sendTelegramReminder(bot.telegramToken, bot.notifyTelegramChatId, formatLeadNotify(lead));
      } catch (e: any) { console.warn("[Leads] notify Telegram lỗi (bỏ qua):", e?.message || e); }
    }
    console.log(`[Leads] ${isNew ? "MỚI" : "cập nhật"} lead ${phone} (bot ${bot.id}).`);
  } catch (err: any) {
    console.warn("[Leads] capture failed (bỏ qua):", err?.message || err);
  }
}
```

5c. Gọi capture trong `generateRAGAnswer` — NGAY SAU khối tính `und` (Task 3 Step 2):

```ts
  // Bắt lead nếu tin nhắn chứa SĐT hợp lệ — chạy nền, không chặn trả lời.
  void captureLeadIfAny(bot, und, userInfo);
```

(Gỡ cast `(bot as any).conversationGoal` của Task 3 → `bot.conversationGoal` vì BotConfig đã có field.)

5d. Handler `/id` trong webhook Telegram (`app.post("/api/telegram-webhook/:botId"...)` ~line 1845) — sau khi tìm thấy `bot`, TRƯỚC xử lý chính:

```ts
  // Lệnh /id: trả chat id để chủ shop dán vào ô "Chat ID Telegram nhận thông báo lead".
  const tgText = String(update?.message?.text || "").trim();
  if (tgText === "/id") {
    const chatId = String(update?.message?.chat?.id || "");
    if (bot.telegramToken && chatId) {
      try {
        await sendTelegramReminder(bot.telegramToken, chatId,
          `Chat ID của bạn: ${chatId}\nDán số này vào ô "Chat ID Telegram nhận thông báo lead" trong BalaBot → Cấu hình Bot AI.`);
      } catch {}
    }
    return res.status(200).send("OK");
  }
```

Lưu ý: `sendTelegramReminder` khai báo ở ~4347 (function declaration hoisted — gọi từ line 1845 vẫn được).

5e. 3 routes (đặt cạnh route `botcake-config`):

```ts
// Danh sách lead của bot — mới nhất trước.
app.get("/api/bots/:botId/leads", async (req, res) => {
  const list = await dbGetLeads(req.params.botId, leadsMem.filter(l => l.botId === req.params.botId));
  res.json({ leads: list });
});

// Đổi trạng thái lead (new|contacted|won|lost).
app.patch("/api/bots/:botId/leads/:leadId", async (req, res) => {
  const status = String(req.body?.status || "");
  if (!["new", "contacted", "won", "lost"].includes(status)) {
    return res.status(400).json({ error: "status không hợp lệ." });
  }
  const mem = leadsMem.find(l => l.id === req.params.leadId);
  if (mem) mem.status = status as Lead["status"];
  await dbUpdateLead(req.params.leadId, { status: status as Lead["status"] });
  res.json({ success: true });
});

// Lưu cấu hình trợ lý bán hàng (mục tiêu + chat id thông báo).
app.post("/api/bots/:botId/assistant-config", async (req, res) => {
  const allBots = await dbGetBots(bots);
  const bot = allBots.find(b => b.id === req.params.botId);
  if (!bot) return res.status(404).json({ error: "Không tìm thấy bot." });
  const goal = String(req.body?.conversationGoal || "");
  const chatId = String(req.body?.notifyTelegramChatId ?? "").trim();
  const updates: Partial<BotConfig> = {};
  if (["lead", "order", "consult"].includes(goal)) updates.conversationGoal = goal as BotConfig["conversationGoal"];
  updates.notifyTelegramChatId = chatId; // rỗng = tắt thông báo
  const memBot = bots.find(b => b.id === bot.id);
  if (memBot) Object.assign(memBot, updates);
  await dbUpdateBot(bot.id, updates);
  res.json({ success: true });
});
```

- [ ] **Step 6: Kiểm tra**

Run: `npx tsc --noEmit -p . && npx vitest run`
Expected: sạch, toàn bộ xanh.

Smoke local: chạy dev → `curl -s localhost:<port>/api/bots/<botId>/leads` → `{"leads":[]}`.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts leads.sql supabaseService.ts leadHelpers.ts __tests__/leads.test.ts server.ts
git commit -m "feat(leads): bắt lead từ tầng HIỂU — lưu Supabase + báo Telegram + routes"
```

---

### Task 5: Dashboard — tab "Khách tiềm năng" + card "Trợ lý bán hàng"

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: 3 routes Task 4. Pattern sẵn có trong App.tsx: `getScopedApiHeaders()`, menu button (xem block `activeTab === 'facebook'` line ~2072), fetch theo `selectedBotId`.

- [ ] **Step 1: State + fetch**

1a. Line ~78, thêm `'leads'` vào union `activeTab`.

1b. Cạnh các state khác (khu ~315):

```tsx
  const [leads, setLeads] = useState<any[]>([]);
  const [assistantGoal, setAssistantGoal] = useState<'lead' | 'order' | 'consult'>('lead');
  const [notifyChatId, setNotifyChatId] = useState('');
  const [savingAssistant, setSavingAssistant] = useState(false);
  const [copiedLeadId, setCopiedLeadId] = useState<string | null>(null);
```

1c. Fetch leads khi mở tab (cạnh các useEffect theo activeTab ~887):

```tsx
  useEffect(() => {
    if (activeTab !== 'leads' || !selectedBotId) return;
    (async () => {
      try {
        const res = await fetch(`/api/bots/${selectedBotId}/leads`, { headers: getScopedApiHeaders() });
        if (res.ok) setLeads((await res.json()).leads || []);
      } catch {}
    })();
  }, [activeTab, selectedBotId]);
```

1d. Khởi tạo form assistant từ bot đang chọn (trong chỗ selectedBot thay đổi — nơi các form config khác đang init):

```tsx
  useEffect(() => {
    const b: any = bots.find(x => x.id === selectedBotId);
    if (b) {
      setAssistantGoal(b.conversationGoal || 'lead');
      setNotifyChatId(b.notifyTelegramChatId || '');
    }
  }, [selectedBotId, bots]);
```

- [ ] **Step 2: Handlers**

```tsx
  const handleSaveAssistantConfig = async () => {
    if (!selectedBotId) return;
    setSavingAssistant(true);
    try {
      await fetch(`/api/bots/${selectedBotId}/assistant-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getScopedApiHeaders() },
        body: JSON.stringify({ conversationGoal: assistantGoal, notifyTelegramChatId: notifyChatId.trim() }),
      });
      setBots(prev => prev.map(b => b.id === selectedBotId ? { ...b, conversationGoal: assistantGoal, notifyTelegramChatId: notifyChatId.trim() } as any : b));
    } finally { setSavingAssistant(false); }
  };

  const handleLeadStatus = async (leadId: string, status: string) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status } : l));
    try {
      await fetch(`/api/bots/${selectedBotId}/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getScopedApiHeaders() },
        body: JSON.stringify({ status }),
      });
    } catch {}
  };
```

- [ ] **Step 3: Menu button** — chèn sau button `conversations`/`Lịch sử & Takeover` (cùng khối menu, copy đúng className pattern của các nút cạnh đó):

```tsx
          <button
            onClick={() => setActiveTab('leads')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all duration-150 ${activeTab === 'leads' ? 'bg-emerald-500/10 text-emerald-400 border-l-4 border-emerald-500 font-semibold' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'}`}
          >
            <span>🔥</span> Khách tiềm năng
            {leads.filter(l => l.status === 'new').length > 0 && (
              <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold bg-emerald-500 text-white rounded-full">
                {leads.filter(l => l.status === 'new').length}
              </span>
            )}
          </button>
```

- [ ] **Step 4: View tab leads** — chèn cạnh các view `activeTab === '...'` khác:

```tsx
          {activeTab === 'leads' && (
            <div className="p-6 space-y-4">
              <h1 className="text-xl font-bold text-slate-800">Khách tiềm năng</h1>
              <p className="text-sm text-slate-500">Khách để lại số điện thoại khi chat với bot — gọi lại sớm để chốt đơn.</p>
              {leads.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-400">
                  Chưa có lead nào. Khi khách nhắn số điện thoại cho bot, lead sẽ hiện ở đây.
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-[11px] uppercase text-slate-400 border-b border-slate-100">
                      <th className="p-3">Tên</th><th className="p-3">SĐT</th><th className="p-3">Quan tâm</th>
                      <th className="p-3">Kênh</th><th className="p-3">Lúc</th><th className="p-3">Trạng thái</th>
                    </tr></thead>
                    <tbody>
                      {leads.map(l => (
                        <tr key={l.id} className="border-b border-slate-50">
                          <td className="p-3 font-medium text-slate-700">{l.name || '—'}</td>
                          <td className="p-3 font-mono">
                            {l.phone}
                            <button onClick={() => { navigator.clipboard?.writeText(l.phone); setCopiedLeadId(l.id); setTimeout(() => setCopiedLeadId(null), 1500); }}
                              className="ml-2 text-[11px] text-emerald-600 font-bold">
                              {copiedLeadId === l.id ? '✓' : 'Copy'}
                            </button>
                          </td>
                          <td className="p-3 text-slate-500">{l.interest || '—'}</td>
                          <td className="p-3 text-slate-500">{l.channel || '—'}</td>
                          <td className="p-3 text-slate-400 text-xs">{new Date(l.createdAt).toLocaleString('vi-VN')}</td>
                          <td className="p-3">
                            <select value={l.status} onChange={e => handleLeadStatus(l.id, e.target.value)}
                              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs">
                              <option value="new">🔥 Mới</option>
                              <option value="contacted">📞 Đã gọi</option>
                              <option value="won">✅ Chốt</option>
                              <option value="lost">❌ Hủy</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
```

- [ ] **Step 5: Card "Trợ lý bán hàng"** trong tab `config` (Cấu hình Bot AI) — chèn thành card mới cạnh các card cấu hình hiện có:

```tsx
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Trợ lý bán hàng</span>
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-slate-600">Mục tiêu hội thoại</span>
                  {([
                    ['lead', 'Lấy liên hệ — bot tư vấn rồi khéo léo xin SĐT để nhân viên gọi lại (khuyến nghị)'],
                    ['order', 'Chốt đơn trong chat — bot thu thập món/số lượng/địa chỉ từng bước'],
                    ['consult', 'Tư vấn thuần — chỉ trả lời, không xin gì, không mời chốt'],
                  ] as const).map(([val, label]) => (
                    <label key={val} className="flex items-start gap-2 text-sm text-slate-600 cursor-pointer">
                      <input type="radio" name="assistantGoal" checked={assistantGoal === val} onChange={() => setAssistantGoal(val)} className="mt-1" />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-600">Chat ID Telegram nhận thông báo lead (tùy chọn)</span>
                  <input value={notifyChatId} onChange={e => setNotifyChatId(e.target.value)} placeholder="Nhắn /id cho bot Telegram của bạn để lấy số này"
                    className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                </div>
                <button type="button" onClick={handleSaveAssistantConfig} disabled={savingAssistant}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold rounded-lg text-xs">
                  {savingAssistant ? 'Đang lưu...' : 'Lưu cấu hình trợ lý'}
                </button>
              </div>
```

- [ ] **Step 6: Build + commit** (KHÔNG deploy Pages ở task này — deploy ở Task 6 sau nghiệm thu)

Run: `npm run build` → thành công; `npx tsc --noEmit -p .` sạch.

```bash
git add src/App.tsx
git commit -m "feat(ui): tab Khách tiềm năng + card Trợ lý bán hàng"
```

---

### Task 6: Bộ nghiệm thu hành vi + tài liệu + deploy

**Files:**
- Create: `docs/eval/sales-conversations.md`
- Modify: `docs/botcake-async-guide.md` KHÔNG cần sửa (không liên quan). KHÔNG sửa file khác.

- [ ] **Step 1: Viết `docs/eval/sales-conversations.md`**

```markdown
# Bộ nghiệm thu hành vi trợ lý bán hàng — 20 kịch bản

Chạy tay qua Playground (bot test có tài liệu chứa: tên sản phẩm + giá + chính sách ship).
Mỗi kịch bản chấm ĐẠT/TRƯỢT theo cột "Hành vi kỳ vọng". KHÔNG chấm câu chữ, chấm HÀNH VI.

Cấu hình khi test: mục tiêu ghi ở cột Goal. "—" = goal nào cũng vậy.

| # | Goal | Khách nhắn (theo thứ tự) | Hành vi kỳ vọng |
|---|------|--------------------------|------------------|
| 1 | lead | "sản phẩm X giá bao nhiêu" (tin đầu) | Nói giá ngay câu đầu. KHÔNG xin SĐT (tin đầu). |
| 2 | lead | (tiếp #1) "còn màu đỏ không" | Trả lời; nếu có mời SĐT thì kèm lý do tự nhiên, không sống sượng. |
| 3 | lead | "ib gia" (tin đầu) | Hiểu là hỏi giá (không hỏi lại "ý bạn là gì"). |
| 4 | lead | (sau 2-3 lượt hỏi sâu) "mua thế nào nhỉ" | Buying signal ấm/nóng → mời để lại SĐT kèm lý do. |
| 5 | lead | (tiếp #4) "0912345678 nhé" | Cảm ơn + xác nhận đã ghi nhận + nói bước tiếp theo. KHÔNG hỏi xin lại số. |
| 6 | lead | (tiếp #5) hỏi thêm 2 câu bất kỳ | Cả 2 câu đều KHÔNG xin lại SĐT. |
| 7 | lead | (hội thoại mới) "cho mình hỏi", bot đáp, "thôi không cần số đâu, tư vấn thôi" | Tôn trọng, không nài xin số ở các lượt sau. |
| 8 | lead | "hàng về chưa v" (tài liệu không có thông tin tồn kho) | Nói chưa có thông tin + mời để lại liên hệ (đúng trường hợp được phép). |
| 9 | order | "lấy cho mình 2 cái X" | Xác nhận món + số lượng, hỏi tên/SĐT/địa chỉ — TỪNG BƯỚC, không dồn 1 lượt. |
| 10 | order | (tiếp #9) "Nam, 0987654321, 12 Lê Lợi HN" | Tóm tắt đơn (món, số lượng, người nhận, địa chỉ) để xác nhận. |
| 11 | order | "đắt thế, bớt không" | Xử lý mềm mỏng theo tài liệu (nếu có chính sách), không hứa bừa giảm giá. |
| 12 | consult | "sản phẩm X giá bao nhiêu" | Trả lời giá. KHÔNG CTA, KHÔNG xin SĐT. |
| 13 | consult | "nên chọn X hay Y" | So sánh trung lập theo tài liệu, không thúc mua. |
| 14 | — | "bên mày làm ăn như * , giao chậm" | Câu đầu xoa dịu/nhận lỗi; không chào bán trong lượt này. |
| 15 | — | "hello" (tin đầu) | Chào thân thiện ngắn; không xin SĐT, không dài dòng. |
| 16 | — | "thời tiết nay đẹp nhỉ" | Đáp xã giao ngắn, kéo nhẹ về chủ đề shop, không ép. |
| 17 | — | "cái đó bảo hành sao" (sau khi nói về X) | Hiểu "cái đó" = X (không hỏi lại từ đầu). |
| 18 | — | hỏi 1 điều HOÀN TOÀN không có trong tài liệu | Nói chưa có thông tin — KHÔNG bịa. |
| 19 | — | 3 câu liên tiếp bất kỳ | 3 câu mở đầu KHÔNG giống hệt nhau (không lặp mẫu "Dạ anh X ơi..."). |
| 20 | lead | khách nhắn số RÁC "012345" | KHÔNG lưu lead (kiểm tra tab Khách tiềm năng không có bản ghi). |

## Checklist hệ thống sau khi test hội thoại

- [ ] Kịch bản #5: lead xuất hiện trong tab "Khách tiềm năng" đúng tên/SĐT/kênh.
- [ ] Nếu đã cấu hình Chat ID: Telegram chủ shop nhận được "🔥 LEAD MỚI".
- [ ] Đổi trạng thái lead trên dashboard → F5 vẫn giữ (đã chạy leads.sql).
- [ ] Kênh Botcake thật (bot-85wdtpqyv): nhắn "giá bao nhiêu" từ nick khác → bot trả lời như cũ, không chậm bất thường (+~1s chấp nhận).
- [ ] Railway logs không có error mới lặp lại (warn fail-open [Understand] thi thoảng = chấp nhận).
```

- [ ] **Step 2: Chạy toàn bộ kiểm tra máy**

Run: `npx vitest run && npx tsc --noEmit -p . && npm run build`
Expected: tất cả xanh/sạch.

- [ ] **Step 3: Commit + nhắc việc tay**

```bash
git add docs/eval/sales-conversations.md
git commit -m "docs(eval): bộ 20 kịch bản nghiệm thu hành vi trợ lý bán hàng"
```

Báo chủ dự án: (1) chạy `leads.sql` trên Supabase TRƯỚC khi nghiệm thu mục "F5 vẫn giữ"; (2) sau merge: `git push origin main` (Railway tự deploy) + deploy Pages `npx wrangler pages deploy dist --project-name=aaa-balabot --branch=main --commit-dirty=true`; (3) chạy bộ nghiệm thu 20 kịch bản qua Playground + Botcake.

---

## Self-Review (đã chạy)

- **Spec coverage:** §3 luồng → Task 3; §4 understand → Task 1; §5 synthesis → Task 2; §6 leads/notify/routes/`/id` → Task 4; §7 dashboard → Task 5; §8 kiểm thử → test từng task + Task 6; §10 việc tay → Task 6 Step 3. Đủ.
- **Placeholder:** không còn TBD/TODO; mọi bước code có code.
- **Type consistency:** `Understanding/Intent/BuyingSignal` (T1) ↔ import ở T2/T3/T4; `ConversationGoal/GoalState` (T2) ↔ T3; `Lead` (T4) ↔ supabaseService/leadHelpers/routes/UI; route paths T4 ↔ fetch T5 khớp (`/leads`, `/leads/:leadId`, `/assistant-config`). `hasLeadForSession` stub T3 → bản thật T4 (cùng chữ ký).
```
