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
