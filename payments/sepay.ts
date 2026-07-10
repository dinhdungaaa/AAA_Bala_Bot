// Logic thuần cho thanh toán SePay — không side effect, test độc lập.
import crypto from "node:crypto";

export const PLAN_PRICES: Record<"starter" | "pro", number> = {
  starter: 249000,
  pro: 649000,
};

export function computeOrderAmount(tier: "starter" | "pro", months: 1 | 12): number {
  const base = PLAN_PRICES[tier];
  if (months === 12) return Math.round((base * 12 * 0.8) / 1000) * 1000; // tra nam -20%, tron nghin
  return base;
}

// Bo I/L/O/0/1 de song sot viec ngan hang viet hoa/doc nham noi dung CK.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateOrderCode(): string {
  let s = "BLB";
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return s;
}

// Regex RONG hon bang sinh ma co chu dich: ma sinh ra luon khop; chuoi la khop
// nham chi dan toi "khong tim thay don" -> roi vao giao dich lac, vo hai.
export function extractOrderCode(content: string): string | null {
  const m = String(content || "").toUpperCase().match(/BLB[A-Z0-9]{8}/);
  return m ? m[0] : null;
}

export function buildSepayQrUrl(opts: { account: string; bank: string; amount: number; orderCode: string }): string {
  return `https://qr.sepay.vn/img?acc=${encodeURIComponent(opts.account)}&bank=${encodeURIComponent(opts.bank)}&amount=${encodeURIComponent(String(opts.amount))}&des=${encodeURIComponent(opts.orderCode)}`;
}

export function verifySepayApiKey(authorizationHeader: string | undefined, expectedKey: string): boolean {
  if (!authorizationHeader || !expectedKey) return false;
  const m = authorizationHeader.match(/^apikey\s+(.+)$/i);
  if (!m) return false;
  const given = Buffer.from(m[1].trim());
  const expected = Buffer.from(expectedKey);
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(given, expected);
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Cung tier con han -> cong noi tu han cu; con lai -> tinh tu bay gio.
export function resolveNewExpiry(opts: {
  currentTier?: string | null;
  currentExpiresAt?: string | null;
  newTier: string;
  months: number;
  now?: Date;
}): string {
  const now = opts.now ? opts.now.getTime() : Date.now();
  let base = now;
  if (opts.currentTier === opts.newTier && opts.currentExpiresAt) {
    const oldExp = new Date(opts.currentExpiresAt).getTime();
    if (!Number.isNaN(oldExp) && oldExp > now) base = oldExp;
  }
  return new Date(base + opts.months * 30 * DAY_MS).toISOString();
}

export function parseSepayWebhook(body: unknown): { txId: string; amount: number; content: string; isIncoming: boolean } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.id === undefined || b.id === null) return null;
  const amount = Number(b.transferAmount);
  if (!Number.isFinite(amount)) return null;
  return {
    txId: String(b.id),
    amount,
    content: String(b.content ?? ""),
    isIncoming: String(b.transferType ?? "") === "in",
  };
}
