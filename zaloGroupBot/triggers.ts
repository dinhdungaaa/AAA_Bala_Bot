import type { ZaloIncomingEvent } from "./types.js";

export function isBotMentioned(event: ZaloIncomingEvent, botUid: string): boolean {
  if (!botUid) return false;
  return event.mentionedUids.includes(botUid);
}

export function isReplyToBot(
  event: ZaloIncomingEvent,
  isBotMessageId: (id: string) => boolean
): boolean {
  if (!event.quotedMessageId) return false;
  return isBotMessageId(event.quotedMessageId);
}

export function stripMention(text: string, botName: string): string {
  if (!text) return "";
  let out = text;
  if (botName) {
    const escaped = botName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`@${escaped}\\b`, "gi"), " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

export class MessageDedupe {
  private set = new Set<string>();
  seen(id: string): boolean {
    if (this.set.has(id)) return true;
    this.set.add(id);
    if (this.set.size > 1000) {
      const oldest = this.set.values().next().value;
      if (oldest) this.set.delete(oldest);
    }
    return false;
  }
}
