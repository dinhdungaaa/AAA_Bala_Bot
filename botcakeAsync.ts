// Build request gọi Botcake Public API `send_content` — đẩy THẲNG nội dung câu trả
// lời của bot lại cho khách theo PSID (bất đồng bộ, không phụ thuộc timeout của
// Dynamic Block, KHÔNG cần flow trung gian hay custom field {{bot_reply}}).
// Tách khỏi server.ts để unit-test; server.ts dùng để fetch thật.

// Cắt text dài thành nhiều đoạn <= max ký tự (Messenger giới hạn ~2000/tin nhắn),
// ưu tiên cắt ở xuống dòng/khoảng trắng để không đứt câu.
export function splitContentText(text: string, max = 1800): string[] {
  const clean = (text || "").trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];
  const parts: string[] = [];
  let rest = clean;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n", max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(" ", max);
    if (cut < max * 0.5) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

export function buildSendContentRequest(opts: {
  pageId: string;
  accessToken: string;
  psid: string;
  text: string;
}): { url: string; headers: Record<string, string>; body: string } {
  const url = `https://botcake.io/api/public_api/v1/pages/${encodeURIComponent(opts.pageId)}/flows/send_content`;
  const headers = {
    "access-token": opts.accessToken,
    "Content-Type": "application/json",
  };
  const messages = splitContentText(opts.text).map(t => ({ type: "text", text: t }));
  const body = JSON.stringify({
    psid: opts.psid,
    data: { version: "v2", content: { messages } },
  });
  return { url, headers, body };
}
