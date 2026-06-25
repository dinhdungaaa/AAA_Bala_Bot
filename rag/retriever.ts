import type { KnowledgeChunk } from "../src/types.js";
import { cosineSim } from "./embeddings.js";

// Câu hỏi ngắn / ám chỉ ("cái đó bao nhiêu?") thiếu danh từ để embed đúng.
// Ghép thêm câu KHÁCH hỏi liền trước để truy hồi bám đúng ngữ cảnh.
// Chỉ dùng cho EMBED; câu hiển thị/synthesis vẫn là câu gốc.
const DEICTIC = /\b(cái|loại|món|con|chỗ|nó|đó|kia|ấy|này|vậy|thế|còn không|còn ko|bao nhiêu|sao)\b/i;

export function buildEmbedQuery(query: string, priorUserText?: string): string {
  const q = (query || "").trim();
  const prev = (priorUserText || "").trim();
  if (!prev) return q;
  const words = q.split(/\s+/).filter(Boolean).length;
  // Câu đủ dài và tự đứng vững thì không ghép. Chỉ ghép khi ngắn, ít từ,
  // hoặc tầm trung nhưng mang từ chỉ định (follow-up thực sự).
  const isFollowUp = q.length < 30 || words <= 5 || (q.length < 60 && DEICTIC.test(q));
  if (!isFollowUp) return q;
  return `${prev}\n${q}`.trim();
}

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
