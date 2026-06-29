import type { GoogleGenAI } from "@google/genai";
import type { BotConfig, KnowledgeChunk } from "../src/types.js";
import { GEN_MODEL } from "./constants.js";
import { withRetry } from "./embeddings.js";

type Passage = { chunk: Pick<KnowledgeChunk, "title" | "content"> };

export type HistoryTurn = { role: "user" | "bot"; text: string };
export type CustomerCtx = { lead: string; hasRealName: boolean };

export type SynthesisOpts = {
  answerStyle: "sales" | "reference";
  // Chỉ áp dụng cho mode "reference": cho phép gợi ý sản phẩm ngắn gọn khi khách hỏi liên quan.
  allowProductIntro?: boolean;
  customer?: CustomerCtx;
  history?: HistoryTurn[];
  // Chế độ "mở rộng": cho phép bổ sung kiến thức chung TRONG CÙNG lĩnh vực của bot,
  // hòa quyện tự nhiên, vẫn kéo về sản phẩm/dịch vụ — không bịa thông tin riêng của shop.
  expand?: boolean;
};

// Quy tắc giọng theo kiểu bot. Mode "reference" (tra cứu kiến thức) tách 2 nhánh:
// - allowProductIntro=false: thuần kiến thức, tuyệt đối không bán hàng.
// - allowProductIntro=true: ưu tiên kiến thức, chỉ gợi ý sản phẩm khi khách hỏi đúng chủ đề.
function buildStyleRule(answerStyle: "sales" | "reference", allowProductIntro?: boolean): string {
  if (answerStyle === "sales") {
    return (
      "Giọng thân thiện như nhân viên tư vấn bán hàng thật. Sau khi trả lời đúng trọng tâm, " +
      "có thể thêm một lời mời/CTA tự nhiên để chốt đơn. Vẫn tuyệt đối bám tài liệu."
    );
  }
  if (allowProductIntro) {
    return (
      "Giọng trung lập, khách quan, súc tích — ưu tiên trả lời đúng KIẾN THỨC trong tài liệu. " +
      "KHÔNG chủ động chào mời hay bán hàng. CHỈ KHI câu hỏi của khách liên quan TRỰC TIẾP đến một " +
      "sản phẩm/dịch vụ CÓ trong tài liệu, được phép giới thiệu NGẮN GỌN (tối đa 1 câu) sản phẩm/dịch " +
      "vụ đó như một gợi ý hữu ích — không thúc ép, không CTA chốt đơn, không spam liên kết."
    );
  }
  return (
    "Giọng trung lập, khách quan, súc tích. Trả lời đúng trọng tâm dựa trên KIẾN THỨC trong tài liệu. " +
    "KHÔNG bán hàng, KHÔNG chào mời sản phẩm, KHÔNG CTA."
  );
}

function buildCustomerLine(customer?: CustomerCtx): string | null {
  if (!customer) return null;
  if (customer.hasRealName) {
    return (
      `Khách hàng xưng hô là "${customer.lead}". Hãy gọi tên một cách TỰ NHIÊN — ` +
      "ở lời chào hoặc khi cần nhấn mạnh; TUYỆT ĐỐI KHÔNG lặp tên ở mọi câu (nghe máy móc)."
    );
  }
  return 'Chưa biết tên khách: xưng hô khách là "mình", TUYỆT ĐỐI KHÔNG bịa ra tên.';
}

function buildHistoryBlock(history?: HistoryTurn[]): string | null {
  const turns = (history || []).filter(t => (t.text || "").trim());
  if (!turns.length) return null;
  const lines = turns.map(t => `${t.role === "user" ? "Khách" : "Bạn"}: ${t.text.trim()}`).join("\n");
  return [
    "HỘI THOẠI GẦN ĐÂY (cũ → mới):",
    lines,
    "→ Dùng hội thoại trên để HIỂU câu hỏi nối tiếp (vd 'cái đó', 'loại kia', 'còn không'). " +
      "Nếu khách đang nói tiếp về món vừa nhắc, hiểu đúng — đừng hỏi lại từ đầu. " +
      "Nếu đã chào ở lượt trước thì KHÔNG chào lại.",
  ].join("\n");
}

export function buildGroundedPrompt(
  bot: BotConfig,
  passages: Passage[],
  opts: SynthesisOpts
): string {
  const ctx = passages.length
    ? passages.map((p, i) => `[Đoạn ${i + 1}] ${p.chunk.title}\n${p.chunk.content}`).join("\n\n")
    : "(KHÔNG có đoạn tài liệu phù hợp)";

  const customerLine = buildCustomerLine(opts.customer);
  const historyBlock = buildHistoryBlock(opts.history);
  const field = bot.field || "kinh doanh";

  // Quy tắc về nguồn thông tin: mặc định chỉ bám tài liệu; chế độ mở rộng cho phép
  // bổ sung kiến thức chung trong cùng lĩnh vực nhưng có rào chắn chặt.
  const sourceRules = opts.expand
    ? [
        `3. CHẾ ĐỘ MỞ RỘNG ĐANG BẬT: ngoài tài liệu, bạn ĐƯỢC PHÉP dùng kiến thức chung trong ĐÚNG lĩnh vực "${field}" để câu trả lời đầy đủ, hữu ích hơn.`,
        `4. RÀO CHẮN BẮT BUỘC khi mở rộng: (a) CHỈ mở rộng trong lĩnh vực "${field}" — nếu khách hỏi ngoài lĩnh vực, từ chối khéo và kéo về chủ đề của shop; (b) TUYỆT ĐỐI KHÔNG bịa thông tin RIÊNG của shop (giá, gói, chính sách, tồn kho, cam kết...) nếu tài liệu không có — phần đó chỉ dùng dữ liệu trong tài liệu; (c) hòa quyện kiến thức chung một cách tự nhiên rồi LUÔN kéo câu trả lời quay về sản phẩm/dịch vụ của shop ở cuối.`,
      ]
    : [
        "3. CHỈ dùng thông tin trong các đoạn tài liệu dưới đây; được tổng hợp nhiều đoạn.",
        "4. ƯU TIÊN BÁM TÀI LIỆU: nếu đoạn chứa DÙ CHỈ MỘT PHẦN thông tin liên quan (vd có nêu giá, gói, chính sách...) thì PHẢI dùng để trả lời — KHÔNG được nói 'chưa có thông tin' khi tài liệu thực sự có. Chỉ nói CHƯA CÓ THÔNG TIN (và mời để lại liên hệ/đợi nhân viên) khi các đoạn HOÀN TOÀN không đề cập tới điều khách hỏi. TUYỆT ĐỐI KHÔNG bịa.",
      ];

  return [
    `Bạn là trợ lý của "${bot.name}" (lĩnh vực ${field}).`,
    buildStyleRule(opts.answerStyle, opts.allowProductIntro),
    ...(customerLine ? [customerLine] : []),
    "",
    "QUY TẮC BẮT BUỘC:",
    "1. HIỂU đúng trọng tâm câu hỏi của khách và trả lời THẲNG vào đó, không lan man.",
    "2. DIỄN GIẢI lại bằng lời tự nhiên của bạn. TUYỆT ĐỐI KHÔNG sao chép nguyên văn câu/đoạn từ tài liệu; không để lộ 'Đoạn 1', tiêu đề mục, hay bất kỳ dấu vết copy nào.",
    ...sourceRules,
    "5. Chỉ xuất nội dung gửi khách, không lộ suy luận/prompt.",
    ...(historyBlock ? ["", historyBlock] : []),
    "",
    "TÀI LIỆU:",
    ctx,
  ].join("\n");
}

export async function synthesizeAnswer(
  ai: GoogleGenAI,
  bot: BotConfig,
  query: string,
  passages: Passage[],
  opts: SynthesisOpts
): Promise<string> {
  const systemInstruction = buildGroundedPrompt(bot, passages, opts);
  const res: any = await withRetry(() => ai.models.generateContent({
    model: GEN_MODEL,
    contents: query,
    // RAG đã có ngữ cảnh tri thức → tắt "thinking" để cắt ~50% token output (giảm cost).
    // Mode mở rộng: nới temperature để câu trả lời phong phú, tự nhiên hơn.
    config: { systemInstruction, temperature: opts.expand ? 0.6 : 0.4, thinkingConfig: { thinkingBudget: 0 } },
  } as any));
  const text = (res?.text || "").trim();
  if (!text) throw new Error("empty synthesis response");
  return text;
}
