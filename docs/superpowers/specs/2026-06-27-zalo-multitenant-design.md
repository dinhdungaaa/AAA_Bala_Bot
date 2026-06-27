# Zalo Group Bot — Multi-tenant Design

**Date:** 2026-06-27
**Status:** Approved (design), pending implementation plan
**Goal:** Open the Zalo group-bot connection feature to every signed-in user, with each user owning an isolated Zalo session — not a shared single account.

## Background

Today the Zalo group bot is **single-tenant and owner-only**:

- [zaloGroupBot/client.ts](../../../zaloGroupBot/client.ts) keeps all runtime state in module-level globals (`api`, `selfUid`, `loginState`, `qrPayload`, reconnect state) and a single `ACCOUNT_LABEL` (env `ZALO_ACCOUNT_LABEL || "default"`). The whole server can log in **one** Zalo account.
- [zaloGroupBot/store.ts](../../../zaloGroupBot/store.ts): `zalo_sessions` (single row per account label) and `zalo_group_bindings` (global, `group_id` primary key) carry no per-user scope.
- All `/api/zalo/*` endpoints in [server.ts](../../../server.ts) are gated by `requireOwnerAdmin` (owner `ox102.crypto@gmail.com` only).
- The UI hides the Zalo tab behind `sbUser?.email === ADMIN_EMAIL` in three places in [src/App.tsx](../../../src/App.tsx) (nav button ~L1756, load effect ~L634, panel ~L3226).

Simply removing the gate would let every user share the **same** Zalo session: a second user's QR login would overwrite the first user's credentials, and group bindings would be mixed across users. We want true per-user isolation instead.

### Key enabling mechanism

The app is already multi-tenant for data: each user supplies their own Supabase URL/key. `getSupabaseClient()` resolves to a request-scoped client via an `AsyncLocalStorage` (`requestConfigStorage`). The Zalo listener runs in the **background** (outside any request), so it currently falls back to the **central** server Supabase.

`withSupabaseConfig(config, fn)` ([supabaseService.ts:21](../../../supabaseService.ts#L21)) lets us run any function inside a given user's Supabase scope. Per-user Supabase configs are persisted in `USER_CONFIGS_FILE` (`supabase-user-configs.json`) keyed by lowercase email. This is the bridge that lets a background listener execute RAG against the correct user's bots and knowledge base.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Direction | True multi-tenant (per-user isolated session), not shared-account gate removal |
| Concurrency scale | Large: 50+ concurrent live listeners expected |
| Nicks per user | **1 Zalo account per user** (MVP); multi-nick deferred (YAGNI) |
| Session/binding storage | **Central** Supabase (service-role), scoped by `owner_email` column |
| Bot/KB storage | Remains in **each user's own** Supabase; listener reaches it via `withSupabaseConfig` |

## Architecture

### Storage split

Two concerns, two locations:

1. **Central server Supabase** holds Zalo infrastructure tables. The background listener has direct service-role access here without needing a request scope, and the sensitive Zalo cookies do not depend on the privilege level of each user's own Supabase key.
   - `zalo_sessions`: add `owner_email text`. One row per user (MVP enforces a single nick per user). Lookups key on `owner_email`.
   - `zalo_group_bindings`: add `owner_email text`. `group_id` is no longer a global primary key; uniqueness becomes `(owner_email, group_id)`. A surrogate `id` becomes the primary key.

2. **Per-user Supabase** holds bots + knowledge base (unchanged). When a listener generates a reply, the RAG/bot lookups run inside `withSupabaseConfig(userConfig, …)` where `userConfig` is read from `USER_CONFIGS_FILE` by `owner_email`. If a user has no stored Supabase config, their listener cannot resolve bots — treat as a soft failure (log + skip reply), never crash the process.

### Runtime — `Map<ownerEmail, ZaloSession>`

[zaloGroupBot/client.ts](../../../zaloGroupBot/client.ts) is rewritten so that everything currently held in module globals lives inside a per-user `ZaloSession` object stored in a `Map<string, ZaloSession>` keyed by lowercase `ownerEmail`.

```
interface ZaloSession {
  ownerEmail: string;
  api: any | null;
  selfUid: string | null;
  selfName: string | null;
  listenerConnected: boolean;
  loginState: "active" | "needs_login" | "error" | "logging_in";
  lastError: string | null;
  qrPayload: string | null;
  qrResult: { state: "pending" | "success" | "failed"; error?: string };
  reconnectTimer: Timer | null;
  reconnectDelay: number;
  recentBotMsgIds: Set<string>;   // reply-loop guard, per session
}
```

Public functions become user-scoped:

- `startQrLogin(ownerEmail)` → manages that user's `qrPayload`/`qrResult`.
- `getQrLoginResult(ownerEmail)`
- `getRuntimeStatus(ownerEmail)`
- `logoutZalo(ownerEmail)`
- `initZaloGroupBot(deps)` — unchanged signature for injected deps, but on boot restores **all** active sessions (see Boot).

Per-session deps (`buildDeps`) are constructed per `ownerEmail`. `getBots`, `getBinding`, and `saveConversation` are wrapped so their Supabase work runs under that user's scope:

- `getBinding(groupId)` / binding writes / `saveConversation` and `getBots` for RAG run inside `withSupabaseConfig(userConfig, …)`.
- `send`, `sendTyping`, dedup, and rate-limit stay attached to the session's own `api` and `recentBotMsgIds`.

Group auto-discovery (`registerGroupFromRaw`) writes the discovered binding scoped to `owner_email` (central table).

### Concurrency (50+)

- `ZALO_MAX_SESSIONS` (env, default e.g. 100). `startQrLogin` refuses a new session when the live count would exceed the cap, returning a clear error to the UI.
- **Boot restore**: load all `zalo_sessions` rows with `status = 'active'` from the central table, then relogin **sequentially with throttle** (e.g. ~1s between logins) rather than all at once, to avoid a thundering-herd of websocket logins on startup.
- One Node process holds N listeners. The `Map`-based design keeps the door open to extracting a dedicated worker later; that extraction is out of scope now.

### API ([server.ts](../../../server.ts#L2141))

Replace `requireOwnerAdmin` on `/api/zalo/*` with a "signed-in user" check: require a non-empty `getRequestUserEmail(req)`; reject anonymous requests. Every handler scopes by that email:

- `GET /api/zalo/status` → `getRuntimeStatus(email)`
- `POST /api/zalo/login/start` → `startQrLogin(email)`
- `GET /api/zalo/login/result` → `getQrLoginResult(email)`
- `POST /api/zalo/logout` → `logoutZalo(email)`
- `GET /api/zalo/groups` → bindings for `email` + bots from that user's Supabase only
- `POST /api/zalo/groups/:groupId/binding` → upsert scoped to `email`
- `POST /api/zalo/simulate` → unchanged purpose, but resolves the bot from the caller's Supabase scope

### UI ([src/App.tsx](../../../src/App.tsx))

Remove the three `sbUser?.email === ADMIN_EMAIL` guards so any signed-in user sees and uses the Zalo tab:

- Nav button (~L1756)
- Load effect (~L634) — load when `activeTab === 'zalo'` for any signed-in user
- Panel render (~L3226)

The existing scoped fetch headers (`getScopedApiHeaders`, which already send `x-balabot-user-email`) require no change.

### Store ([zaloGroupBot/store.ts](../../../zaloGroupBot/store.ts))

All functions take `ownerEmail` and filter/scope on it:

- `loadSession(ownerEmail)` / `saveSession(rec)` (rec carries `owner_email`)
- `listActiveSessions()` — new, for boot restore (returns all active rows)
- `getBinding(ownerEmail, groupId)` / `listBindings(ownerEmail)` / `upsertBinding(b)` with `owner_email`
- In-memory fallback maps become keyed by `(ownerEmail, …)`.

## Data flow (inbound message)

1. User X's listener receives a group message (its own `api.listener`).
2. `registerGroupFromRaw` ensures the group is recorded as a binding under `owner_email = X` (central table).
3. `normalizeEvent` filters self-messages using the session's `selfUid`.
4. Handler looks up `getBinding(X, groupId)`; if disabled or unbound, no reply.
5. To answer: inside `withSupabaseConfig(userConfigForX, …)`, resolve the bound bot via `getBots()` against X's Supabase, run `generateRAGAnswer`, then `send` via X's `api`.
6. `saveConversation` persists to X's Supabase (also within the scoped wrapper).

## Error handling

- Per-session failures are isolated: an auth/reconnect failure on one user's session must not affect others. Reconnect/backoff state lives in each `ZaloSession`.
- Auth failure → that session goes `needs_login`, credentials cleared in the central table, no further retry (avoids account lockout) — same policy as today, but per session.
- Missing per-user Supabase config → log and skip the reply; do not crash.
- `ZALO_MAX_SESSIONS` exceeded → `startQrLogin` returns a user-visible error.

## Testing

- Unit: `normalizeEvent`, mention/quote triggers, and handler logic stay per-event and are already covered ([zaloGroupBot/__tests__](../../../zaloGroupBot/__tests__)); extend to assert per-session isolation (two sessions don't share dedup sets or `selfUid`).
- Store: scoping by `owner_email` (a binding for user A is invisible to user B).
- API: anonymous request rejected; user A cannot read/modify user B's bindings.
- Boot restore: throttled sequential relogin of multiple active sessions.

## Migration

SQL migration (applied to the central Supabase) adds `owner_email` to both tables and changes binding uniqueness to `(owner_email, group_id)` with a surrogate primary key. Existing rows (the owner's current single session/bindings) are backfilled with `owner_email = 'ox102.crypto@gmail.com'`.

## Out of scope (YAGNI)

- Multiple Zalo nicks per user.
- Separate worker/process for listeners.
- Lazy on-demand listener spin-up (boot-time restore of active sessions is enough at the current scale).

## Risks

- Running 50+ Zalo accounts through the unofficial `zca-js` library carries a real account-ban risk per nick — a product decision owned by the user.
- Resource ceiling of N websocket listeners in one Node process on the host (Railway); `ZALO_MAX_SESSIONS` is the safety valve, and a worker split is the escape hatch if it's hit.
