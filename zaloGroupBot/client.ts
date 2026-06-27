/**
 * zca-js client lifecycle — the ONLY file that touches the zca-js SDK.
 * If zca-js API changes, only edit this file.
 */

import { Zalo, ThreadType } from "zca-js";
import type { Message, GroupMessage } from "zca-js";
import type { LoginQRCallbackEvent } from "zca-js";
import { LoginQRCallbackEventType } from "zca-js";
import { ZaloApiError } from "zca-js";
import type {
  ZaloDeps, ZaloIncomingEvent, ZaloRuntimeStatus, ZaloSessionRecord,
} from "./types.js";
import { loadSession, saveSession, getBinding, upsertBinding } from "./store.js";
import { createZaloMessageHandler } from "./handler.js";

interface InjectedDeps {
  generateRAGAnswer: ZaloDeps["generateRAGAnswer"];
  postProcessBotReply: ZaloDeps["postProcessBotReply"];
  getBots: ZaloDeps["getBots"];
  chatSessions: ZaloDeps["chatSessions"];
  saveConversation: ZaloDeps["saveConversation"];
  analytics: ZaloDeps["analytics"];
}

const ACCOUNT_LABEL = process.env.ZALO_ACCOUNT_LABEL || "default";
const RATE = parseInt(process.env.ZALO_RATE_LIMIT_PER_MIN || "5", 10);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let api: any = null;                  // zca-js API object (typed as any for flexibility)
let selfUid: string | null = null;
let selfName: string | null = null;
let listenerConnected = false;
let loginState: ZaloRuntimeStatus["loginState"] = "needs_login";
let lastError: string | null = null;
let qrPayload: string | null = null;
let qrResult: { state: "pending" | "success" | "failed"; error?: string } = { state: "pending" };
let injected: InjectedDeps | null = null;

// ---------- diagnostics (để soi listener khi nhóm không hiện) ----------
const diag = {
  rawMessages: 0,
  groupMessages: 0,
  lastEventType: null as string | null,
  lastGroupId: null as string | null,
  groupsDiscovered: 0,
  lastDiscoverError: null as string | null,
};

// ---------- bot-message dedup (reply-loop guard) ----------

const recentBotMsgIds = new Set<string>();
function rememberSentMessage(id: string) {
  recentBotMsgIds.add(id);
  if (recentBotMsgIds.size > 1000) {
    const oldest = recentBotMsgIds.values().next().value;
    if (oldest) recentBotMsgIds.delete(oldest);
  }
}
function isBotMessageId(id: string) { return recentBotMsgIds.has(id); }

// ---------- deps builder ----------

function buildDeps(): ZaloDeps {
  if (!injected) throw new Error("Zalo not initialized");
  return {
    botUid: () => selfUid,
    send: async (groupId, text) => {
      try {
        const chunks = text.match(/[\s\S]{1,1800}/g) || [text];
        let lastId: string | null = null;
        for (const chunk of chunks) {
          // Humanized 1-3s delay before each send (reduces bot-detection risk).
          await new Promise((r) => setTimeout(r, 1000 + Math.floor(Math.random() * 2000)));
          const res = await api.sendMessage(chunk, groupId, ThreadType.Group);
          // sendMessage returns { message: { msgId: number } | null, attachment: [] }
          const msgId = res?.message?.msgId;
          lastId = msgId != null ? String(msgId) : lastId;
        }
        return lastId;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[Zalo Client] send error:", msg);
        return null;
      }
    },
    generateRAGAnswer: injected.generateRAGAnswer,
    postProcessBotReply: injected.postProcessBotReply,
    getBots: injected.getBots,
    getBinding,
    chatSessions: injected.chatSessions,
    saveConversation: injected.saveConversation,
    analytics: injected.analytics,
    rememberSentMessage,
    isBotMessageId,
    ratePerMin: RATE,
  };
}

// ---------- normalizeEvent ----------
// Converts a real zca-js Message (UserMessage | GroupMessage) -> ZaloIncomingEvent.
// Real shape: msg.type === ThreadType.Group, msg.threadId, msg.data (TGroupMessage).
// TGroupMessage: { msgId, cliMsgId, uidFrom, dName, content, mentions?, quote? }

function normalizeEvent(raw: Message): ZaloIncomingEvent | null {
  try {
    // Only process group messages
    if (raw.type !== ThreadType.Group) return null;

    const msg = raw as GroupMessage;
    const groupId = msg.threadId.toString();
    const data = msg.data;

    const messageId = (data.msgId ?? data.cliMsgId ?? "").toString();
    const senderId = (data.uidFrom ?? "").toString();
    if (selfUid && senderId === selfUid) return null;
    const senderName = (data.dName ?? "Khach hang Zalo").toString();

    // content is string | TAttachmentContent | TOtherContent
    const content = data.content;
    const text = typeof content === "string" ? content : "";

    // mentions: TMention[] — each has { uid, pos, len, type }
    const mentions = Array.isArray(data.mentions) ? data.mentions : [];
    const mentionedUids = mentions.map((m) => (m?.uid ?? "").toString()).filter(Boolean);

    // quote: TQuote — { globalMsgId, cliMsgId, ... }
    const quotedMessageId = data.quote
      ? (data.quote.globalMsgId ?? data.quote.cliMsgId ?? "").toString() || undefined
      : undefined;

    if (!groupId || !messageId) return null;

    return {
      groupId,
      messageId,
      senderId,
      senderName,
      text: String(text || ""),
      mentionedUids,
      quotedMessageId,
    };
  } catch {
    return null;
  }
}

// ---------- group auto-discovery ----------

// Phát hiện nhóm từ MỌI tin nhắn nhóm — KỂ CẢ tin của chính nick bot — để owner test
// một mình vẫn ra nhóm. Chỉ ghi nhận nhóm (bot_id rỗng, enabled=false), KHÔNG trả lời ở đây;
// việc lọc tin tự-gửi cho luồng trả lời vẫn nằm ở normalizeEvent. KHÔNG ghi đè binding đã có.
async function registerGroupFromRaw(raw: Message): Promise<void> {
  try {
    diag.rawMessages += 1;
    diag.lastEventType = raw?.type !== undefined && raw?.type !== null ? String(raw.type) : "undefined";
    if (raw?.type !== ThreadType.Group) return;
    const groupId = ((raw as GroupMessage).threadId ?? "").toString();
    diag.groupMessages += 1;
    diag.lastGroupId = groupId || null;
    if (!groupId) return;

    const existing = await getBinding(groupId);
    if (existing) return;

    let groupName = `Nhóm ${groupId}`;
    try {
      const info = await api?.getGroupInfo?.(groupId);
      const name = info?.gridInfoMap?.[groupId]?.name;
      if (name) groupName = String(name);
    } catch { /* tên là phụ, bỏ qua nếu lỗi */ }

    await upsertBinding({ group_id: groupId, group_name: groupName, bot_id: "", enabled: false });
    diag.groupsDiscovered += 1;
    diag.lastDiscoverError = null;
    console.log(`[Zalo Client] discovered group ${groupId} ("${groupName}")`);
  } catch (e: unknown) {
    diag.lastDiscoverError = e instanceof Error ? e.message : String(e);
    console.warn("[Zalo Client] registerGroupFromRaw failed:", diag.lastDiscoverError);
  }
}

// ---------- listener ----------

async function startListening(handler: (e: ZaloIncomingEvent) => Promise<unknown>) {
  try {
    // Use EventEmitter .on() — the deprecated onMessage/onError/onClosed methods still work
    // but the modern API is EventEmitter events: "message", "error", "closed", "disconnected".
    api.listener.on("message", async (msg: Message) => {
      // Đăng ký nhóm TRƯỚC (kể cả tin tự-gửi) để nhóm luôn hiện trong admin dù chưa gán bot.
      await registerGroupFromRaw(msg);
      const ev = normalizeEvent(msg);
      if (!ev) return;
      handler(ev).catch((e: unknown) => console.error("[Zalo Client] handler error:", e));
    });

    api.listener.on("error", (e: unknown) => {
      console.error("[Zalo Client] listener error:", e);
      listenerConnected = false;
      scheduleReconnect();
    });

    // "closed" and "disconnected" both signal the connection dropped
    api.listener.on("closed", () => {
      console.warn("[Zalo Client] listener closed");
      listenerConnected = false;
      scheduleReconnect();
    });

    api.listener.on("disconnected", () => {
      console.warn("[Zalo Client] listener disconnected");
      listenerConnected = false;
      scheduleReconnect();
    });

    // retryOnClose: false — we handle reconnect ourselves with backoff
    api.listener.start({ retryOnClose: false });
    // I1: set active state AFTER start() returns — a synchronous throw from start()
    // must NOT leave loginState as "active".
    listenerConnected = true;
    loginState = "active";
    console.log("[Zalo Client] listener started");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    lastError = msg;
    listenerConnected = false;
    console.error("[Zalo Client] startListening failed:", lastError);
  }
}

// ---------- reconnect with exponential backoff ----------

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 5000;

/** Returns true if the error looks like an authentication/credentials failure. */
function isAuthError(e: unknown): boolean {
  if (e instanceof ZaloApiError) {
    // ZaloApiError.code: Zalo's -101 / -216 are common auth rejection codes.
    // Treat any negative code as a potential auth issue when the message also matches.
    const authCodes = new Set([-101, -216, -1006, -1004]);
    if (e.code !== null && authCodes.has(e.code)) return true;
  }
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  const authKeywords = ["login", "auth", "unauthorized", "expired", "credential", "cookie", "invalid session", "session"];
  return authKeywords.some((kw) => msg.includes(kw));
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      const rec = await loadSession(ACCOUNT_LABEL);
      if (rec?.credentials) {
        await loginWithCredentials(rec.credentials);
      }
      // Success: bootApi resets reconnectDelay to 5000
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isAuthError(e)) {
        // C1: Auth failure — stop retrying to avoid account lockout.
        console.error("[Zalo Client] reconnect aborted (auth failure — needs re-login):", msg);
        loginState = "needs_login";
        lastError = msg;
        await saveSession({
          id: ACCOUNT_LABEL,
          account_label: ACCOUNT_LABEL,
          credentials: null,
          status: "needs_login",
          last_error: msg,
        } as ZaloSessionRecord).catch(() => { /* persist best-effort */ });
        // Do NOT re-queue — returning here stops the retry loop.
        return;
      }
      // Non-auth (network/transient) — log and grow backoff; caller will re-queue next time.
      console.error("[Zalo Client] reconnect failed (transient):", msg);
      reconnectDelay = Math.min(reconnectDelay * 2, 60_000);
    }
  }, reconnectDelay);
}

// ---------- boot helpers ----------

async function bootApi(loggedInApi: unknown) {
  api = loggedInApi;
  try {
    // Attempt 1: getOwnId() — synchronous, most reliable source
    const ownId: string | undefined = api.getOwnId?.();
    if (ownId) {
      selfUid = ownId;
    }
    // Attempt 2: getContext().uid
    if (!selfUid) {
      const ctx = api.getContext?.() || {};
      if (ctx.uid) selfUid = ctx.uid.toString();
    }
    // Attempt 3: fetchAccountInfo().profile.uid (async, fallback)
    if (!selfUid) {
      try {
        const info = await api.fetchAccountInfo?.();
        const profileUid = info?.profile?.uid ?? info?.profile?.userId;
        if (profileUid) selfUid = profileUid.toString();
      } catch { /* ignore — network may not be ready */ }
    }
    if (!selfUid) {
      console.warn("[Zalo Client] selfUid could not be resolved — mention-detection will be degraded (@mentions may be missed)");
    }
    // Use selfUid as name fallback since ContextSession has no displayName
    selfName = selfUid ?? selfName;
  } catch { /* optional enrichment */ }
  reconnectDelay = 5000;
  await startListening(createZaloMessageHandler(buildDeps()));
}

async function loginWithCredentials(credentials: unknown) {
  const zalo = new Zalo();
  // credentials must match Credentials type: { imei, cookie, userAgent, language? }
  const loggedIn = await zalo.login(credentials as Parameters<typeof zalo.login>[0]);
  await bootApi(loggedIn);
  await saveSession({
    id: ACCOUNT_LABEL,
    account_label: ACCOUNT_LABEL,
    credentials,
    status: "active",
    last_error: null,
  } as ZaloSessionRecord);
}

// ---------- public exports ----------

export async function initZaloGroupBot(deps: InjectedDeps): Promise<void> {
  injected = deps;
  if (process.env.ZALO_GROUP_BOT_ENABLED !== "true") {
    console.log("[Zalo Client] disabled (ZALO_GROUP_BOT_ENABLED != true)");
    return;
  }
  try {
    const rec = await loadSession(ACCOUNT_LABEL);
    if (rec?.credentials && rec.status === "active") {
      await loginWithCredentials(rec.credentials);
    } else {
      loginState = "needs_login";
      console.log("[Zalo Client] no active session, waiting for QR login via admin");
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    lastError = msg;
    loginState = "error";
    console.error("[Zalo Client] init error (swallowed):", lastError);
  }
}

export async function startQrLogin(): Promise<{ qr: string | null; error?: string }> {
  if (process.env.ZALO_GROUP_BOT_ENABLED !== "true") {
    return { qr: null, error: "ZALO_GROUP_BOT_ENABLED chua bat" };
  }
  // m1: Guard concurrent QR logins — return existing QR payload if already logging in.
  if (loginState === "logging_in") {
    return { qr: qrPayload };
  }
  try {
    loginState = "logging_in";
    qrResult = { state: "pending" };
    qrPayload = null;

    const zalo = new Zalo();

    // LoginQRCallback receives typed events. QR image is at event.data.image
    // when event.type === LoginQRCallbackEventType.QRCodeGenerated.
    // GotLoginInfo event carries credentials for saveSession.
    let savedCredentials: unknown = null;

    const loginPromise = zalo.loginQR(undefined, (event: LoginQRCallbackEvent) => {
      if (event.type === LoginQRCallbackEventType.QRCodeGenerated) {
        qrPayload = event.data.image || null;
      } else if (event.type === LoginQRCallbackEventType.GotLoginInfo) {
        // Capture credentials from the callback for persistence
        savedCredentials = {
          cookie: event.data.cookie,
          imei: event.data.imei,
          userAgent: event.data.userAgent,
        };
      }
    });

    loginPromise
      .then(async (loggedIn) => {
        if (!loggedIn) {
          qrResult = { state: "failed", error: "loginQR returned null" };
          loginState = "error";
          return;
        }
        await bootApi(loggedIn);
        // Prefer credentials captured from GotLoginInfo callback;
        // fall back to getContext() if available.
        const ctx = api.getContext?.() || {};
        const credentials = savedCredentials ?? {
          cookie: api.getCookie?.()?.toJSON?.()?.cookies ?? [],
          imei: ctx.imei,
          userAgent: ctx.userAgent,
        };
        await saveSession({
          id: ACCOUNT_LABEL,
          account_label: ACCOUNT_LABEL,
          credentials,
          status: "active",
          last_error: null,
        } as ZaloSessionRecord);
        qrResult = { state: "success" };
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        lastError = msg;
        loginState = "error";
        qrResult = { state: "failed", error: lastError };
        console.error("[Zalo Client] QR login failed:", lastError);
      });

    // Wait up to ~8s for QR payload to appear (callback fires quickly)
    for (let i = 0; i < 40 && !qrPayload; i++) {
      await new Promise((r) => setTimeout(r, 200));
    }
    return { qr: qrPayload };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    loginState = "error";
    return { qr: null, error: msg };
  }
}

export function getQrLoginResult() { return qrResult; }

export function getRuntimeStatus(): ZaloRuntimeStatus {
  return {
    enabled: process.env.ZALO_GROUP_BOT_ENABLED === "true",
    loginState,
    accountLabel: ACCOUNT_LABEL,
    accountName: selfName,
    listenerConnected,
    lastError,
    diag: { ...diag },
  };
}

export async function logoutZalo(): Promise<void> {
  try { api?.listener?.stop?.(); } catch { /* ignore */ }
  // m2: Reset backoff and clear any pending reconnect on explicit logout.
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectDelay = 5000;
  api = null;
  selfUid = null;
  selfName = null;
  listenerConnected = false;
  loginState = "needs_login";
  await saveSession({
    id: ACCOUNT_LABEL,
    account_label: ACCOUNT_LABEL,
    credentials: null,
    status: "needs_login",
    last_error: null,
  } as ZaloSessionRecord);
}
