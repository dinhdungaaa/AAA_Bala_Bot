import { describe, it, expect } from "vitest";
import { rankBySimilarity } from "../retriever.js";
import type { KnowledgeChunk } from "../../src/types.js";

function chunk(id: string, embedding: number[]): KnowledgeChunk {
  return { id, botId: "b1", sourceId: "s1", title: id, content: id,
    category: "product", tags: [], isActive: true, embedding } as KnowledgeChunk;
}

describe("rankBySimilarity", () => {
  const q = [1, 0, 0];
  const chunks = [
    chunk("near", [0.9, 0.1, 0]),
    chunk("far", [0, 1, 0]),
    chunk("mid", [0.6, 0.5, 0]),
    chunk("no-embed", undefined as any),
  ];
  it("xep theo cosine giam dan, bo chunk khong co embedding", () => {
    const r = rankBySimilarity(q, chunks, 10);
    expect(r.map(x => x.chunk.id)).toEqual(["near", "mid", "far"]);
    expect(r.every(x => typeof x.score === "number")).toBe(true);
  });
  it("ton trong topK", () => {
    expect(rankBySimilarity(q, chunks, 2).length).toBe(2);
  });
  it("queryVec rong -> []", () => {
    expect(rankBySimilarity([], chunks, 5)).toEqual([]);
  });
});
