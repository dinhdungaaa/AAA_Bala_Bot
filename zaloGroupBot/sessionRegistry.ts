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
