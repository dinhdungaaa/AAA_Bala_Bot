import type { ZaloDeps, ZaloIncomingEvent } from "./types.js";
import type { ChatSession, Message } from "../src/types.js";
import { isBotMentioned, isReplyToBot, stripMention, MessageDedupe } from "./triggers.js";
import { RateLimiter } from "./rateLimiter.js";

function rid(prefix: string): string {
  return prefix + Math.random().toString(36).substr(2, 9);
}

export function createZaloMessageHandler(
  deps: ZaloDeps
): (event: ZaloIncomingEvent) => Promise<{ replied: boolean; reason?: string }> {
  const dedupe = new MessageDedupe();
  const limiter = new RateLimiter(deps.ratePerMin);

  return async function handle(event) {
    try {
      if (!event.text || !event.text.trim()) return { replied: false, reason: "non_text" };
      if (dedupe.seen(event.messageId)) return { replied: false, reason: "duplicate" };

      const binding = await deps.getBinding(event.groupId);
      if (!binding || !binding.enabled) return { replied: false, reason: "no_binding" };

      const botUid = deps.botUid() || "";
      const mentioned = isBotMentioned(event, botUid);
      const repliedToBot = isReplyToBot(event, deps.isBotMessageId);
      if (!mentioned && !repliedToBot) return { replied: false, reason: "not_addressed" };

      const bots = await deps.getBots();
      const bot = bots.find((b) => b.id === binding.bot_id);
      if (!bot) return { replied: false, reason: "bot_not_found" };

      if (!limiter.allow(event.groupId)) return { replied: false, reason: "rate_limited" };

      const question = stripMention(event.text, bot.name || "");
      if (!question) return { replied: false, reason: "empty_after_strip" };

      // Ngữ cảnh RIÊNG cho từng người trong nhóm: key theo (group + sender) thay vì chỉ group.
      // Nhờ vậy lịch sử/ngữ cảnh của mỗi khách tách biệt → bot hiểu đúng hoàn cảnh từng người
      // và gợi ý sản phẩm/dịch vụ phù hợp khi trả lời họ.
      const groupLabel = binding.group_name || `Nhóm ${event.groupId}`;
      const userKey = `zalo:${event.groupId}:${event.senderId}`;
      let session = deps.chatSessions.find((s) => s.botId === bot.id && s.telegramUserId === userKey);
      if (!session) {
        session = {
          id: "sess-zalo-" + rid(""),
          botId: bot.id,
          telegramUserId: userKey,
          telegramUsername: `zalo_${event.groupId}_${event.senderId}`,
          telegramFullName: `${event.senderName} · ${groupLabel}`,
          lastMessageText: question,
          lastMessageTime: new Date().toISOString(),
          status: "bot_answered",
          internalNotes: `Den tu nhom Zalo: ${groupLabel}`,
          messages: [],
        };
        deps.chatSessions.unshift(session);
        deps.analytics.totalUsers += 1;
      }

      const hasPriorBotReply = session.messages.some((m) => m.sender === "bot");
      const userMsg: Message = {
        id: rid("m-zalo-"),
        sender: "user",
        username: event.senderName,
        fullName: event.senderName,
        text: question,
        timestamp: new Date().toISOString(),
      };
      session.messages.push(userMsg);
      session.lastMessageText = question;
      session.lastMessageTime = userMsg.timestamp;

      const ai = await deps.generateRAGAnswer(
        bot,
        question,
        { fullName: event.senderName, username: event.senderName, id: event.senderId },
        { shouldGreet: !hasPriorBotReply, recentMessages: session.messages.slice(-8, -1) }
      );

      const botMsg: Message = {
        id: rid("m-zalo-bot-"),
        sender: "bot",
        username: bot.name,
        text: ai.text,
        timestamp: new Date().toISOString(),
        sourcesUsed: ai.sources,
        fallbackTriggered: ai.fallbackTriggered,
      };
      session.messages.push(botMsg);
      session.lastMessageText = ai.text;
      session.lastMessageTime = botMsg.timestamp;
      session.status = ai.fallbackTriggered ? "escalated" : "bot_answered";

      deps.analytics.totalMessages += 2;

      const sentId = await deps.send(event.groupId, ai.text);
      if (sentId) deps.rememberSentMessage(sentId);

      try {
        await deps.saveConversation(session);
      } catch (saveErr) {
        console.warn("[Zalo Handler] Skip Supabase save:", saveErr);
      }

      return { replied: true };
    } catch (err) {
      console.error("[Zalo Handler] Unexpected error (swallowed):", err);
      return { replied: false, reason: "error" };
    }
  };
}
