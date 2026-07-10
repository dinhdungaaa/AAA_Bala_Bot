import { describe, it, expect } from "vitest";
import {
  PLAN_PRICES, computeOrderAmount, generateOrderCode, extractOrderCode,
  buildSepayQrUrl, verifySepayApiKey, resolveNewExpiry, parseSepayWebhook,
  computeRevenueSummary,
} from "../sepay.js";

describe("computeOrderAmount", () => {
  it("thang nguyen gia", () => {
    expect(computeOrderAmount("starter", 1)).toBe(249000);
    expect(computeOrderAmount("pro", 1)).toBe(649000);
  });
  it("nam giam 20% lam tron nghin", () => {
    expect(computeOrderAmount("starter", 12)).toBe(2390000);
    expect(computeOrderAmount("pro", 12)).toBe(6230000);
  });
});

describe("generateOrderCode", () => {
  it("format BLB + 8 ky tu khong nham lan (khong I/L/O/0/1)", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOrderCode();
      expect(code).toMatch(/^BLB[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });
  it("hai lan sinh khac nhau (xac suat)", () => {
    expect(generateOrderCode()).not.toBe(generateOrderCode());
  });
});

describe("extractOrderCode", () => {
  it("tim thay ma trong noi dung ngan hang thuc te (hoa/thuong/dinh chu)", () => {
    expect(extractOrderCode("BLBK7M2P4Q9")).toBe("BLBK7M2P4Q9");
    expect(extractOrderCode("chuyen tien blbk7m2p4q9 thanh toan")).toBe("BLBK7M2P4Q9");
    expect(extractOrderCode("MBVCB.123.BLBK7M2P4Q9.CT tu 090")).toBe("BLBK7M2P4Q9");
  });
  it("round-trip: ma sinh ra luon extract lai duoc", () => {
    for (let i = 0; i < 20; i++) {
      const code = generateOrderCode();
      expect(extractOrderCode("MBVCB.123." + code.toLowerCase() + ".CT tu 090")).toBe(code);
    }
  });
  it("khong co ma -> null", () => {
    expect(extractOrderCode("chuyen khoan an trua")).toBeNull();
    expect(extractOrderCode("")).toBeNull();
    expect(extractOrderCode("BLB123")).toBeNull(); // thieu ky tu
  });
});

describe("buildSepayQrUrl", () => {
  it("dung host + encode tham so", () => {
    const url = buildSepayQrUrl({ account: "0011002 233", bank: "VPBank", amount: 249000, orderCode: "BLBK7M2P4Q9X" });
    expect(url).toBe("https://qr.sepay.vn/img?acc=0011002%20233&bank=VPBank&amount=249000&des=BLBK7M2P4Q9X");
  });
});

describe("verifySepayApiKey", () => {
  it("dung key + prefix Apikey moi qua (case-insensitive prefix)", () => {
    expect(verifySepayApiKey("Apikey secret123", "secret123")).toBe(true);
    expect(verifySepayApiKey("apikey secret123", "secret123")).toBe(true);
    expect(verifySepayApiKey("APIKEY secret123", "secret123")).toBe(true);
  });
  it("sai key / thieu header / thieu prefix / key rong -> false", () => {
    expect(verifySepayApiKey("Apikey wrong", "secret123")).toBe(false);
    expect(verifySepayApiKey(undefined, "secret123")).toBe(false);
    expect(verifySepayApiKey("Bearer secret123", "secret123")).toBe(false);
    expect(verifySepayApiKey("Apikey secret123", "")).toBe(false);
  });
});

describe("resolveNewExpiry", () => {
  const now = new Date("2026-07-10T00:00:00.000Z");
  const D = 24 * 60 * 60 * 1000;
  it("cung tier con han -> cong noi tu han cu", () => {
    const oldExp = new Date(now.getTime() + 10 * D).toISOString();
    const out = resolveNewExpiry({ currentTier: "starter", currentExpiresAt: oldExp, newTier: "starter", months: 1, now });
    expect(out).toBe(new Date(now.getTime() + 40 * D).toISOString());
  });
  it("cung tier HET han -> 30 ngay tu bay gio", () => {
    const oldExp = new Date(now.getTime() - 5 * D).toISOString();
    const out = resolveNewExpiry({ currentTier: "starter", currentExpiresAt: oldExp, newTier: "starter", months: 1, now });
    expect(out).toBe(new Date(now.getTime() + 30 * D).toISOString());
  });
  it("khac tier con han -> 30 ngay tu bay gio (khong cong noi)", () => {
    const oldExp = new Date(now.getTime() + 10 * D).toISOString();
    const out = resolveNewExpiry({ currentTier: "starter", currentExpiresAt: oldExp, newTier: "pro", months: 1, now });
    expect(out).toBe(new Date(now.getTime() + 30 * D).toISOString());
  });
  it("chua co goi + nam -> 360 ngay", () => {
    const out = resolveNewExpiry({ currentTier: null, currentExpiresAt: null, newTier: "pro", months: 12, now });
    expect(out).toBe(new Date(now.getTime() + 360 * D).toISOString());
  });
});

describe("parseSepayWebhook", () => {
  it("payload chuan SePay tien VAO", () => {
    const out = parseSepayWebhook({
      id: 92704, gateway: "Vietcombank", transactionDate: "2026-07-10 10:00:00",
      accountNumber: "0011002233", content: "BLBK7M2P4Q9X", transferType: "in",
      transferAmount: 249000, accumulated: 19077000, referenceCode: "MBVCB.123",
    });
    expect(out).toEqual({ txId: "92704", amount: 249000, content: "BLBK7M2P4Q9X", isIncoming: true });
  });
  it("tien RA -> isIncoming false", () => {
    const out = parseSepayWebhook({ id: 1, transferType: "out", transferAmount: 5000, content: "x" });
    expect(out?.isIncoming).toBe(false);
  });
  it("thieu id hoac amount -> null; body rac -> null", () => {
    expect(parseSepayWebhook({ transferType: "in", content: "x" })).toBeNull();
    expect(parseSepayWebhook(null)).toBeNull();
    expect(parseSepayWebhook("string")).toBeNull();
  });
});

describe("computeRevenueSummary", () => {
  const now = new Date("2026-07-15T05:00:00.000Z"); // 12:00 VN 15/7
  const o = (id: string, tier: string, months: number, amount: number, paidAtIso: string, email = "a@b.c") =>
    ({ id, email, tier, months, amount, paid_at: paidAtIso });

  it("mang rong -> so 0, monthly du 6 thang, growth null", () => {
    const r = computeRevenueSummary([], now);
    expect(r.totals).toEqual({ all: 0, thisMonth: 0, lastMonth: 0, growthPct: null });
    expect(r.monthly).toHaveLength(6);
    expect(r.monthly[0].ym).toBe("2026-02");
    expect(r.monthly[5]).toEqual({ ym: "2026-07", total: 0, orders: 0 });
    expect(r.byTier.starter).toEqual({ orders: 0, total: 0, monthly: 0, yearly: 0 });
    expect(r.recent).toEqual([]);
  });

  it("bien mui gio VN: 17:30 UTC 30/6 = 00:30 VN 1/7 -> tinh vao thang 7", () => {
    const r = computeRevenueSummary([o("BLB1", "starter", 1, 249000, "2026-06-30T17:30:00.000Z")], now);
    expect(r.totals.thisMonth).toBe(249000);
    expect(r.totals.lastMonth).toBe(0);
  });

  it("tong + growth binh thuong", () => {
    const r = computeRevenueSummary([
      o("BLB1", "starter", 1, 249000, "2026-07-02T03:00:00.000Z"),
      o("BLB2", "pro", 1, 649000, "2026-07-05T03:00:00.000Z"),
      o("BLB3", "starter", 1, 249000, "2026-06-10T03:00:00.000Z"),
    ], now);
    expect(r.totals.all).toBe(1147000);
    expect(r.totals.thisMonth).toBe(898000);
    expect(r.totals.lastMonth).toBe(249000);
    expect(r.totals.growthPct).toBe(260.6);
    const june = r.monthly.find(m => m.ym === "2026-06");
    expect(june).toEqual({ ym: "2026-06", total: 249000, orders: 1 });
  });

  it("byTier dem don + chu ky; tier la vao totals nhung khong vao byTier", () => {
    const r = computeRevenueSummary([
      o("BLB1", "starter", 1, 249000, "2026-07-02T03:00:00.000Z"),
      o("BLB2", "starter", 12, 2390000, "2026-07-03T03:00:00.000Z"),
      o("BLB3", "pro", 12, 6230000, "2026-07-04T03:00:00.000Z"),
      o("BLB4", "business", 1, 999000, "2026-07-05T03:00:00.000Z"),
    ], now);
    expect(r.byTier.starter).toEqual({ orders: 2, total: 2639000, monthly: 1, yearly: 1 });
    expect(r.byTier.pro).toEqual({ orders: 1, total: 6230000, monthly: 0, yearly: 1 });
    expect(r.totals.all).toBe(9868000);
  });

  it("recent: sap xep moi nhat truoc, cat 20, dung shape", () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      o(`BLB${i}`, "starter", 1, 1000 + i, new Date(Date.UTC(2026, 6, 1, i)).toISOString()));
    const r = computeRevenueSummary(many, now);
    expect(r.recent).toHaveLength(20);
    expect(r.recent[0].id).toBe("BLB24");
    expect(r.recent[0]).toEqual({ id: "BLB24", email: "a@b.c", tier: "starter", months: 1, amount: 1024, paidAt: new Date(Date.UTC(2026, 6, 1, 24)).toISOString() });
  });

  it("don thieu paid_at bi bo qua", () => {
    const r = computeRevenueSummary([{ id: "BLBX", tier: "starter", months: 1, amount: 249000, paid_at: null }], now);
    expect(r.totals.all).toBe(0);
    expect(r.recent).toEqual([]);
  });
});
