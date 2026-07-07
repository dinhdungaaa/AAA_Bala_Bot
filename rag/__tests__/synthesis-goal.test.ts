import { describe, it, expect } from "vitest";
import { buildGroundedPrompt } from "../synthesis.js";
import type { BotConfig } from "../../src/types.js";

const bot = { name: "Shop Test", field: "mỹ phẩm" } as BotConfig;
const passages = [{ chunk: { title: "Bảng giá", content: "Son A giá 200k" } }];
const base = { answerStyle: "sales" as const };

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

  it("goal consult → đi nhánh reference cũ, không có khối MỤC TIÊU", () => {
    const p = buildGroundedPrompt(bot, passages, {
      answerStyle: "reference", allowProductIntro: false, goal: "consult",
      intent: "hoi_gia", buyingSignal: "am",
      goalState: { isFirstTurn: false, hasContact: false, askedRecently: false },
    });
    expect(p).not.toContain("MỤC TIÊU");
    expect(p).toContain("KHÔNG bán hàng");
  });

  it("không truyền intent/goal (tương thích cũ) → vẫn build được prompt sales", () => {
    const p = buildGroundedPrompt(bot, passages, base);
    expect(p).toContain("Shop Test");
    expect(p).toContain("TÀI LIỆU");
  });

  it("có few-shot ví dụ giọng", () => {
    const p = buildGroundedPrompt(bot, passages, {
      ...base, goal: "lead", intent: "hoi_gia", buyingSignal: "am",
      goalState: { isFirstTurn: false, hasContact: false, askedRecently: false },
    });
    expect(p).toContain("VÍ DỤ");
  });
});
