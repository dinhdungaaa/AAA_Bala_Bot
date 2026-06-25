import { describe, it, expect } from "vitest";
import { buildGroundedPrompt } from "../synthesis.js";
import type { BotConfig, KnowledgeChunk } from "../../src/types.js";

const bot = { id: "b1", name: "Shop AAA", field: "nông sản" } as BotConfig;
const passages = [
  { chunk: { title: "Giá rau", content: "Súp lơ 45k/kg, giao 2h nội thành." } as KnowledgeChunk },
];

describe("buildGroundedPrompt", () => {
  it("chua noi dung doan + luat cam copy nguyen van", () => {
    const p = buildGroundedPrompt(bot, passages, { answerStyle: "sales" });
    expect(p).toContain("Súp lơ 45k/kg");
    expect(p.toLowerCase()).toMatch(/không.*nguyên văn|cấm.*sao chép|diễn giải/);
  });
  it("doi giong theo answerStyle", () => {
    const sales = buildGroundedPrompt(bot, passages, { answerStyle: "sales" });
    const ref = buildGroundedPrompt(bot, passages, { answerStyle: "reference" });
    expect(sales).not.toBe(ref);
    expect(sales.toLowerCase()).toMatch(/bán|chốt|tư vấn|CTA/i);
    expect(ref.toLowerCase()).toMatch(/trung lập|khách quan|súc tích/);
  });
  it("khong co doan -> yeu cau noi chua co thong tin", () => {
    const p = buildGroundedPrompt(bot, [], { answerStyle: "reference" });
    expect(p.toLowerCase()).toMatch(/chưa có thông tin|không có trong tài liệu/);
  });

  it("co ten that -> chen ten + chi dan xung ho tu nhien", () => {
    const p = buildGroundedPrompt(bot, passages, {
      answerStyle: "sales",
      customer: { lead: "Anh Dũng", hasRealName: true },
    });
    expect(p).toContain("Anh Dũng");
    expect(p.toLowerCase()).toMatch(/tự nhiên/);
    expect(p).toMatch(/KHÔNG lặp tên/);
  });

  it("vo danh -> dung 'minh', khong bia ten", () => {
    const p = buildGroundedPrompt(bot, passages, {
      answerStyle: "sales",
      customer: { lead: "mình", hasRealName: false },
    });
    expect(p).toMatch(/KHÔNG bịa ra tên/);
    expect(p).not.toContain("Anh Dũng");
  });

  it("co history -> chen block hoi thoai", () => {
    const p = buildGroundedPrompt(bot, passages, {
      answerStyle: "sales",
      history: [
        { role: "user", text: "xà lách thủy canh còn không" },
        { role: "bot", text: "Dạ còn ạ" },
      ],
    });
    expect(p).toContain("HỘI THOẠI GẦN ĐÂY");
    expect(p).toContain("Khách: xà lách thủy canh còn không");
    expect(p).toContain("Bạn: Dạ còn ạ");
  });

  it("khong customer + khong history -> giong base prompt", () => {
    const base = buildGroundedPrompt(bot, passages, { answerStyle: "sales" });
    const withEmpty = buildGroundedPrompt(bot, passages, { answerStyle: "sales", history: [] });
    expect(withEmpty).toBe(base);
    expect(base).not.toContain("HỘI THOẠI GẦN ĐÂY");
  });
});
