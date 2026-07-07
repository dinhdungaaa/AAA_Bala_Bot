import type { Lead } from "./src/types.js";

// userKey các kênh: "botcake:<psid>", "fb:<psid>", Telegram = id số trần.
export function channelFromUserKey(userKey?: string): string {
  if (!userKey) return "web";
  const i = userKey.indexOf(":");
  if (i > 0) return userKey.slice(0, i);
  return "telegram";
}

export function formatLeadNotify(lead: Lead): string {
  const lines = [
    "🔥 LEAD MỚI từ bot!",
    lead.name ? `👤 Tên: ${lead.name}` : null,
    `📞 SĐT: ${lead.phone}`,
    lead.interest ? `🛍️ Quan tâm: ${lead.interest}` : null,
    lead.channel ? `📡 Kênh: ${lead.channel}` : null,
    "→ Gọi lại sớm để chốt nhé!",
  ].filter(Boolean);
  return lines.join("\n");
}
