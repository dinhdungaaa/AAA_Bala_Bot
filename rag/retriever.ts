import type { GoogleGenAI } from "@google/genai";
import type { KnowledgeChunk } from "../src/types.js";
import { cosineSim, withRetry } from "./embeddings.js";
import { GEN_MODEL } from "./constants.js";

export type HistoryTurn = { role: "user" | "bot"; text: string };

// Câu hỏi ngắn / ám chỉ ("cái đó bao nhiêu?") thiếu danh từ để embed đúng.
// Ghép thêm câu KHÁCH hỏi liền trước để truy hồi bám đúng ngữ cảnh.
// Chỉ dùng cho EMBED; câu hiển thị/synthesis vẫn là câu gốc.
const DEICTIC = /\b(cái|loại|món|con|chỗ|nó|đó|kia|ấy|này|vậy|thế|còn không|còn ko|bao nhiêu|sao)\b/i;

// Câu ngắn / ám chỉ / thiếu chủ ngữ → cần ghép ngữ cảnh hoặc viết lại.
export function isShortFollowUp(query: string): boolean {
  const q = (query || "").trim();
  if (!q) return false;
  const words = q.split(/\s+/).filter(Boolean).length;
  return q.length < 30 || words <= 5 || (q.length < 60 && DEICTIC.test(q));
}

export function buildEmbedQuery(query: string, priorUserText?: string): string {
  const q = (query || "").trim();
  const prev = (priorUserText || "").trim();
  if (!prev) return q;
  // Câu đủ dài và tự đứng vững thì không ghép. Chỉ ghép khi là follow-up thực sự.
  if (!isShortFollowUp(q)) return q;
  return `${prev}\n${q}`.trim();
}

// Viết lại câu follow-up ngắn ("có giá không em") thành câu tìm kiếm ĐỘC LẬP,
// đầy đủ chủ đề ("giá khóa học bao nhiêu"), dựa trên hội thoại — kể cả lượt BOT,
// vì chủ đề khách đang nói tới thường nằm trong câu bot vừa trả lời.
// Lỗi/empty → trả về câu gốc (fail-open, không chặn luồng).
export async function condenseFollowUpQuery(
  ai: GoogleGenAI,
  query: string,
  history: HistoryTurn[]
): Promise<string> {
  const q = (query || "").trim();
  const turns = (history || []).filter(t => (t.text || "").trim()).slice(-6);
  if (!q || turns.length === 0) return q;
  const convo = turns.map(t => `${t.role === "user" ? "Khách" : "Bot"}: ${t.text.trim()}`).join("\n");
  const systemInstruction =
    "Bạn là bộ viết lại truy vấn cho hệ thống tìm kiếm tài liệu tiếng Việt. " +
    "Dựa vào hội thoại, viết lại CÂU HỎI CUỐI của khách thành MỘT câu tìm kiếm độc lập, " +
    "đầy đủ chủ đề/danh từ mà khách đang nói tới (suy ra từ cả câu Bot đã trả lời). " +
    "Ví dụ: lịch sử nói về 'khóa học', khách hỏi 'có giá không em' → 'giá khóa học bao nhiêu'. " +
    "Giữ nguyên ý định, KHÔNG thêm thông tin mới, KHÔNG trả lời câu hỏi. " +
    "Chỉ in ra đúng một câu tìm kiếm, không giải thích, không dấu ngoặc.";
  try {
    const res: any = await withRetry(() => ai.models.generateContent({
      model: GEN_MODEL,
      contents: `HỘI THOẠI:\n${convo}\n\nCÂU HỎI CUỐI: ${q}\n\nCâu tìm kiếm độc lập:`,
      config: { systemInstruction, temperature: 0, maxOutputTokens: 64, thinkingConfig: { thinkingBudget: 0 } },
    } as any), 2);
    const out = (res?.text || "").trim().split("\n")[0].replace(/^["'`]|["'`]$/g, "").trim();
    if (!out || out.length > 200) return q;
    return out;
  } catch {
    return q;
  }
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
