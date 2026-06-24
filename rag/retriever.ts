import type { KnowledgeChunk } from "../src/types.js";
import { cosineSim } from "./embeddings.js";

export function rankBySimilarity(
  queryVec: number[],
  chunks: KnowledgeChunk[],
  topK: number
): Array<{ chunk: KnowledgeChunk; score: number }> {
  if (!queryVec?.length) return [];
  return chunks
    .filter(c => Array.isArray(c.embedding) && c.embedding.length > 0)
    .map(c => ({ chunk: c, score: cosineSim(queryVec, c.embedding as number[]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, topK));
}
