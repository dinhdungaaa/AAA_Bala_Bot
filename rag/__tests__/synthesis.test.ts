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
});
