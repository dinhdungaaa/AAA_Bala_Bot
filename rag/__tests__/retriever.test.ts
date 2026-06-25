import { describe, it, expect } from "vitest";
import { rankBySimilarity, buildEmbedQuery } from "../retriever.js";
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

describe("buildEmbedQuery", () => {
  it("cau ngan/am chi -> ghep cau khach hoi truoc do", () => {
    expect(buildEmbedQuery("cái đó bao nhiêu?", "xà lách thủy canh")).toContain("xà lách thủy canh");
    expect(buildEmbedQuery("còn không?", "rau muống")).toContain("rau muống");
  });
  it("cau day du -> giu nguyen", () => {
    const q = "Cho mình hỏi giá xà lách thủy canh loại 300g là bao nhiêu tiền vậy";
    expect(buildEmbedQuery(q, "chào shop")).toBe(q);
  });
  it("khong co cau truoc -> giu nguyen", () => {
    expect(buildEmbedQuery("cái đó bao nhiêu?")).toBe("cái đó bao nhiêu?");
  });
});
