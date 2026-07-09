// Helpers thuần cho widget chat nhúng website — không side effect, test được độc lập.

export function escapeWidgetHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// widgetKey rỗng/thiếu = tính năng đang TẮT → mọi request đều bị từ chối.
export function isValidWidgetKey(botKey: string | undefined, given: string | undefined): boolean {
  if (!botKey || !given) return false;
  return botKey === given;
}

export function isValidVisitorId(v: string | undefined): boolean {
  return !!v && /^[\w-]{6,64}$/.test(v);
}

export function clampWidgetText(text: unknown, max = 2000): string {
  if (typeof text !== "string") return "";
  return text.trim().slice(0, max);
}

const ALLOWED_SENDERS = new Set(["user", "bot", "agent"]);

export function filterMessagesAfter(
  messages: Array<{ sender: string; text: string; timestamp: string }>,
  after?: string
): Array<{ sender: string; text: string; timestamp: string }> {
  const afterMs = after ? new Date(after).getTime() : NaN;
  const filtered = (messages || []).filter(m =>
    ALLOWED_SENDERS.has(m.sender) &&
    (Number.isNaN(afterMs) || new Date(m.timestamp).getTime() > afterMs)
  );
  return filtered.slice(-50).map(m => ({ sender: m.sender, text: m.text, timestamp: m.timestamp }));
}

export const WIDGET_DEFAULT_COLOR = "#059669";
export const WIDGET_DEFAULT_GREETING = "Dạ em chào anh/chị! Anh/chị cần em tư vấn gì ạ? 😊";

export function resolveWidgetConfig(bot: {
  name: string; widgetColor?: string; widgetTitle?: string; widgetGreeting?: string;
}): { title: string; color: string; greeting: string } {
  const color = bot.widgetColor && /^#[0-9a-fA-F]{6}$/.test(bot.widgetColor)
    ? bot.widgetColor : WIDGET_DEFAULT_COLOR;
  return {
    title: (bot.widgetTitle || "").trim() || bot.name,
    color,
    greeting: (bot.widgetGreeting || "").trim() || WIDGET_DEFAULT_GREETING,
  };
}

export function buildEmbedSnippet(baseUrl: string, botId: string, key: string): string {
  return `<script src="${baseUrl}/api/widget/loader.js" data-bot="${botId}" data-key="${key}" async></script>`;
}
