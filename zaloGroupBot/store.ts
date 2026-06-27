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
