/**
 * zca-js client lifecycle — the ONLY file that touches the zca-js SDK.
 * Multi-tenant: per-user runtime state lives in the session registry
 * (Map<ownerEmail, ZaloSession>); this file holds no per-user globals.
 */

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

// ---------- per-session bot-message dedup (reply-loop guard) ----------

function rememberSentMessage(s: ZaloSession, id: string) {
  s.recentBotMsgIds.add(id);
  if (s.recentBotMsgIds.size > 1000) {
    const oldest = s.recentBotMsgIds.values().next().value;
    if (oldest) s.recentBotMsgIds.delete(oldest);
  }
}

// getBinding lives in the CENTRAL Supabase (bindings are infra data). The
// background listener has no request scope, so getSupabaseClient() already
// resolves to the central client here — do NOT wrap this in withUserScope.
async function getBindingForOwner(owner: string, groupId: string) {
  return getBinding(owner, groupId);
}

// ---------- per-session deps builder ----------

function buildDeps(s: ZaloSession): ZaloDeps {
  if (!injected) throw new Error("Zalo not initialized");
  const inj = injected;
  const owner = s.ownerEmail;
  return {
    botUid: () => s.selfUid,
    sendTyping: async (groupId) => {
      // Hiển thị "đang soạn tin" trong nhóm trong lúc chờ AI tạo câu trả lời. Lỗi thì bỏ qua.
      try { await s.api?.sendTypingEvent?.(groupId, ThreadType.Group); }
      catch (e: unknown) { console.warn("[Zalo Client] sendTyping failed:", e instanceof Error ? e.message : e); }
    },
    send: async (groupId, text) => {
      try {
        const chunks = text.match(/[\s\S]{1,1800}/g) || [text];
        let lastId: string | null = null;
        for (const chunk of chunks) {
          // Humanized 1-3s delay before each send (reduces bot-detection risk).
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
    // Bots + conversation read/write hit the USER's Supabase (via withUserScope).
    generateRAGAnswer: inj.generateRAGAnswer,
    postProcessBotReply: inj.postProcessBotReply,
    getBots: () => inj.withUserScope(owner, () => inj.getBots()),
    // getBinding hits the CENTRAL Supabase — NOT user-scoped (see note above).
    getBinding: (groupId) => getBindingForOwner(owner, groupId),
    chatSessions: inj.chatSessions,
    saveConversation: (c) => inj.withUserScope(owner, () => inj.saveConversation(c)),
    analytics: inj.analytics,
    rememberSentMessage: (id) => rememberSentMessage(s, id),
    isBotMessageId: (id) => s.recentBotMsgIds.has(id),
    ratePerMin: RATE,
  };
}

// ---------- normalizeEvent ----------
// Converts a real zca-js Message (UserMessage | GroupMessage) -> ZaloIncomingEvent.

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

// ---------- group auto-discovery ----------
// Phát hiện nhóm từ MỌI tin nhắn nhóm (kể cả tin tự-gửi) để owner test một mình vẫn ra nhóm.
// Chỉ ghi nhận nhóm (bot_id rỗng, enabled=false), KHÔNG ghi đè binding đã có.

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
    } catch { /* tên là phụ, bỏ qua nếu lỗi */ }
    await upsertBinding({ owner_email: s.ownerEmail, group_id: groupId, group_name: groupName, bot_id: "", enabled: false });
    console.log(`[Zalo ${s.ownerEmail}] discovered group ${groupId} ("${groupName}")`);
  } catch (e: unknown) {
    console.warn("[Zalo Client] registerGroupFromRaw failed:", e instanceof Error ? e.message : e);
  }
}

// ---------- listener ----------

async function startListening(s: ZaloSession, handler: (e: ZaloIncomingEvent) => Promise<unknown>) {
  try {
    s.api.listener.on("message", async (msg: Message) => {
      // Đăng ký nhóm TRƯỚC (kể cả tin tự-gửi) để nhóm luôn hiện trong admin dù chưa gán bot.
      await registerGroupFromRaw(s, msg);
      const ev = normalizeEvent(s, msg);
      if (!ev) return;
      handler(ev).catch((e: unknown) => console.error("[Zalo Client] handler error:", e));
    });
    s.api.listener.on("error", (e: unknown) => {
      console.error(`[Zalo ${s.ownerEmail}] listener error:`, e);
      s.listenerConnected = false; scheduleReconnect(s);
    });
    s.api.listener.on("closed", () => {
      console.warn(`[Zalo ${s.ownerEmail}] listener closed`);
      s.listenerConnected = false; scheduleReconnect(s);
    });
    s.api.listener.on("disconnected", () => {
      console.warn(`[Zalo ${s.ownerEmail}] listener disconnected`);
      s.listenerConnected = false; scheduleReconnect(s);
    });
    // retryOnClose: false — we handle reconnect ourselves with backoff.
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

// ---------- reconnect with exponential backoff (per session) ----------

/** Returns true if the error looks like an authentication/credentials failure. */
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
      // Success: bootApi resets reconnectDelay to 5000.
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isAuthError(e)) {
        // Auth failure — stop retrying to avoid account lockout.
        console.error(`[Zalo ${s.ownerEmail}] reconnect aborted (auth — needs re-login):`, msg);
        s.loginState = "needs_login"; s.lastError = msg;
        await saveSession({
          id: s.ownerEmail, owner_email: s.ownerEmail, account_label: ACCOUNT_LABEL,
          credentials: null, status: "needs_login", last_error: msg,
        } as ZaloSessionRecord).catch(() => { /* persist best-effort */ });
        return;
      }
      console.error(`[Zalo ${s.ownerEmail}] reconnect failed (transient):`, msg);
      s.reconnectDelay = Math.min(s.reconnectDelay * 2, 60_000);
    }
  }, s.reconnectDelay);
}

// ---------- boot helpers ----------

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
      } catch { /* ignore — network may not be ready */ }
    }
    if (!s.selfUid) console.warn(`[Zalo ${s.ownerEmail}] selfUid unresolved — @mentions may be missed`);
    s.selfName = s.selfUid ?? s.selfName;
  } catch { /* optional enrichment */ }
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

// ---------- public exports (owner-scoped) ----------

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
  // Guard concurrent QR logins — return existing QR payload if already logging in.
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
    // Wait up to ~8s for QR payload to appear (callback fires quickly).
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
