// Helpers thuần cho kênh Botcake Bridge: Botcake (app Meta đã duyệt) gọi API BalaBot
// qua Dynamic Block, BalaBot trả JSON dạng Chatfuel để Botcake gửi cho khách.
// Tách khỏi server.ts để unit-test được (pattern như billing.ts).

export type BridgePayload = { text: string; psid: string; fullName: string };

function asCleanString(v: any): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v).trim();
  return "";
}

function firstNonEmpty(...values: any[]): string {
  for (const v of values) {
    const s = asCleanString(v);
    if (s) return s;
  }
  return "";
}

// Tên biến trong Dynamic Block của Botcake có thể khác tài liệu → nhận nhiều tên trường.
export function parseBridgePayload(body: any): BridgePayload {
  const b = body && typeof body === "object" ? body : {};
  const text = firstNonEmpty(b.text, b.message, b.last_input, b.last_user_input);
  const psid = firstNonEmpty(b.psid, b.sender_id, b.messenger_user_id, b.user_id);
  const joined = [asCleanString(b.first_name), asCleanString(b.last_name)].filter(Boolean).join(" ");
  const fullName = firstNonEmpty(b.name, b.full_name, joined);
  return { text, psid, fullName };
}

// Messenger giới hạn ~2000 ký tự/tin → cắt tại ranh giới đoạn/câu, mỗi phần <= max.
export function splitBridgeText(text: string, max = 1800): string[] {
  const clean = (text || "").trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];

  const parts: string[] = [];
  let rest = clean;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    // Ưu tiên: 2 xuống dòng > 1 xuống dòng > kết câu > khoảng trắng > cắt cứng.
    let cut = window.lastIndexOf("\n\n");
    if (cut < max * 0.4) cut = window.lastIndexOf("\n");
    if (cut < max * 0.4) {
      const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
      if (sentence >= max * 0.4) cut = sentence + 1;
    }
    if (cut < max * 0.4) cut = window.lastIndexOf(" ");
    if (cut < max * 0.4) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts.filter(Boolean);
}

export function buildBridgeResponse(text: string): { messages: Array<{ text: string }> } {
  return { messages: splitBridgeText(text).map(t => ({ text: t })) };
}
