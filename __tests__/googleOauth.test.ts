import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import {
  signGoogleState, verifyGoogleState, buildGoogleAuthUrl,
  parseJwtPayload, verifyGoogleIdToken, type GoogleJwk,
} from "../googleOauth.js";

const SECRET = "test-secret";
const CLIENT_ID = "123.apps.googleusercontent.com";

describe("Google OAuth state", () => {
  it("ký rồi verify được", () => {
    const state = signGoogleState(SECRET);
    expect(verifyGoogleState(state, SECRET)).not.toBeNull();
  });

  it("từ chối sai secret", () => {
    const state = signGoogleState("other");
    expect(verifyGoogleState(state, SECRET)).toBeNull();
  });

  it("từ chối quá 10 phút", () => {
    const past = Date.now() - 11 * 60 * 1000;
    expect(verifyGoogleState(signGoogleState(SECRET, past), SECRET)).toBeNull();
  });

  it("từ chối chuỗi rác", () => {
    expect(verifyGoogleState("nope", SECRET)).toBeNull();
    expect(verifyGoogleState("", SECRET)).toBeNull();
  });
});

describe("buildGoogleAuthUrl", () => {
  it("chứa client_id, redirect_uri, scope openid email profile, state", () => {
    const url = buildGoogleAuthUrl({ clientId: CLIENT_ID, redirectUri: "https://x/cb", state: "st" });
    expect(url).toContain("accounts.google.com/o/oauth2/v2/auth");
    expect(url).toContain(`client_id=${encodeURIComponent(CLIENT_ID)}`);
    expect(url).toContain("redirect_uri=https%3A%2F%2Fx%2Fcb");
    expect(url).toContain("scope=openid+email+profile");
    expect(url).toContain("state=st");
  });
});

describe("parseJwtPayload", () => {
  it("trả null với định dạng sai", () => {
    expect(parseJwtPayload("abc")).toBeNull();
    expect(parseJwtPayload("a.b")).toBeNull();
    expect(parseJwtPayload("")).toBeNull();
  });
});

// ==== verifyGoogleIdToken với cặp khóa RSA test (tự ký id_token giả lập Google) ====
function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function makeIdToken(claims: Record<string, unknown>, privateKey: crypto.KeyObject, kid: string): string {
  const header = b64url(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const payload = b64url(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  const sig = crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey);
  return `${signingInput}.${b64url(sig)}`;
}

describe("verifyGoogleIdToken", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwkPub = publicKey.export({ format: "jwk" }) as any;
  const KID = "test-kid-1";
  const certs: GoogleJwk[] = [{ kid: KID, n: jwkPub.n, e: jwkPub.e, kty: "RSA", alg: "RS256" }];
  const base = {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "google-sub-123",
    email: "User@Gmail.com",
    email_verified: true,
    name: "User Name",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  it("token hợp lệ → trả email (lowercase), name, sub", () => {
    const tok = makeIdToken(base, privateKey, KID);
    const r = verifyGoogleIdToken(tok, { clientId: CLIENT_ID, certs });
    expect(r).toEqual({ email: "user@gmail.com", name: "User Name", sub: "google-sub-123" });
  });

  it("sai aud → null", () => {
    const tok = makeIdToken({ ...base, aud: "someone-else" }, privateKey, KID);
    expect(verifyGoogleIdToken(tok, { clientId: CLIENT_ID, certs })).toBeNull();
  });

  it("email_verified=false → null", () => {
    const tok = makeIdToken({ ...base, email_verified: false }, privateKey, KID);
    expect(verifyGoogleIdToken(tok, { clientId: CLIENT_ID, certs })).toBeNull();
  });

  it("hết hạn → null", () => {
    const tok = makeIdToken({ ...base, exp: Math.floor(Date.now() / 1000) - 10 }, privateKey, KID);
    expect(verifyGoogleIdToken(tok, { clientId: CLIENT_ID, certs })).toBeNull();
  });

  it("iss lạ → null", () => {
    const tok = makeIdToken({ ...base, iss: "https://evil.com" }, privateKey, KID);
    expect(verifyGoogleIdToken(tok, { clientId: CLIENT_ID, certs })).toBeNull();
  });

  it("không tìm thấy kid trong certs → null", () => {
    const tok = makeIdToken(base, privateKey, "unknown-kid");
    expect(verifyGoogleIdToken(tok, { clientId: CLIENT_ID, certs })).toBeNull();
  });

  it("chữ ký sai (khóa khác) → null", () => {
    const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const tok = makeIdToken(base, other.privateKey, KID); // ký bằng khóa khác nhưng kid trùng
    expect(verifyGoogleIdToken(tok, { clientId: CLIENT_ID, certs })).toBeNull();
  });
});
