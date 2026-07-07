import type { GoogleGenAI } from "@google/genai";
import { GEN_MODEL } from "./constants.js";
import { withRetry } from "./embeddings.js";
import type { HistoryTurn } from "./retriever.js";

// Tầng HIỂU: 1 call Gemini nhanh phân tích tin nhắn khách → JSON có cấu trúc.
// THAY THẾ condenseFollowUpQuery (gộp viết-lại-câu-tìm-kiếm vào đây) và bổ sung
// intent + tín hiệu mua + phát hiện liên hệ. Fail-open tuyệt đối: mọi lỗi → default.

export type Intent =
  | "hoi_gia" | "hoi_san_pham" | "tin_hieu_mua" | "cung_cap_lien_he"
  | "phan_nan" | "chit_chat" | "khac";
export type BuyingSignal = "nong" | "am" | "lanh";

export type Understanding = {
  intent: Intent;
  searchQuery: string;
  buyingSignal: BuyingSignal;
  contact: { phone?: string; name?: string; address?: string } | null;
  interest: string | null;
};

const INTENTS: Intent[] = ["hoi_gia", "hoi_san_pham", "tin_hieu_mua", "cung_cap_lien_he", "phan_nan", "chit_chat", "khac"];
const SIGNALS: BuyingSignal[] = ["nong", "am", "lanh"];

export function defaultUnderstanding(query: string): Understanding {
  return { intent: "khac", searchQuery: (query || "").trim(), buyingSignal: "lanh", contact: null, interest: null };
}

// SĐT VN: 0/84/+84 + đầu số 3|5|7|8|9 + 8 số. LLM chỉ TÌM, regex GÁC CỔNG.
export function isValidVNPhone(s: string): boolean {
  const digits = (s || "").replace(/[\s.\-()]/g, "");
  return /^(0|\+?84)(3|5|7|8|9)\d{8}$/.test(digits);
}

export function normalizeVNPhone(s: string): string {
  const digits = (s || "").replace(/[\s.\-()]/g, "");
  return digits.replace(/^\+?84/, "0");
}

export function buildUnderstandPrompt(
  query: string,
  history: HistoryTurn[]
): { systemInstruction: string; contents: string } {
  const turns = (history || []).filter(t => (t.text || "").trim()).slice(-6);
  const convo = turns.length
    ? turns.map(t => `${t.role === "user" ? "Khách" : "Bot"}: ${t.text.trim()}`).join("\n")
    : "(chưa có)";
  const systemInstruction = [
    "Bạn là bộ PHÂN TÍCH tin nhắn khách cho chatbot bán hàng tiếng Việt.",
    'Chỉ in ra MỘT object JSON, không giải thích, không markdown. Schema:',
    '{"intent": "...", "searchQuery": "...", "buyingSignal": "...", "contact": {"phone": "...", "name": "...", "address": "..."} | null, "interest": "..." | null}',
    "- intent (ý định của TIN NHẮN CUỐI):",
    '  hoi_gia = hỏi giá/chi phí/bảng giá, kể cả gõ tắt ("ib gia", "gia nhieu", "bn tien").',
    "  hoi_san_pham = hỏi tính năng/thông tin/so sánh sản phẩm dịch vụ.",
    '  tin_hieu_mua = muốn mua/đặt/chốt ("lấy cho mình 2 cái", "đặt thế nào", "ship về HN được không").',
    "  cung_cap_lien_he = tin nhắn chứa SĐT/tên/địa chỉ mà khách chủ động gửi để được liên hệ.",
    "  phan_nan = bực bội, chê, khiếu nại, đòi hoàn tiền.",
    "  chit_chat = chào hỏi/xã giao không liên quan sản phẩm.",
    "  khac = còn lại.",
    "- searchQuery: viết lại TIN NHẮN CUỐI thành MỘT câu tìm kiếm tài liệu độc lập, đầy đủ chủ đề/danh từ" +
      " (suy từ hội thoại, kể cả câu Bot). Câu đã rõ nghĩa thì giữ gần nguyên. KHÔNG thêm thông tin mới.",
    "- buyingSignal: nong = đòi mua/chốt ngay; am = quan tâm rõ (hỏi sâu về giá/cách mua/ship); lanh = mới tìm hiểu/xã giao.",
    "- contact: CHỈ điền khi TIN NHẮN CUỐI thực sự chứa SĐT/tên/địa chỉ khách cung cấp. Không có → null. TUYỆT ĐỐI KHÔNG bịa.",
    "- interest: món/dịch vụ khách đang quan tâm, tối đa 10 từ, suy từ hội thoại; không rõ → null.",
  ].join("\n");
  const contents = `HỘI THOẠI (cũ → mới):\n${convo}\n\nTIN NHẮN CUỐI CỦA KHÁCH: ${(query || "").trim()}\n\nJSON:`;
  return { systemInstruction, contents };
}

export function parseUnderstandOutput(raw: string, query: string): Understanding {
  const fallback = defaultUnderstanding(query);
  if (!raw || !raw.trim()) return fallback;
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return fallback;
  let obj: any;
  try { obj = JSON.parse(text.slice(start, end + 1)); } catch { return fallback; }
  if (!obj || typeof obj !== "object") return fallback;

  const intent: Intent = INTENTS.includes(obj.intent) ? obj.intent : "khac";
  const buyingSignal: BuyingSignal = SIGNALS.includes(obj.buyingSignal) ? obj.buyingSignal : "lanh";
  const sq = typeof obj.searchQuery === "string" ? obj.searchQuery.trim() : "";
  const searchQuery = sq && sq.length <= 200 ? sq : fallback.searchQuery;

  let contact: Understanding["contact"] = null;
  if (obj.contact && typeof obj.contact === "object" && !Array.isArray(obj.contact)) {
    const phone = typeof obj.contact.phone === "string" ? obj.contact.phone.trim() : undefined;
    const name = typeof obj.contact.name === "string" ? obj.contact.name.trim() : undefined;
    const address = typeof obj.contact.address === "string" ? obj.contact.address.trim() : undefined;
    if (phone || name || address) contact = { phone, name, address };
  }
  const interest = typeof obj.interest === "string" && obj.interest.trim() ? obj.interest.trim().slice(0, 120) : null;
  return { intent, searchQuery, buyingSignal, contact, interest };
}

// Gọi LLM với timeout cứng 3s. Mọi lỗi (mạng/timeout/JSON hỏng) → default (fail-open).
export async function understand(
  ai: GoogleGenAI,
  query: string,
  history: HistoryTurn[]
): Promise<Understanding> {
  let timeoutId: NodeJS.Timeout | undefined;
  try {
    const { systemInstruction, contents } = buildUnderstandPrompt(query, history);
    const call = withRetry(() => ai.models.generateContent({
      model: GEN_MODEL,
      contents,
      config: {
        systemInstruction, temperature: 0, maxOutputTokens: 256,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
      },
    } as any), 2);
    const timeout = new Promise<never>((_, rej) => {
      timeoutId = setTimeout(() => rej(new Error("understand timeout")), 3000);
    });
    const res: any = await Promise.race([call, timeout]);
    return parseUnderstandOutput(res?.text || "", query);
  } catch (err: any) {
    console.warn("[Understand] fail-open:", err?.message || err);
    return defaultUnderstanding(query);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
