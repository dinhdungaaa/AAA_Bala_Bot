import { describe, it, expect } from "vitest";
import { brandFromBot, ingredientsFromChunks } from "../contentEngine/brandFromBot.js";

describe("brandFromBot", () => {
  it("lấy name từ bot", () => {
    const b = brandFromBot({ id: "b1", name: "AAA Shop" } as any);
    expect(b.name).toBe("AAA Shop");
  });
});

describe("ingredientsFromChunks", () => {
  it("ghép title+content, giới hạn số đoạn", () => {
    const chunks = [
      { title: "SP1", content: "Mô tả 1" },
      { title: "SP2", content: "Mô tả 2" },
      { title: "SP3", content: "Mô tả 3" },
    ];
    const out = ingredientsFromChunks(chunks, 2);
    expect(out).toContain("SP1");
    expect(out).toContain("SP2");
    expect(out).not.toContain("SP3");
  });
  it("rỗng → chuỗi rỗng", () => {
    expect(ingredientsFromChunks([], 3)).toBe("");
  });
});
