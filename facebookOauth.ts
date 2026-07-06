import crypto from "node:crypto";

// Helpers thuần cho luồng OAuth kết nối Fanpage Facebook (1 app chung của BalaBot).
// Tách khỏi server.ts để unit-test được (pattern như billing.ts).

const STATE_TTL_MS = 10 * 60 * 1000;

export type OAuthStatePayload = { botId: string; ts: number; nonce: string };

function hmacBase64Url(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

// state = base64url(JSON payload) + "." + HMAC — chống CSRF, mang botId qua vòng OAuth.
export function signOAuthState(botId: string, secret: string, now = Date.now()): string {
  const payload: OAuthStatePayload = { botId, ts: now, nonce: crypto.randomBytes(8).toString("hex") };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmacBase64Url(body, secret)}`;
}

export function verifyOAuthState(state: string, secret: string, now = Date.now()): OAuthStatePayload | null {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig) return null;
  const expected = hmacBase64Url(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthStatePayload;
    if (!payload?.botId || typeof payload.ts !== "number") return null;
    if (now - payload.ts > STATE_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildOAuthDialogUrl(opts: { appId: string; redirectUri: string; state: string; graphVersion: string }): string {
  const p = new URLSearchParams({
    client_id: opts.appId,
    redirect_uri: opts.redirectUri,
    state: opts.state,
    response_type: "code",
    scope: "pages_show_list,pages_messaging,pages_manage_metadata",
  });
  return `https://www.facebook.com/${opts.graphVersion}/dialog/oauth?${p.toString()}`;
}

// Verify chữ ký webhook Meta (X-Hub-Signature-256 = "sha256=<hex hmac của raw body>").
export function verifyFacebookSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!rawBody || !signatureHeader) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Webhook app-level: 1 request có thể chứa event của nhiều Page → gom theo entry[].id.
export function groupMessagingEventsByPage(body: any): Array<{ pageId: string; events: any[] }> {
  if (body?.object !== "page") return [];
  const out: Array<{ pageId: string; events: any[] }> = [];
  for (const entry of body?.entry || []) {
    const pageId = String(entry?.id || "");
    const events = Array.isArray(entry?.messaging) ? entry.messaging : [];
    if (pageId && events.length) out.push({ pageId, events });
  }
  return out;
}

export function randomToken(bytes = 12): string {
  return crypto.randomBytes(bytes).toString("hex");
}

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Trang kết quả trong popup: postMessage về dashboard rồi tự đóng.
export function renderOAuthResultHtml(opts: { success: boolean; message: string; pageName?: string }): string {
  const payload = JSON.stringify({
    type: "balabot-facebook-connected",
    success: opts.success,
    pageName: opts.pageName || "",
    message: opts.message,
  }).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>BalaBot — Kết nối Facebook</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:90vh;background:#f8fafc;margin:0">
<div style="max-width:420px;text-align:center;padding:24px">
<h2 style="color:${opts.success ? "#059669" : "#e11d48"};font-size:20px">${opts.success ? "✅ Kết nối thành công" : "⚠️ Chưa kết nối được"}</h2>
<p style="color:#334155;font-size:14px;line-height:1.6">${escapeHtml(opts.message)}</p>
<p style="color:#94a3b8;font-size:12px">Cửa sổ sẽ tự đóng…</p>
</div>
<script>try{window.opener&&window.opener.postMessage(${payload},"*")}catch(e){}setTimeout(function(){window.close()},${opts.success ? 1800 : 6000});</script>
</body></html>`;
}

// Trang chọn Page khi tài khoản quản lý nhiều Fanpage.
export function renderPageSelectionHtml(opts: {
  selectionId: string;
  pages: Array<{ id: string; name: string }>;
  actionPath: string;
}): string {
  const items = opts.pages
    .map(
      (p, i) => `<label style="display:flex;gap:10px;align-items:center;padding:12px;border:1px solid #e2e8f0;border-radius:10px;cursor:pointer;background:#fff">
<input type="radio" name="pageId" value="${escapeHtml(p.id)}" ${i === 0 ? "checked" : ""}>
<span style="font-size:14px;color:#0f172a;font-weight:600">${escapeHtml(p.name)}</span>
<span style="font-size:11px;color:#94a3b8;margin-left:auto">${escapeHtml(p.id)}</span>
</label>`
    )
    .join("\n");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>BalaBot — Chọn Fanpage</title></head>
<body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:24px">
<div style="max-width:460px;margin:0 auto">
<h2 style="font-size:18px;color:#0f172a">Chọn Fanpage muốn kết nối với bot</h2>
<form method="POST" action="${escapeHtml(opts.actionPath)}" style="display:flex;flex-direction:column;gap:10px">
<input type="hidden" name="selectionId" value="${escapeHtml(opts.selectionId)}">
${items}
<button type="submit" style="padding:12px;background:#059669;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer">Kết nối Fanpage này</button>
</form>
</div>
</body></html>`;
}
