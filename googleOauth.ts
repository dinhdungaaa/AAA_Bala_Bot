import crypto from "node:crypto";

// Helpers thuần cho luồng đăng nhập dashboard bằng Google (OAuth code flow ở server).
// Tách khỏi server.ts để unit-test được (pattern như facebookOauth.ts). Không gọi mạng
// trong module — server lo fetch JWKS + đổi code lấy token; ở đây chỉ ký/verify state,
// dựng URL consent và verify id_token với bộ khóa (certs) truyền vào.

const STATE_TTL_MS = 10 * 60 * 1000;

// pb = public base URL của app (vd https://antiantiai.xyz/balabot) — mang qua vòng OAuth
// để /callback dựng lại ĐÚNG redirect_uri + origin postMessage, không phụ thuộc header
// (qua proxy Cloudflare, header host bị Railway ghi đè thành domain nội bộ).
export type GoogleStatePayload = { ts: number; nonce: string; pb?: string };

function hmacBase64Url(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

// state = base64url(JSON payload) + "." + HMAC — chống CSRF cho vòng OAuth đăng nhập.
export function signGoogleState(secret: string, publicBase = "", now = Date.now()): string {
  const payload: GoogleStatePayload = { ts: now, nonce: crypto.randomBytes(8).toString("hex"), pb: publicBase || undefined };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmacBase64Url(body, secret)}`;
}

export function verifyGoogleState(state: string, secret: string, now = Date.now()): GoogleStatePayload | null {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig) return null;
  const expected = hmacBase64Url(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as GoogleStatePayload;
    if (typeof payload.ts !== "number") return null;
    if (now - payload.ts > STATE_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

// Lọc GOOGLE_CLIENT_ID owner dán vào env: bỏ khoảng trắng, dấu ngoặc, và tiền tố
// http(s):// dán nhầm (nguyên nhân lỗi invalid_client "OAuth client was not found").
export function cleanGoogleClientId(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/^[<"']+|[>"'/]+$/g, "")
    .replace(/^https?:\/\//i, "")
    .trim();
}

export function buildGoogleAuthUrl(opts: { clientId: string; redirectUri: string; state: string }): string {
  const p = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: opts.state,
    access_type: "online",
    // Luôn cho người dùng chọn tài khoản Google (tránh auto-đăng-nhập nhầm account).
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export type JwtHeader = { alg?: string; kid?: string; typ?: string };
export type GoogleIdClaims = {
  iss?: string;
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  exp?: number;
  [k: string]: unknown;
};

// Tách JWT thành {header, payload} đã decode (KHÔNG verify chữ ký). Trả null nếu sai định dạng.
export function parseJwt(idToken: string): { header: JwtHeader; payload: GoogleIdClaims; signingInput: string; signature: Buffer } | null {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  if (!h || !p || !s) return null;
  try {
    const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8")) as JwtHeader;
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as GoogleIdClaims;
    return { header, payload, signingInput: `${h}.${p}`, signature: Buffer.from(s, "base64url") };
  } catch {
    return null;
  }
}

// Tiện cho test/caller chỉ cần payload.
export function parseJwtPayload(idToken: string): GoogleIdClaims | null {
  return parseJwt(idToken)?.payload || null;
}

export type GoogleJwk = { kid: string; n: string; e: string; kty?: string; alg?: string; use?: string };

const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

// Verify id_token của Google: RS256 bằng JWKS (certs), rồi kiểm iss/aud/exp/email_verified.
// certs: mảng JWK lấy từ https://www.googleapis.com/oauth2/v3/certs (server fetch, truyền vào).
// Trả claims chuẩn hóa hoặc null nếu bất kỳ điều kiện nào không đạt.
export function verifyGoogleIdToken(
  idToken: string,
  opts: { clientId: string; certs: GoogleJwk[]; now?: number }
): { email: string; name: string; sub: string } | null {
  const now = opts.now ?? Date.now();
  const parsed = parseJwt(idToken);
  if (!parsed) return null;
  const { header, payload, signingInput, signature } = parsed;
  if (header.alg !== "RS256" || !header.kid) return null;

  const jwk = (opts.certs || []).find(k => k.kid === header.kid);
  if (!jwk || !jwk.n || !jwk.e) return null;

  let ok = false;
  try {
    const key = crypto.createPublicKey({ key: { kty: "RSA", n: jwk.n, e: jwk.e }, format: "jwk" } as any);
    ok = crypto.verify("RSA-SHA256", Buffer.from(signingInput), key, signature);
  } catch {
    return null;
  }
  if (!ok) return null;

  if (!payload.iss || !GOOGLE_ISSUERS.has(String(payload.iss))) return null;
  if (payload.aud !== opts.clientId) return null;
  if (typeof payload.exp !== "number" || now >= payload.exp * 1000) return null;
  const verified = payload.email_verified === true || payload.email_verified === "true";
  if (!verified) return null;
  const email = String(payload.email || "").trim().toLowerCase();
  if (!email) return null;

  return { email, name: String(payload.name || "").trim(), sub: String(payload.sub || "") };
}

function escapeHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Trang kết quả trong popup: postMessage token về dashboard rồi tự đóng.
// targetOrigin: origin của app (KHÔNG dùng "*") để không lộ session token cho tab khác.
export function renderGoogleAuthResultHtml(opts: {
  success: boolean;
  message: string;
  targetOrigin: string;
  data?: { sessionToken: string; configToken?: string; user: { id: string; email: string } };
}): string {
  const payload = JSON.stringify({
    type: "balabot-google-auth",
    success: opts.success,
    message: opts.message,
    ...(opts.data || {}),
  }).replace(/</g, "\\u003c");
  const origin = JSON.stringify(opts.targetOrigin || "*");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>BalaBot — Đăng nhập Google</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:90vh;background:#f8fafc;margin:0">
<div style="max-width:420px;text-align:center;padding:24px">
<h2 style="color:${opts.success ? "#059669" : "#e11d48"};font-size:20px">${opts.success ? "✅ Đăng nhập thành công" : "⚠️ Chưa đăng nhập được"}</h2>
<p style="color:#334155;font-size:14px;line-height:1.6">${escapeHtml(opts.message)}</p>
<p style="color:#94a3b8;font-size:12px">Cửa sổ sẽ tự đóng…</p>
</div>
<script>try{window.opener&&window.opener.postMessage(${payload},${origin})}catch(e){}setTimeout(function(){window.close()},${opts.success ? 900 : 6000});</script>
</body></html>`;
}
