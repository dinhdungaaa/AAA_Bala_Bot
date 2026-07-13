import { describe, it, expect } from "vitest";
import { runGeneration } from "../contentEngine/generatePost.js";
import type { LlmClient } from "../contentEngine/llm.js";

function fakeClient(): LlmClient {
  return {
    async generateJson<T>(_schema: object, prompt: string): Promise<T> {
      // Idea prompt → angle; Scoring prompt → tất cả item pass.
      if (prompt.includes("content strategist")) return { angle: "Góc test" } as unknown as T;
      const scores: Record<string, boolean> = {
        hook: true, no_fluff: true, sell_outcome: true, cta: true, pillar: true,
        tone: true, address: true, specificity: true, depth: true, emoji: true, mobile: true,
      };
      return { scores, suggestions: [] } as unknown as T;
    },
    async generateText(): Promise<string> {
      return "Hook cụ thể ngày hôm qua.\n\nNội dung bài viết mẫu đủ dài.\n\nBạn nghĩ sao? Comment nhé.";
    },
  };
}

describe("runGeneration", () => {
  it("chạy pipeline, trả content + quality.passed", async () => {
    const res = await runGeneration(
      { brand: { name: "AAA" }, topic: "Ra mắt khóa học", postType: "D1" },
      { client: fakeClient() },
    );
    expect(res.content).toContain("Hook");
    expect(res.quality.passed).toBe(true);
    expect(res.rounds).toBe(1);
  });

  it("economy=true bỏ bước idea (angle = topic)", async () => {
    const res = await runGeneration(
      { brand: { name: "AAA" }, topic: "Chủ đề X", postType: "D2" },
      { client: fakeClient(), economy: true },
    );
    expect(res.angle).toBe("Chủ đề X");
  });
});
