import { describe, it, expect } from "vitest";
import { buildGroundedPrompt } from "../synthesis.js";
import type { BotConfig } from "../../src/types.js";

const bot = { name: "Shop Test", field: "mỹ phẩm" } as BotConfig;
const passages = [{ chunk: { title: "Bảng giá", content: "Son A giá 200k" } }];
const base = { answerStyle: "sales" as const };

describe("buildGroundedPrompt — tài liệu trống", () => {
  it("passages rỗng → có rule cấm suy đoán từ tên bot; có passages → không", () => {
    const empty = buildGroundedPrompt(bot, [], {
      ...base, goal: "lead", intent: "chit_chat", buyingSignal: "lanh",
      goalState: { isFirstTurn: true, hasContact: false, askedRecently: false },
    });
    expect(empty).toContain("TÀI LIỆU ĐANG TRỐNG");
    expect(empty).toMatch(/KHÔNG suy đoán .*tên bot/i);

    const withDocs = buildGroundedPrompt(bot, passages, {
      ...base, goal: "lead", intent: "chit_chat", buyingSignal: "lanh",
      goalState: { isFirstTurn: true, hasContact: false, askedRecently: false },
    });
    expect(withDocs).not.toContain("TÀI LIỆU ĐANG TRỐNG");
  });
});

describe("buildGroundedPrompt — goal-driven", () => {
  it("goal lead + buyingSignal am → có khối mục tiêu mời liên hệ", () => {
    const p = buildGroundedPrompt(bot, passages, {
      ...base, goal: "lead", intent: "hoi_gia", buyingSignal: "am",
      goalState: { isFirstTurn: false, hasContact: false, askedRecently: false },
    });
    expect(p).toContain("MỤC TIÊU");
    expect(p).toMatch(/liên hệ|số điện thoại/i);
  });

  it("goalState.hasContact=true → cấm xin lại liên hệ", () => {
    const p = buildGroundedPrompt(bot, passages, {
      ...base, goal: "lead", intent: "hoi_san_pham", buyingSignal: "am",
      goalState: { isFirstTurn: false, hasContact: true, askedRecently: false },
    });
    expect(p).toMatch(/KHÔNG.*(xin|hỏi).*(lại|thêm).*(liên hệ|số)/i);
  });

  it("askedRecently=true hoặc isFirstTurn=true → cấm mời lượt này", () => {
    for (const gs of [
      { isFirstTurn: true, hasContact: false, askedRecently: false },
      { isFirstTurn: false, hasContact: false, askedRecently: true },
    ]) {
      const p = buildGroundedPrompt(bot, passages, { ...base, goal: "lead", intent: "khac", buyingSignal: "lanh", goalState: gs });
      expect(p).toMatch(/KHÔNG (mời|xin)/i);
    }
  });

  it("goal order + tin_hieu_mua → hướng dẫn chốt từng bước", () => {
    const p = buildGroundedPrompt(bot, passages, {
      ...base, goal: "order", intent: "tin_hieu_mua", buyingSignal: "nong",
      goalState: { isFirstTurn: false, hasContact: false, askedRecently: false },
    });
    expect(p).toMatch(/số lượng/i);
    expect(p).toMatch(/địa chỉ/i);
  });

  it("intent phan_nan → có hướng dẫn xoa dịu", () => {
    const p = buildGroundedPrompt(bot, passages, {
      ...base, goal: "lead", intent: "phan_nan", buyingSignal: "lanh",
      goalState: { isFirstTurn: false, hasContact: false, askedRecently: false },
    });
    expect(p).toMatch(/xoa dịu|nhận lỗi/i);
  });

  it("phan_nan + buyingSignal am → KHÔNG mời để lại số (chống prompt tự mâu thuẫn)", () => {
    const p = buildGroundedPrompt(bot, passages, {
      ...base, goal: "lead", intent: "phan_nan", buyingSignal: "am",
      goalState: { isFirstTurn: false, hasContact: false, askedRecently: false },
    });
    expect(p).toMatch(/KHÔNG (mời|xin)/i);
    expect(p).not.toContain("mời khách để lại số điện thoại");
  });

  it("cung_cap_lien_he (hasContact còn false) → chỉ cảm ơn + xác nhận, KHÔNG xin lại", () => {
    const p = buildGroundedPrompt(bot, passages, {
      ...base, goal: "lead", intent: "cung_cap_lien_he", buyingSignal: "am",
      goalState: { isFirstTurn: false, hasContact: false, askedRecently: false },
    });
    expect(p).toMatch(/KHÔNG (mời|xin)/i);
    expect(p).not.toContain("mời khách để lại số điện thoại");
    expect(p).toMatch(/cảm ơn.*xác nhận/i);
  });

  it("goal consult → đi nhánh reference cũ, không có khối MỤC TIÊU", () => {
    const p = buildGroundedPrompt(bot, passages, {
      answerStyle: "reference", allowProductIntro: false, goal: "consult",
      intent: "hoi_gia", buyingSignal: "am",
      goalState: { isFirstTurn: false, hasContact: false, askedRecently: false },
    });
    expect(p).not.toContain("MỤC TIÊU");
    expect(p).toContain("KHÔNG bán hàng");
  });

  it("không truyền intent/goal + answerStyle sales → goal-driven mặc định lead (có MỤC TIÊU)", () => {
    const p = buildGroundedPrompt(bot, passages, base);
    expect(p).toContain("Shop Test");
    expect(p).toContain("TÀI LIỆU");
    expect(p).toContain("MỤC TIÊU");
  });

  it("goal consult + answerStyle sales → consult thắng: KHÔNG bán hàng, không MỤC TIÊU", () => {
    const p = buildGroundedPrompt(bot, passages, {
      answerStyle: "sales", goal: "consult",
      intent: "hoi_gia", buyingSignal: "am",
      goalState: { isFirstTurn: false, hasContact: false, askedRecently: false },
    });
    expect(p).toContain("KHÔNG bán hàng");
    expect(p).not.toContain("MỤC TIÊU");
  });

  it("có few-shot ví dụ giọng", () => {
    const p = buildGroundedPrompt(bot, passages, {
      ...base, goal: "lead", intent: "hoi_gia", buyingSignal: "am",
      goalState: { isFirstTurn: false, hasContact: false, askedRecently: false },
    });
    expect(p).toContain("VÍ DỤ");
  });
});
