import { describe, it, expect, vi } from "vitest";
import { createZaloMessageHandler } from "../handler.js";
import type { ZaloDeps, ZaloIncomingEvent, GroupBinding } from "../types.js";
import type { ChatSession } from "../../src/types.js";

function baseDeps(over: Partial<ZaloDeps> = {}): { deps: ZaloDeps; sent: string[]; sessions: ChatSession[] } {
  const sent: string[] = [];
  const sessions: ChatSession[] = [];
  const binding: GroupBinding = { group_id: "g1", bot_id: "bot-1", enabled: true };
  const deps: ZaloDeps = {
    botUid: () => "BOT_UID",
    send: async (_g, t) => { sent.push(t); return "sent-id"; },
    sendTyping: async () => {},
    checkUsage: async () => ({ allowed: true }),
    recordUsage: async () => {},
    blockMessage: "het han muc",
    generateRAGAnswer: async () => ({ text: "Da, gia 100k a.", sources: [], fallbackTriggered: false }),
    postProcessBotReply: (t) => t,
    getBots: async () => [{ id: "bot-1", name: "BalaBot" } as any],
    getBinding: async () => binding,
    chatSessions: sessions,
    saveConversation: async () => true,
    analytics: { totalMessages: 0, totalUsers: 0 },
    rememberSentMessage: () => {},
    isBotMessageId: () => false,
    ratePerMin: 5,
    ...over,
  };
  return { deps, sent, sessions };
}

function ev(p: Partial<ZaloIncomingEvent>): ZaloIncomingEvent {
  return { groupId: "g1", messageId: "m" + Math.random(), senderId: "u1", senderName: "Khach Hang",
    text: "@BalaBot gia bao nhieu?", mentionedUids: ["BOT_UID"], ...p };
}

describe("createZaloMessageHandler", () => {
  it("tra loi khi duoc @mention va gui qua send", async () => {
    const { deps, sent } = baseDeps();
    const h = createZaloMessageHandler(deps);
    const r = await h(ev({}));
    expect(r.replied).toBe(true);
    expect(sent).toEqual(["Da, gia 100k a."]);
  });

  it("im lang khi khong mention va khong reply", async () => {
    const { deps, sent } = baseDeps();
    const h = createZaloMessageHandler(deps);
    const r = await h(ev({ text: "alo", mentionedUids: [] }));
    expect(r.replied).toBe(false);
    expect(sent).toEqual([]);
  });

  it("im lang khi group chua bind", async () => {
    const { deps, sent } = baseDeps({ getBinding: async () => null });
    const h = createZaloMessageHandler(deps);
    const r = await h(ev({}));
    expect(r.replied).toBe(false);
    expect(sent).toEqual([]);
  });

  it("im lang khi binding disabled", async () => {
    const { deps, sent } = baseDeps({ getBinding: async () => ({ group_id: "g1", bot_id: "bot-1", enabled: false }) });
    const h = createZaloMessageHandler(deps);
    expect((await h(ev({}))).replied).toBe(false);
    expect(sent).toEqual([]);
  });

  it("dedupe: cung messageId khong tra loi 2 lan", async () => {
    const { deps, sent } = baseDeps();
    const h = createZaloMessageHandler(deps);
    const e = ev({ messageId: "dup1" });
    await h(e);
    await h(e);
    expect(sent.length).toBe(1);
  });

  it("tra loi khi reply vao tin bot", async () => {
    const { deps, sent } = baseDeps({ isBotMessageId: (id) => id === "botmsg" });
    const h = createZaloMessageHandler(deps);
    const r = await h(ev({ text: "the con ship?", mentionedUids: [], quotedMessageId: "botmsg" }));
    expect(r.replied).toBe(true);
    expect(sent.length).toBe(1);
  });

  it("luu session voi key rieng tung nguoi zalo:<groupId>:<senderId>", async () => {
    const { deps, sessions } = baseDeps();
    const h = createZaloMessageHandler(deps);
    await h(ev({ senderId: "u1" }));
    expect(sessions.length).toBe(1);
    expect(sessions[0].telegramUserId).toBe("zalo:g1:u1");
    expect(sessions[0].messages.some((m) => m.sender === "user")).toBe(true);
    expect(sessions[0].messages.some((m) => m.sender === "bot")).toBe(true);
  });

  it("tach ngu canh rieng cho 2 nguoi khac nhau trong cung nhom", async () => {
    const { deps, sessions } = baseDeps();
    const h = createZaloMessageHandler(deps);
    await h(ev({ senderId: "u1", senderName: "An" }));
    await h(ev({ senderId: "u2", senderName: "Binh" }));
    expect(sessions.length).toBe(2);
    const keys = sessions.map((s) => s.telegramUserId).sort();
    expect(keys).toEqual(["zalo:g1:u1", "zalo:g1:u2"]);
    // moi session chi chua tin cua dung nguoi do (1 user + 1 bot)
    for (const s of sessions) {
      expect(s.messages.filter((m) => m.sender === "user").length).toBe(1);
    }
  });

  it("chan khi het han muc: khong goi RAG, gui block message", async () => {
    const ragSpy = vi.fn();
    const { deps, sent } = baseDeps({ checkUsage: async () => ({ allowed: false }), generateRAGAnswer: ragSpy as any });
    const h = createZaloMessageHandler(deps);
    const r = await h(ev({}));
    expect(ragSpy).not.toHaveBeenCalled();
    expect(sent).toEqual(["het han muc"]);
    expect(r.replied).toBe(false);
  });

  it("record usage sau khi tra loi thanh cong", async () => {
    const rec = vi.fn();
    const { deps } = baseDeps({ recordUsage: rec as any });
    const h = createZaloMessageHandler(deps);
    await h(ev({}));
    expect(rec).toHaveBeenCalledTimes(1);
  });

  it("khong throw khi generateRAGAnswer loi", async () => {
    const { deps, sent } = baseDeps({ generateRAGAnswer: async () => { throw new Error("boom"); } });
    const h = createZaloMessageHandler(deps);
    const r = await h(ev({}));
    expect(r.replied).toBe(false);
    expect(sent).toEqual([]);
  });
});
