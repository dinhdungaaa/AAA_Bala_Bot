import { describe, it, expect } from "vitest";
import { isBotMentioned, isReplyToBot, stripMention, MessageDedupe } from "../triggers.js";
import type { ZaloIncomingEvent } from "../types.js";

function ev(p: Partial<ZaloIncomingEvent>): ZaloIncomingEvent {
  return { groupId: "g1", messageId: "m1", senderId: "u1", senderName: "Khach",
    text: "", mentionedUids: [], ...p };
}

describe("isBotMentioned", () => {
  it("true khi botUid nam trong mentionedUids", () => {
    expect(isBotMentioned(ev({ mentionedUids: ["bot99", "u2"] }), "bot99")).toBe(true);
  });
  it("false khi khong duoc nhac", () => {
    expect(isBotMentioned(ev({ mentionedUids: ["u2"] }), "bot99")).toBe(false);
  });
});

describe("isReplyToBot", () => {
  it("true khi quotedMessageId la tin cua bot", () => {
    expect(isReplyToBot(ev({ quotedMessageId: "b1" }), (id) => id === "b1")).toBe(true);
  });
  it("false khi khong reply", () => {
    expect(isReplyToBot(ev({}), () => true)).toBe(false);
  });
  it("false khi reply vao tin nguoi khac", () => {
    expect(isReplyToBot(ev({ quotedMessageId: "x9" }), (id) => id === "b1")).toBe(false);
  });
});

describe("stripMention", () => {
  it("xoa @ten-bot o dau cau", () => {
    expect(stripMention("@BalaBot gia bao nhieu?", "BalaBot")).toBe("gia bao nhieu?");
  });
  it("giu nguyen neu khong co mention", () => {
    expect(stripMention("gia bao nhieu?", "BalaBot")).toBe("gia bao nhieu?");
  });
});

describe("MessageDedupe", () => {
  it("lan dau false, lan sau true", () => {
    const d = new MessageDedupe();
    expect(d.seen("a")).toBe(false);
    expect(d.seen("a")).toBe(true);
  });
});
