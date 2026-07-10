import { describe, it, expect } from "vitest";
import {
  PLAN_PRICES, computeOrderAmount, generateOrderCode, extractOrderCode,
  buildSepayQrUrl, verifySepayApiKey, resolveNewExpiry, parseSepayWebhook,
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
    expect(extractOrderCode("BLBK7M2P4Q9X")).toBe("BLBK7M2P4Q9X");
    expect(extractOrderCode("chuyen tien blbk7m2p4q9x thanh toan")).toBe("BLBK7M2P4Q9X");
    expect(extractOrderCode("MBVCB.123.BLBK7M2P4Q9X.CT tu 090")).toBe("BLBK7M2P4Q9X");
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
