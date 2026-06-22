import { getSupabaseClient } from "../supabaseService.js";
import type { ZaloSessionRecord, GroupBinding } from "./types.js";

// Fallback in-memory khi Supabase chưa cấu hình (degrade mượt, giống code hiện tại).
const memSessions = new Map<string, ZaloSessionRecord>();
const memBindings = new Map<string, GroupBinding>();

export async function loadSession(accountLabel: string): Promise<ZaloSessionRecord | null> {
  const sb = getSupabaseClient();
  if (!sb) return memSessions.get(accountLabel) || null;
  const { data, error } = await sb.from("zalo_sessions").select("*").eq("account_label", accountLabel).maybeSingle();
  if (error) { console.warn("[Zalo Store] loadSession error:", error.message); return null; }
  return (data as ZaloSessionRecord) || null;
}

export async function saveSession(rec: ZaloSessionRecord): Promise<void> {
  rec.updated_at = new Date().toISOString();
  const sb = getSupabaseClient();
  if (!sb) { memSessions.set(rec.account_label, rec); return; }
  const { error } = await sb.from("zalo_sessions").upsert(rec, { onConflict: "id" });
  if (error) console.warn("[Zalo Store] saveSession error:", error.message);
}

export async function getBinding(groupId: string): Promise<GroupBinding | null> {
  const sb = getSupabaseClient();
  if (!sb) return memBindings.get(groupId) || null;
  const { data, error } = await sb.from("zalo_group_bindings").select("*").eq("group_id", groupId).maybeSingle();
  if (error) { console.warn("[Zalo Store] getBinding error:", error.message); return null; }
  return (data as GroupBinding) || null;
}

export async function listBindings(): Promise<GroupBinding[]> {
  const sb = getSupabaseClient();
  if (!sb) return Array.from(memBindings.values());
  const { data, error } = await sb.from("zalo_group_bindings").select("*").order("updated_at", { ascending: false });
  if (error) { console.warn("[Zalo Store] listBindings error:", error.message); return []; }
  return (data as GroupBinding[]) || [];
}

export async function upsertBinding(b: GroupBinding): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) { memBindings.set(b.group_id, b); return; }
  const { error } = await sb.from("zalo_group_bindings")
    .upsert({ ...b, updated_at: new Date().toISOString() }, { onConflict: "group_id" });
  if (error) console.warn("[Zalo Store] upsertBinding error:", error.message);
}
