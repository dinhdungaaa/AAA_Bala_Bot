# Zalo Multi-tenant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every signed-in user connect their own isolated Zalo account (1 nick/user) so the group bot works per-user instead of a single shared owner account.

**Architecture:** Convert the single-tenant Zalo runtime (module globals in `client.ts`) into a `Map<ownerEmail, ZaloSession>`. Session credentials + group bindings move to the central Supabase scoped by `owner_email`; the background listener reaches each user's bots/KB by wrapping RAG work in `withSupabaseConfig(userConfig)`. API endpoints and UI drop the owner-only gate and scope by the signed-in user's email.

**Tech Stack:** TypeScript (ESM, NodeNext), Express, `zca-js`, Supabase JS, Vitest, React (single `src/App.tsx`).

## Global Constraints

- ESM imports use `.js` extensions in TS source (NodeNext). Copy this from existing files.
- Test runner: `npx vitest run <path>` (config: [vitest.config.ts](../../../vitest.config.ts)). Lint/typecheck: `npm run lint` (= `tsc --noEmit`).
- `owner_email` is always stored **lowercased + trimmed**, matching `getRequestUserEmail` ([server.ts:99](../../../server.ts#L99)).
- Sensitive Zalo credentials live ONLY in the central Supabase (service-role). Per-user Supabase holds bots/KB only.
- Background listener code must NOT assume request scope: to hit a user's Supabase, wrap calls in `withSupabaseConfig(userConfig, fn)` from [supabaseService.ts](../../../supabaseService.ts).
- Per-session failures must stay isolated — one user's reconnect/auth error must never throw out of another user's path or crash the process.
- `ADMIN_EMAIL` constant = `ox102.crypto@gmail.com` (used for backfill default).
- Do NOT commit with `--no-verify`. Keep commits atomic per task.

## File Structure

- **Create** `zaloGroupBot/sessionRegistry.ts` — pure `Map<ownerEmail, ZaloSession>` manager: get-or-create, get, delete, list, live-count, `ZALO_MAX_SESSIONS` cap. No `zca-js` imports → unit-testable.
- **Create** `zaloGroupBot/__tests__/sessionRegistry.test.ts` — registry unit tests.
- **Create** `zaloGroupBot/__tests__/store.test.ts` — store owner-scoping tests (in-memory fallback path).
- **Create** `migrations/2026-06-27-zalo-owner-email.sql` — schema migration.
- **Modify** `zaloGroupBot/types.ts` — add `owner_email`/`ownerEmail` to records, status, and the new `ZaloSession` runtime type.
- **Modify** `zaloGroupBot/store.ts` — all functions take `ownerEmail`; add `listActiveSessions()`.
- **Modify** `zaloGroupBot/client.ts` — rewrite around `sessionRegistry`; public fns take `ownerEmail`; per-session scoped deps; throttled boot restore.
- **Modify** `zaloGroupBot/index.ts` — re-export updated signatures.
- **Modify** `server.ts` — scope `/api/zalo/*` by signed-in email; pass per-user Supabase config; inject a `resolveUserConfig` dep.
- **Modify** `src/App.tsx` — remove the three `ADMIN_EMAIL` gates around the Zalo tab.
- `zaloGroupBot/handler.ts` — **unchanged** (its `deps.getBinding/getBots/saveConversation` are per-session closures built in `client.ts`; the handler interface is already owner-agnostic).

---

### Task 1: Schema migration for `owner_email`

**Files:**
- Create: `migrations/2026-06-27-zalo-owner-email.sql`
- Reference: [zaloGroupBot.sql](../../../zaloGroupBot.sql)

**Interfaces:**
- Produces: `zalo_sessions.owner_email text`, `zalo_group_bindings.owner_email text`, binding uniqueness `(owner_email, group_id)`, binding surrogate PK `id`.

- [ ] **Step 1: Write the migration SQL**

```sql
-- migrations/2026-06-27-zalo-owner-email.sql
-- Multi-tenant Zalo: scope sessions + bindings by owner_email.

-- 1) zalo_sessions: one row per user (MVP = 1 nick/user).
alter table zalo_sessions add column if not exists owner_email text;
update zalo_sessions set owner_email = 'ox102.crypto@gmail.com' where owner_email is null;
create unique index if not exists zalo_sessions_owner_email_uq on zalo_sessions (owner_email);

-- 2) zalo_group_bindings: scope by owner; (owner_email, group_id) unique.
alter table zalo_group_bindings add column if not exists owner_email text;
update zalo_group_bindings set owner_email = 'ox102.crypto@gmail.com' where owner_email is null;

-- group_id was the PK; replace with a surrogate id so the same group_id can exist per owner.
alter table zalo_group_bindings add column if not exists id text;
update zalo_group_bindings set id = coalesce(id, owner_email || ':' || group_id) where id is null;
alter table zalo_group_bindings drop constraint if exists zalo_group_bindings_pkey;
alter table zalo_group_bindings add primary key (id);
create unique index if not exists zalo_group_bindings_owner_group_uq
  on zalo_group_bindings (owner_email, group_id);
```

- [ ] **Step 2: Verify SQL is well-formed (no DB needed)**

Read the file back and confirm: both `add column if not exists`, the backfill `update`s, the PK swap, and both unique indexes are present. (Migration is applied manually to Supabase by the operator; no automated run here.)

- [ ] **Step 3: Commit**

```bash
git add migrations/2026-06-27-zalo-owner-email.sql
git commit -m "feat(zalo): migration adds owner_email scoping to sessions + bindings"
```

---

### Task 2: Types for owner scoping + runtime session

**Files:**
- Modify: [zaloGroupBot/types.ts](../../../zaloGroupBot/types.ts)

**Interfaces:**
- Produces:
  - `GroupBinding` gains `owner_email: string` and optional `id?: string`.
  - `ZaloSessionRecord` gains `owner_email: string`.
  - `ZaloRuntimeStatus` gains `ownerEmail: string`.
  - New `ZaloSession` runtime interface (mutable per-user state) + `ZaloSessionDeps` (the injected, NON-scoped deps shared across users).

- [ ] **Step 1: Add `owner_email` to `GroupBinding` and `ZaloSessionRecord`**

In [zaloGroupBot/types.ts](../../../zaloGroupBot/types.ts), update:

```typescript
export interface GroupBinding {
  id?: string;
  owner_email: string;
  group_id: string;
  group_name?: string;
  bot_id: string;
  enabled: boolean;
}

export interface ZaloSessionRecord {
  id: string;
  owner_email: string;
  account_label: string;
  credentials: any | null;
  status: "active" | "needs_login" | "error";
  last_error?: string | null;
  updated_at?: string;
}
```

- [ ] **Step 2: Add `ownerEmail` to `ZaloRuntimeStatus` and define runtime types**

Append/modify in the same file:

```typescript
export interface ZaloRuntimeStatus {
  enabled: boolean;
  ownerEmail: string;
  loginState: "active" | "needs_login" | "error" | "logging_in";
  accountLabel: string;
  accountName: string | null;
  listenerConnected: boolean;
  lastError: string | null;
}

// Per-user mutable runtime state held in the session registry.
export interface ZaloSession {
  ownerEmail: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  api: any | null;
  selfUid: string | null;
  selfName: string | null;
  listenerConnected: boolean;
  loginState: ZaloRuntimeStatus["loginState"];
  lastError: string | null;
  qrPayload: string | null;
  qrResult: { state: "pending" | "success" | "failed"; error?: string };
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectDelay: number;
  recentBotMsgIds: Set<string>;
}
```

- [ ] **Step 3: Add `ZaloSessionDeps` (injected, app-level, NOT user-scoped)**

The existing `ZaloDeps` is the per-handler interface (keep it). Add the app-level injected deps the client receives from the server, including the new resolver for a user's Supabase config:

```typescript
export interface ZaloInjectedDeps {
  generateRAGAnswer: ZaloDeps["generateRAGAnswer"];
  postProcessBotReply: ZaloDeps["postProcessBotReply"];
  getBots: ZaloDeps["getBots"];
  chatSessions: ZaloDeps["chatSessions"];
  saveConversation: ZaloDeps["saveConversation"];
  analytics: ZaloDeps["analytics"];
  // Resolve a user's Supabase config (url/key) by email, or null if not configured.
  resolveUserConfig: (ownerEmail: string) => { url: string; key: string } | null;
  // Run fn inside that user's Supabase scope (wraps withSupabaseConfig).
  withUserScope: <T>(ownerEmail: string, fn: () => T) => T;
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run lint`
Expected: type errors ONLY in `store.ts` / `client.ts` (consumers not yet updated). Those are fixed in later tasks. No errors inside `types.ts` itself.

- [ ] **Step 5: Commit**

```bash
git add zaloGroupBot/types.ts
git commit -m "feat(zalo): add owner_email scoping + per-user runtime types"
```

---

### Task 3: Owner-scoped store + active-session listing

**Files:**
- Modify: [zaloGroupBot/store.ts](../../../zaloGroupBot/store.ts)
- Test: `zaloGroupBot/__tests__/store.test.ts` (create)

**Interfaces:**
- Consumes: `GroupBinding`, `ZaloSessionRecord` (with `owner_email`) from Task 2.
- Produces:
  - `loadSession(ownerEmail: string): Promise<ZaloSessionRecord | null>`
  - `saveSession(rec: ZaloSessionRecord): Promise<void>` (rec carries `owner_email`)
  - `listActiveSessions(): Promise<ZaloSessionRecord[]>`
  - `getBinding(ownerEmail: string, groupId: string): Promise<GroupBinding | null>`
  - `listBindings(ownerEmail: string): Promise<GroupBinding[]>`
  - `upsertBinding(b: GroupBinding): Promise<void>` (b carries `owner_email`)

- [ ] **Step 1: Write failing store tests (in-memory fallback path)**

`getSupabaseClient()` returns null when no Supabase is configured, so the tests exercise the in-memory maps. Create `zaloGroupBot/__tests__/store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import {
  saveSession, loadSession, listActiveSessions,
  upsertBinding, getBinding, listBindings, __resetStoreForTests,
} from "../store.js";
import type { ZaloSessionRecord, GroupBinding } from "../types.js";

function rec(owner: string, status: ZaloSessionRecord["status"]): ZaloSessionRecord {
  return { id: owner, owner_email: owner, account_label: owner, credentials: { c: 1 }, status };
}
function bind(owner: string, group: string): GroupBinding {
  return { owner_email: owner, group_id: group, bot_id: "bot-" + owner, enabled: true };
}

describe("zalo store owner scoping (in-memory fallback)", () => {
  beforeEach(() => __resetStoreForTests());

  it("loadSession returns only that owner's session", async () => {
    await saveSession(rec("a@x.com", "active"));
    await saveSession(rec("b@x.com", "active"));
    expect((await loadSession("a@x.com"))?.owner_email).toBe("a@x.com");
    expect(await loadSession("c@x.com")).toBeNull();
  });

  it("listActiveSessions returns only active rows", async () => {
    await saveSession(rec("a@x.com", "active"));
    await saveSession(rec("b@x.com", "needs_login"));
    const active = await listActiveSessions();
    expect(active.map((r) => r.owner_email).sort()).toEqual(["a@x.com"]);
  });

  it("bindings are isolated per owner", async () => {
    await upsertBinding(bind("a@x.com", "g1"));
    await upsertBinding(bind("b@x.com", "g1"));
    expect((await listBindings("a@x.com")).length).toBe(1);
    expect((await getBinding("a@x.com", "g1"))?.bot_id).toBe("bot-a@x.com");
    expect(await getBinding("b@x.com", "g2")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run zaloGroupBot/__tests__/store.test.ts`
Expected: FAIL — `__resetStoreForTests` not exported; functions have old signatures.

- [ ] **Step 3: Rewrite `store.ts` with owner scoping**

Replace the body of [zaloGroupBot/store.ts](../../../zaloGroupBot/store.ts):

```typescript
import { getSupabaseClient } from "../supabaseService.js";
import type { ZaloSessionRecord, GroupBinding } from "./types.js";

// In-memory fallback when Supabase is not configured.
const memSessions = new Map<string, ZaloSessionRecord>();      // key: owner_email
const memBindings = new Map<string, GroupBinding>();           // key: owner_email::group_id

const bindKey = (owner: string, group: string) => `${owner}::${group}`;

// Test-only reset.
export function __resetStoreForTests() {
  memSessions.clear();
  memBindings.clear();
}

export async function loadSession(ownerEmail: string): Promise<ZaloSessionRecord | null> {
  const sb = getSupabaseClient();
  if (!sb) return memSessions.get(ownerEmail) || null;
  const { data, error } = await sb.from("zalo_sessions").select("*").eq("owner_email", ownerEmail).maybeSingle();
  if (error) { console.warn("[Zalo Store] loadSession error:", error.message); return null; }
  return (data as ZaloSessionRecord) || null;
}

export async function saveSession(rec: ZaloSessionRecord): Promise<void> {
  rec.updated_at = new Date().toISOString();
  const sb = getSupabaseClient();
  if (!sb) { memSessions.set(rec.owner_email, rec); return; }
  const { error } = await sb.from("zalo_sessions").upsert(rec, { onConflict: "owner_email" });
  if (error) console.warn("[Zalo Store] saveSession error:", error.message);
}

export async function listActiveSessions(): Promise<ZaloSessionRecord[]> {
  const sb = getSupabaseClient();
  if (!sb) return Array.from(memSessions.values()).filter((r) => r.status === "active");
  const { data, error } = await sb.from("zalo_sessions").select("*").eq("status", "active");
  if (error) { console.warn("[Zalo Store] listActiveSessions error:", error.message); return []; }
  return (data as ZaloSessionRecord[]) || [];
}

export async function getBinding(ownerEmail: string, groupId: string): Promise<GroupBinding | null> {
  const sb = getSupabaseClient();
  if (!sb) return memBindings.get(bindKey(ownerEmail, groupId)) || null;
  const { data, error } = await sb.from("zalo_group_bindings").select("*")
    .eq("owner_email", ownerEmail).eq("group_id", groupId).maybeSingle();
  if (error) { console.warn("[Zalo Store] getBinding error:", error.message); return null; }
  return (data as GroupBinding) || null;
}

export async function listBindings(ownerEmail: string): Promise<GroupBinding[]> {
  const sb = getSupabaseClient();
  if (!sb) return Array.from(memBindings.values()).filter((b) => b.owner_email === ownerEmail);
  const { data, error } = await sb.from("zalo_group_bindings").select("*")
    .eq("owner_email", ownerEmail).order("updated_at", { ascending: false });
  if (error) { console.warn("[Zalo Store] listBindings error:", error.message); return []; }
  return (data as GroupBinding[]) || [];
}

export async function upsertBinding(b: GroupBinding): Promise<void> {
  const id = b.id || `${b.owner_email}:${b.group_id}`;
  const row = { ...b, id, updated_at: new Date().toISOString() };
  const sb = getSupabaseClient();
  if (!sb) { memBindings.set(bindKey(b.owner_email, b.group_id), row); return; }
  const { error } = await sb.from("zalo_group_bindings").upsert(row, { onConflict: "owner_email,group_id" });
  if (error) console.warn("[Zalo Store] upsertBinding error:", error.message);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run zaloGroupBot/__tests__/store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add zaloGroupBot/store.ts zaloGroupBot/__tests__/store.test.ts
git commit -m "feat(zalo): owner-scoped store + active session listing"
```

---

### Task 4: Session registry (`Map<ownerEmail, ZaloSession>` + cap)

**Files:**
- Create: `zaloGroupBot/sessionRegistry.ts`
- Test: `zaloGroupBot/__tests__/sessionRegistry.test.ts`

**Interfaces:**
- Consumes: `ZaloSession` from Task 2.
- Produces:
  - `newSession(ownerEmail: string): ZaloSession` — fresh session object with defaults (`loginState: "needs_login"`, empty `recentBotMsgIds`, `reconnectDelay: 5000`).
  - `getOrCreate(ownerEmail: string): ZaloSession`
  - `get(ownerEmail: string): ZaloSession | undefined`
  - `remove(ownerEmail: string): void`
  - `all(): ZaloSession[]`
  - `liveCount(): number` — count of sessions whose `loginState` is `"active"` or `"logging_in"`.
  - `atCapacity(): boolean` — `liveCount() >= maxSessions()`.
  - `maxSessions(): number` — reads `ZALO_MAX_SESSIONS` (default 100).
  - `__resetForTests(): void`

- [ ] **Step 1: Write failing registry tests**

Create `zaloGroupBot/__tests__/sessionRegistry.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as reg from "../sessionRegistry.js";

describe("zalo session registry", () => {
  beforeEach(() => { delete process.env.ZALO_MAX_SESSIONS; reg.__resetForTests(); });
  afterEach(() => { delete process.env.ZALO_MAX_SESSIONS; });

  it("getOrCreate returns same instance per owner", () => {
    const a1 = reg.getOrCreate("a@x.com");
    const a2 = reg.getOrCreate("a@x.com");
    expect(a1).toBe(a2);
    expect(a1.ownerEmail).toBe("a@x.com");
    expect(a1.loginState).toBe("needs_login");
  });

  it("sessions are isolated (separate dedup sets)", () => {
    const a = reg.getOrCreate("a@x.com");
    const b = reg.getOrCreate("b@x.com");
    a.recentBotMsgIds.add("m1");
    expect(b.recentBotMsgIds.has("m1")).toBe(false);
  });

  it("liveCount counts active/logging_in only", () => {
    reg.getOrCreate("a@x.com").loginState = "active";
    reg.getOrCreate("b@x.com").loginState = "logging_in";
    reg.getOrCreate("c@x.com").loginState = "needs_login";
    expect(reg.liveCount()).toBe(2);
  });

  it("atCapacity respects ZALO_MAX_SESSIONS", () => {
    process.env.ZALO_MAX_SESSIONS = "1";
    reg.getOrCreate("a@x.com").loginState = "active";
    expect(reg.atCapacity()).toBe(true);
  });

  it("remove deletes the session", () => {
    reg.getOrCreate("a@x.com");
    reg.remove("a@x.com");
    expect(reg.get("a@x.com")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run zaloGroupBot/__tests__/sessionRegistry.test.ts`
Expected: FAIL — module `../sessionRegistry.js` not found.

- [ ] **Step 3: Implement `sessionRegistry.ts`**

```typescript
import type { ZaloSession } from "./types.js";

const sessions = new Map<string, ZaloSession>();

export function maxSessions(): number {
  const n = parseInt(process.env.ZALO_MAX_SESSIONS || "100", 10);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

export function newSession(ownerEmail: string): ZaloSession {
  return {
    ownerEmail,
    api: null,
    selfUid: null,
    selfName: null,
    listenerConnected: false,
    loginState: "needs_login",
    lastError: null,
    qrPayload: null,
    qrResult: { state: "pending" },
    reconnectTimer: null,
    reconnectDelay: 5000,
    recentBotMsgIds: new Set<string>(),
  };
}

export function getOrCreate(ownerEmail: string): ZaloSession {
  let s = sessions.get(ownerEmail);
  if (!s) { s = newSession(ownerEmail); sessions.set(ownerEmail, s); }
  return s;
}

export function get(ownerEmail: string): ZaloSession | undefined { return sessions.get(ownerEmail); }
export function remove(ownerEmail: string): void { sessions.delete(ownerEmail); }
export function all(): ZaloSession[] { return Array.from(sessions.values()); }

export function liveCount(): number {
  let n = 0;
  for (const s of sessions.values()) if (s.loginState === "active" || s.loginState === "logging_in") n++;
  return n;
}

export function atCapacity(): boolean { return liveCount() >= maxSessions(); }

export function __resetForTests(): void { sessions.clear(); }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run zaloGroupBot/__tests__/sessionRegistry.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add zaloGroupBot/sessionRegistry.ts zaloGroupBot/__tests__/sessionRegistry.test.ts
git commit -m "feat(zalo): per-user session registry with capacity cap"
```

---

### Task 5: Rewrite `client.ts` to multi-tenant

**Files:**
- Modify: [zaloGroupBot/client.ts](../../../zaloGroupBot/client.ts)
- Modify: [zaloGroupBot/index.ts](../../../zaloGroupBot/index.ts)

**Interfaces:**
- Consumes: `sessionRegistry` (Task 4), owner-scoped `store` (Task 3), `ZaloInjectedDeps`/`ZaloSession` (Task 2), `withSupabaseConfig` (existing), `createZaloMessageHandler` (existing, unchanged).
- Produces (all owner-scoped):
  - `initZaloGroupBot(deps: ZaloInjectedDeps): Promise<void>`
  - `startQrLogin(ownerEmail: string): Promise<{ qr: string | null; error?: string }>`
  - `getQrLoginResult(ownerEmail: string): { state: "pending" | "success" | "failed"; error?: string }`
  - `getRuntimeStatus(ownerEmail: string): ZaloRuntimeStatus`
  - `logoutZalo(ownerEmail: string): Promise<void>`

This is the largest task. The transformation rule: **every former module global becomes a field on the `ZaloSession` for that `ownerEmail`**, and every `store` call passes `ownerEmail`. Deps that touch the user's Supabase (bots/binding/saveConversation) are wrapped with `injected.withUserScope(ownerEmail, …)`.

- [ ] **Step 1: Replace module-global state with registry + injected deps**

At the top of [zaloGroupBot/client.ts](../../../zaloGroupBot/client.ts), replace the imports and the block of `let api … let injected` globals (lines ~6–38) with:

```typescript
import { Zalo, ThreadType } from "zca-js";
import type { Message, GroupMessage } from "zca-js";
import type { LoginQRCallbackEvent } from "zca-js";
import { LoginQRCallbackEventType } from "zca-js";
import { ZaloApiError } from "zca-js";
import type {
  ZaloDeps, ZaloIncomingEvent, ZaloRuntimeStatus, ZaloSessionRecord,
  ZaloInjectedDeps, ZaloSession,
} from "./types.js";
import {
  loadSession, saveSession, listActiveSessions, getBinding, upsertBinding,
} from "./store.js";
import { createZaloMessageHandler } from "./handler.js";
import * as registry from "./sessionRegistry.js";

const ACCOUNT_LABEL = process.env.ZALO_ACCOUNT_LABEL || "default";
const RATE = parseInt(process.env.ZALO_RATE_LIMIT_PER_MIN || "5", 10);

let injected: ZaloInjectedDeps | null = null;
```

- [ ] **Step 2: Make dedup, deps, normalize, and discovery session-scoped**

Replace `rememberSentMessage`/`isBotMessageId`/`buildDeps`/`registerGroupFromRaw` so they take the `ZaloSession`:

```typescript
function rememberSentMessage(s: ZaloSession, id: string) {
  s.recentBotMsgIds.add(id);
  if (s.recentBotMsgIds.size > 1000) {
    const oldest = s.recentBotMsgIds.values().next().value;
    if (oldest) s.recentBotMsgIds.delete(oldest);
  }
}

function buildDeps(s: ZaloSession): ZaloDeps {
  if (!injected) throw new Error("Zalo not initialized");
  const inj = injected;
  const owner = s.ownerEmail;
  return {
    botUid: () => s.selfUid,
    sendTyping: async (groupId) => {
      try { await s.api?.sendTypingEvent?.(groupId, ThreadType.Group); }
      catch (e: unknown) { console.warn("[Zalo Client] sendTyping failed:", e instanceof Error ? e.message : e); }
    },
    send: async (groupId, text) => {
      try {
        const chunks = text.match(/[\s\S]{1,1800}/g) || [text];
        let lastId: string | null = null;
        for (const chunk of chunks) {
          await new Promise((r) => setTimeout(r, 1000 + Math.floor(Math.random() * 2000)));
          const res = await s.api.sendMessage(chunk, groupId, ThreadType.Group);
          const msgId = res?.message?.msgId;
          lastId = msgId != null ? String(msgId) : lastId;
        }
        return lastId;
      } catch (e: unknown) {
        console.error("[Zalo Client] send error:", e instanceof Error ? e.message : String(e));
        return null;
      }
    },
    // Bots + binding + conversation read/write hit the USER's Supabase.
    generateRAGAnswer: inj.generateRAGAnswer,
    postProcessBotReply: inj.postProcessBotReply,
    getBots: () => inj.withUserScope(owner, () => inj.getBots()),
    // getBinding hits the CENTRAL Supabase — NOT user-scoped (see note below).
    getBinding: (groupId) => getBindingForOwner(owner, groupId),
    chatSessions: inj.chatSessions,
    saveConversation: (c) => inj.withUserScope(owner, () => inj.saveConversation(c)),
    analytics: inj.analytics,
    rememberSentMessage: (id) => rememberSentMessage(s, id),
    isBotMessageId: (id) => s.recentBotMsgIds.has(id),
    ratePerMin: RATE,
  };
}

// getBinding lives in central Supabase (NOT the user's) — bindings are infra data.
// We deliberately do NOT wrap this in withUserScope; it reads the central table by owner_email.
async function getBindingForOwner(owner: string, groupId: string) {
  return getBinding(owner, groupId);
}
```

> Note: `getBinding`/`upsertBinding` target the **central** Supabase. Since the background listener has no request scope, `getSupabaseClient()` already resolves to the central client there — correct by default. Only bots/KB/`saveConversation` need `withUserScope`. That is why the `getBinding` closure above calls `getBindingForOwner` directly (no `withUserScope` wrap).

- [ ] **Step 3: Session-scope `normalizeEvent`, discovery, and the listener**

Rewrite these to receive the session. `normalizeEvent(s, raw)` uses `s.selfUid`. `registerGroupFromRaw(s, raw)` uses `s.api` and writes a binding with `owner_email: s.ownerEmail`:

```typescript
function normalizeEvent(s: ZaloSession, raw: Message): ZaloIncomingEvent | null {
  try {
    if (raw.type !== ThreadType.Group) return null;
    const msg = raw as GroupMessage;
    const groupId = msg.threadId.toString();
    const data = msg.data;
    const messageId = (data.msgId ?? data.cliMsgId ?? "").toString();
    const senderId = (data.uidFrom ?? "").toString();
    if (s.selfUid && senderId === s.selfUid) return null;
    const senderName = (data.dName ?? "Khach hang Zalo").toString();
    const content = data.content;
    const text = typeof content === "string" ? content : "";
    const mentions = Array.isArray(data.mentions) ? data.mentions : [];
    const mentionedUids = mentions.map((m) => (m?.uid ?? "").toString()).filter(Boolean);
    const quotedMessageId = data.quote
      ? (data.quote.globalMsgId ?? data.quote.cliMsgId ?? "").toString() || undefined
      : undefined;
    if (!groupId || !messageId) return null;
    return { groupId, messageId, senderId, senderName, text: String(text || ""), mentionedUids, quotedMessageId };
  } catch { return null; }
}

async function registerGroupFromRaw(s: ZaloSession, raw: Message): Promise<void> {
  try {
    if (raw?.type !== ThreadType.Group) return;
    const groupId = ((raw as GroupMessage).threadId ?? "").toString();
    if (!groupId) return;
    const existing = await getBinding(s.ownerEmail, groupId);
    if (existing) return;
    let groupName = `Nhóm ${groupId}`;
    try {
      const info = await s.api?.getGroupInfo?.(groupId);
      const name = info?.gridInfoMap?.[groupId]?.name;
      if (name) groupName = String(name);
    } catch { /* tên là phụ */ }
    await upsertBinding({ owner_email: s.ownerEmail, group_id: groupId, group_name: groupName, bot_id: "", enabled: false });
    console.log(`[Zalo ${s.ownerEmail}] discovered group ${groupId} ("${groupName}")`);
  } catch (e: unknown) {
    console.warn("[Zalo Client] registerGroupFromRaw failed:", e instanceof Error ? e.message : e);
  }
}

async function startListening(s: ZaloSession, handler: (e: ZaloIncomingEvent) => Promise<unknown>) {
  try {
    s.api.listener.on("message", async (msg: Message) => {
      await registerGroupFromRaw(s, msg);
      const ev = normalizeEvent(s, msg);
      if (!ev) return;
      handler(ev).catch((e: unknown) => console.error("[Zalo Client] handler error:", e));
    });
    s.api.listener.on("error", (e: unknown) => {
      console.error(`[Zalo ${s.ownerEmail}] listener error:`, e);
      s.listenerConnected = false; scheduleReconnect(s);
    });
    s.api.listener.on("closed", () => { s.listenerConnected = false; scheduleReconnect(s); });
    s.api.listener.on("disconnected", () => { s.listenerConnected = false; scheduleReconnect(s); });
    s.api.listener.start({ retryOnClose: false });
    s.listenerConnected = true;
    s.loginState = "active";
    console.log(`[Zalo ${s.ownerEmail}] listener started`);
  } catch (e: unknown) {
    s.lastError = e instanceof Error ? e.message : String(e);
    s.listenerConnected = false;
    console.error(`[Zalo ${s.ownerEmail}] startListening failed:`, s.lastError);
  }
}
```

- [ ] **Step 4: Session-scope reconnect/backoff and boot helpers**

```typescript
function isAuthError(e: unknown): boolean {
  if (e instanceof ZaloApiError) {
    const authCodes = new Set([-101, -216, -1006, -1004]);
    if (e.code !== null && authCodes.has(e.code)) return true;
  }
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  const kw = ["login", "auth", "unauthorized", "expired", "credential", "cookie", "invalid session", "session"];
  return kw.some((k) => msg.includes(k));
}

function scheduleReconnect(s: ZaloSession) {
  if (s.reconnectTimer) return;
  s.reconnectTimer = setTimeout(async () => {
    s.reconnectTimer = null;
    try {
      const rec = await loadSession(s.ownerEmail);
      if (rec?.credentials) await loginWithCredentials(s, rec.credentials);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isAuthError(e)) {
        console.error(`[Zalo ${s.ownerEmail}] reconnect aborted (auth):`, msg);
        s.loginState = "needs_login"; s.lastError = msg;
        await saveSession({
          id: s.ownerEmail, owner_email: s.ownerEmail, account_label: ACCOUNT_LABEL,
          credentials: null, status: "needs_login", last_error: msg,
        } as ZaloSessionRecord).catch(() => {});
        return;
      }
      console.error(`[Zalo ${s.ownerEmail}] reconnect failed (transient):`, msg);
      s.reconnectDelay = Math.min(s.reconnectDelay * 2, 60_000);
    }
  }, s.reconnectDelay);
}

async function bootApi(s: ZaloSession, loggedInApi: unknown) {
  s.api = loggedInApi;
  try {
    const ownId: string | undefined = s.api.getOwnId?.();
    if (ownId) s.selfUid = ownId;
    if (!s.selfUid) { const ctx = s.api.getContext?.() || {}; if (ctx.uid) s.selfUid = ctx.uid.toString(); }
    if (!s.selfUid) {
      try {
        const info = await s.api.fetchAccountInfo?.();
        const uid = info?.profile?.uid ?? info?.profile?.userId;
        if (uid) s.selfUid = uid.toString();
      } catch { /* ignore */ }
    }
    if (!s.selfUid) console.warn(`[Zalo ${s.ownerEmail}] selfUid unresolved — @mentions may be missed`);
    s.selfName = s.selfUid ?? s.selfName;
  } catch { /* optional */ }
  s.reconnectDelay = 5000;
  await startListening(s, createZaloMessageHandler(buildDeps(s)));
}

async function loginWithCredentials(s: ZaloSession, credentials: unknown) {
  const zalo = new Zalo();
  const loggedIn = await zalo.login(credentials as Parameters<typeof zalo.login>[0]);
  await bootApi(s, loggedIn);
  await saveSession({
    id: s.ownerEmail, owner_email: s.ownerEmail, account_label: ACCOUNT_LABEL,
    credentials, status: "active", last_error: null,
  } as ZaloSessionRecord);
}
```

- [ ] **Step 5: Rewrite public exports (owner-scoped) + throttled boot restore**

```typescript
export async function initZaloGroupBot(deps: ZaloInjectedDeps): Promise<void> {
  injected = deps;
  if (process.env.ZALO_GROUP_BOT_ENABLED !== "true") {
    console.log("[Zalo Client] disabled (ZALO_GROUP_BOT_ENABLED != true)");
    return;
  }
  // Restore all active sessions sequentially with throttle (avoid login thundering-herd).
  try {
    const active = await listActiveSessions();
    console.log(`[Zalo Client] restoring ${active.length} active session(s)`);
    for (const rec of active) {
      if (!rec.owner_email || !rec.credentials) continue;
      if (registry.atCapacity()) { console.warn("[Zalo Client] capacity reached during restore"); break; }
      const s = registry.getOrCreate(rec.owner_email);
      try { await loginWithCredentials(s, rec.credentials); }
      catch (e: unknown) {
        s.loginState = "needs_login";
        s.lastError = e instanceof Error ? e.message : String(e);
        console.error(`[Zalo ${rec.owner_email}] restore failed:`, s.lastError);
      }
      await new Promise((r) => setTimeout(r, 1000)); // throttle ~1/s
    }
  } catch (e: unknown) {
    console.error("[Zalo Client] boot restore error (swallowed):", e instanceof Error ? e.message : e);
  }
}

export async function startQrLogin(ownerEmail: string): Promise<{ qr: string | null; error?: string }> {
  if (process.env.ZALO_GROUP_BOT_ENABLED !== "true") return { qr: null, error: "ZALO_GROUP_BOT_ENABLED chua bat" };
  const existing = registry.get(ownerEmail);
  if (existing && existing.loginState === "logging_in") return { qr: existing.qrPayload };
  if (registry.atCapacity() && !(existing && existing.loginState === "active")) {
    return { qr: null, error: "He thong dang ban (toi da so phien Zalo). Thu lai sau." };
  }
  const s = registry.getOrCreate(ownerEmail);
  try {
    s.loginState = "logging_in";
    s.qrResult = { state: "pending" };
    s.qrPayload = null;
    const zalo = new Zalo();
    let savedCredentials: unknown = null;
    const loginPromise = zalo.loginQR(undefined, (event: LoginQRCallbackEvent) => {
      if (event.type === LoginQRCallbackEventType.QRCodeGenerated) {
        s.qrPayload = event.data.image || null;
      } else if (event.type === LoginQRCallbackEventType.GotLoginInfo) {
        savedCredentials = { cookie: event.data.cookie, imei: event.data.imei, userAgent: event.data.userAgent };
      }
    });
    loginPromise
      .then(async (loggedIn) => {
        if (!loggedIn) { s.qrResult = { state: "failed", error: "loginQR returned null" }; s.loginState = "error"; return; }
        await bootApi(s, loggedIn);
        const ctx = s.api.getContext?.() || {};
        const credentials = savedCredentials ?? {
          cookie: s.api.getCookie?.()?.toJSON?.()?.cookies ?? [], imei: ctx.imei, userAgent: ctx.userAgent,
        };
        await saveSession({
          id: ownerEmail, owner_email: ownerEmail, account_label: ACCOUNT_LABEL,
          credentials, status: "active", last_error: null,
        } as ZaloSessionRecord);
        s.qrResult = { state: "success" };
      })
      .catch((e: unknown) => {
        s.lastError = e instanceof Error ? e.message : String(e);
        s.loginState = "error";
        s.qrResult = { state: "failed", error: s.lastError };
        console.error(`[Zalo ${ownerEmail}] QR login failed:`, s.lastError);
      });
    for (let i = 0; i < 40 && !s.qrPayload; i++) await new Promise((r) => setTimeout(r, 200));
    return { qr: s.qrPayload };
  } catch (e: unknown) {
    s.loginState = "error";
    return { qr: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export function getQrLoginResult(ownerEmail: string) {
  return registry.get(ownerEmail)?.qrResult ?? { state: "pending" as const };
}

export function getRuntimeStatus(ownerEmail: string): ZaloRuntimeStatus {
  const s = registry.get(ownerEmail);
  return {
    enabled: process.env.ZALO_GROUP_BOT_ENABLED === "true",
    ownerEmail,
    loginState: s?.loginState ?? "needs_login",
    accountLabel: ACCOUNT_LABEL,
    accountName: s?.selfName ?? null,
    listenerConnected: s?.listenerConnected ?? false,
    lastError: s?.lastError ?? null,
  };
}

export async function logoutZalo(ownerEmail: string): Promise<void> {
  const s = registry.get(ownerEmail);
  if (s) {
    try { s.api?.listener?.stop?.(); } catch { /* ignore */ }
    if (s.reconnectTimer) { clearTimeout(s.reconnectTimer); s.reconnectTimer = null; }
    s.reconnectDelay = 5000; s.api = null; s.selfUid = null; s.selfName = null;
    s.listenerConnected = false; s.loginState = "needs_login";
  }
  registry.remove(ownerEmail);
  await saveSession({
    id: ownerEmail, owner_email: ownerEmail, account_label: ACCOUNT_LABEL,
    credentials: null, status: "needs_login", last_error: null,
  } as ZaloSessionRecord);
}
```

- [ ] **Step 6: Update `index.ts` re-exports**

Replace [zaloGroupBot/index.ts](../../../zaloGroupBot/index.ts):

```typescript
export {
  initZaloGroupBot, startQrLogin, getQrLoginResult, getRuntimeStatus, logoutZalo,
} from "./client.js";
export { listBindings, upsertBinding } from "./store.js";
export type { ZaloRuntimeStatus, GroupBinding, ZaloInjectedDeps } from "./types.js";
```

- [ ] **Step 7: Typecheck + run existing Zalo tests**

Run: `npm run lint`
Expected: errors remain only in `server.ts` (call sites not yet updated). `zaloGroupBot/*` clean.

Run: `npx vitest run zaloGroupBot`
Expected: PASS — existing handler/triggers tests unaffected (handler interface unchanged), plus store + registry tests.

- [ ] **Step 8: Commit**

```bash
git add zaloGroupBot/client.ts zaloGroupBot/index.ts
git commit -m "feat(zalo): multi-tenant client runtime (Map per owner, scoped deps, throttled restore)"
```

---

### Task 6: Scope `/api/zalo/*` endpoints by signed-in user

**Files:**
- Modify: [server.ts](../../../server.ts) — Zalo endpoints (~L2141–2200), init call (~L3817), and add a `requireSignedInUser` helper near `requireOwnerAdmin` (~L108).

**Interfaces:**
- Consumes: owner-scoped client exports (Task 5); `getRequestUserEmail` and `getSavedSupabaseConfigForEmail` (existing).
- Produces: all `/api/zalo/*` handlers scoped by `getRequestUserEmail(req)`.

- [ ] **Step 1: Add a signed-in-user guard**

After `requireOwnerAdmin` in [server.ts](../../../server.ts#L108), add:

```typescript
function requireSignedInUser(req: express.Request, res: express.Response): string | null {
  const email = getRequestUserEmail(req);
  if (!email) {
    res.status(401).json({ error: "Cần đăng nhập để dùng tính năng Zalo." });
    return null;
  }
  return email;
}
```

- [ ] **Step 2: Update the import to include the new injected-deps shape**

Update the import block at [server.ts:58](../../../server.ts#L58) so `withSupabaseConfig` is available (it is exported from `supabaseService`). Confirm there is an import for `supabaseService`; if `withSupabaseConfig` is not already imported, add it:

```typescript
import { /* …existing… */ withSupabaseConfig } from "./supabaseService.js";
```

- [ ] **Step 3: Rewrite the Zalo endpoints to scope by email**

Replace the block [server.ts:2142–2182](../../../server.ts#L2142-L2182):

```typescript
app.get("/api/zalo/status", (req, res) => {
  const email = requireSignedInUser(req, res); if (!email) return;
  res.json(getRuntimeStatus(email));
});

app.post("/api/zalo/login/start", async (req, res) => {
  const email = requireSignedInUser(req, res); if (!email) return;
  res.json(await startQrLogin(email));
});

app.get("/api/zalo/login/result", (req, res) => {
  const email = requireSignedInUser(req, res); if (!email) return;
  res.json(getQrLoginResult(email));
});

app.post("/api/zalo/logout", async (req, res) => {
  const email = requireSignedInUser(req, res); if (!email) return;
  await logoutZalo(email);
  res.json({ ok: true });
});

app.get("/api/zalo/groups", async (req, res) => {
  const email = requireSignedInUser(req, res); if (!email) return;
  const bindings = await listBindings(email);
  const userConfig = getSavedSupabaseConfigForEmail(email);
  const allBots = await withSupabaseConfig(userConfig, () => dbGetBots(bots));
  res.json({ bindings, bots: allBots.map((b) => ({ id: b.id, name: b.name })) });
});

app.post("/api/zalo/groups/:groupId/binding", async (req, res) => {
  const email = requireSignedInUser(req, res); if (!email) return;
  const { botId, enabled, groupName } = req.body || {};
  if (!botId) return res.status(400).json({ error: "Thieu botId" }) as any;
  await upsertBinding({
    owner_email: email,
    group_id: req.params.groupId,
    group_name: groupName,
    bot_id: botId,
    enabled: enabled !== false,
  });
  res.json({ ok: true });
});
```

> `listBindings`, `upsertBinding`, `getRuntimeStatus`, `startQrLogin`, `getQrLoginResult`, `logoutZalo` are imported from `./zaloGroupBot/index.js` (Task 5). Ensure `listBindings`/`upsertBinding` are in the import at [server.ts:58](../../../server.ts#L58) (they already are).

- [ ] **Step 4: Scope the `/api/zalo/simulate` bot lookup to the caller**

Replace the bot resolution in [server.ts:2185–2199](../../../server.ts#L2185-L2199):

```typescript
app.post("/api/zalo/simulate", async (req, res) => {
  const email = requireSignedInUser(req, res); if (!email) return;
  const { botId, text, senderName } = req.body || {};
  const userConfig = getSavedSupabaseConfigForEmail(email);
  const allBots = await withSupabaseConfig(userConfig, () => dbGetBots(bots));
  const bot = allBots.find((b) => b.id === botId);
  if (!bot) return res.status(404).json({ error: "Bot not found" }) as any;
  try {
    const ai = await withSupabaseConfig(userConfig, () => generateRAGAnswer(
      bot, String(text || ""),
      { fullName: senderName || "Khach test", username: senderName || "tester", id: "zalo-sim" },
      { shouldGreet: true, recentMessages: [] }
    ));
    res.json({ reply: postProcessBotReply(ai.text, { shouldGreet: true }), sources: ai.sources });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Zalo simulation failed" });
  }
});
```

- [ ] **Step 5: Update the `initZaloGroupBot` injection with the user-scope resolvers**

Replace the init call at [server.ts:3817–3824](../../../server.ts#L3817-L3824):

```typescript
    await initZaloGroupBot({
      generateRAGAnswer,
      postProcessBotReply,
      getBots: () => dbGetBots(bots),
      chatSessions,
      saveConversation: dbSaveConversation,
      analytics,
      resolveUserConfig: (ownerEmail) => getSavedSupabaseConfigForEmail(ownerEmail),
      withUserScope: (ownerEmail, fn) =>
        withSupabaseConfig(getSavedSupabaseConfigForEmail(ownerEmail), fn),
    });
```

- [ ] **Step 6: Typecheck**

Run: `npm run lint`
Expected: PASS (0 errors) across the project.

- [ ] **Step 7: Commit**

```bash
git add server.ts
git commit -m "feat(zalo): scope /api/zalo endpoints per signed-in user"
```

---

### Task 7: Open the Zalo tab to all signed-in users (UI)

**Files:**
- Modify: [src/App.tsx](../../../src/App.tsx) — three gates: load effect (~L634), nav button (~L1756), panel render (~L3226).

**Interfaces:**
- Consumes: existing `getScopedApiHeaders` (already sends `x-balabot-user-email`), `sbUser`, `activeTab`.

- [ ] **Step 1: Open the load effect to any signed-in user**

At [src/App.tsx:634](../../../src/App.tsx#L634), replace:

```typescript
    if (activeTab === 'zalo' && sbUser?.email === ADMIN_EMAIL) {
```

with:

```typescript
    if (activeTab === 'zalo' && sbUser?.email) {
```

- [ ] **Step 2: Show the nav button for any signed-in user**

At [src/App.tsx:1756](../../../src/App.tsx#L1756), replace the gate wrapper:

```typescript
          {sbUser?.email === ADMIN_EMAIL && (
```

with:

```typescript
          {sbUser?.email && (
```

(Leave the closing `)}` and button markup untouched.)

- [ ] **Step 3: Render the panel for any signed-in user**

At [src/App.tsx:3226](../../../src/App.tsx#L3226), replace:

```typescript
          {activeTab === 'zalo' && sbUser?.email === ADMIN_EMAIL && (
```

with:

```typescript
          {activeTab === 'zalo' && sbUser?.email && (
```

- [ ] **Step 4: Typecheck the frontend**

Run: `npm run lint`
Expected: PASS (0 errors).

- [ ] **Step 5: Manual smoke (build sanity)**

Run: `npm run build`
Expected: Vite + esbuild succeed with no type/bundle errors.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(zalo): show Zalo Group Bot tab for all signed-in users"
```

---

### Task 8: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `npx vitest run`
Expected: PASS — all suites green (handler, triggers, store, sessionRegistry).

- [ ] **Step 2: Typecheck whole project**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Operator note for deploy**

Confirm the migration `migrations/2026-06-27-zalo-owner-email.sql` must be applied to the **central** Supabase before deploy, and that `ZALO_GROUP_BOT_ENABLED=true` (+ optional `ZALO_MAX_SESSIONS`) are set. Per [memory: deploy architecture], the frontend (Pages) and backend (Railway) deploy separately — the UI change needs a Pages deploy, the server changes need a Railway deploy.

- [ ] **Step 5: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "chore(zalo): verification fixups for multi-tenant rollout"
```

---

## Self-Review Notes

- **Spec coverage:** storage split (Tasks 1–3), runtime Map (Tasks 4–5), concurrency cap + throttled restore (Tasks 4–5), API scoping (Task 6), UI gates (Task 7), migration (Task 1), per-session isolation tests (Tasks 3–4). All spec sections mapped.
- **Binding storage clarification:** bindings live in the **central** Supabase, so `getBinding`/`upsertBinding` in the listener are NOT wrapped in `withUserScope` (the background context already resolves to the central client). Only bots/KB/`saveConversation` use `withUserScope`. This is called out explicitly in Task 5 Step 2 to avoid the easy mistake of scoping bindings to the user's DB.
- **Type consistency:** `ZaloInjectedDeps` (Task 2) is consumed by `initZaloGroupBot` (Task 5) and supplied in `server.ts` (Task 6 Step 5). `owner_email` naming is consistent across store, types, client, and server. `getRuntimeStatus/startQrLogin/getQrLoginResult/logoutZalo` all take `ownerEmail: string`.
