import type { GoogleGenAI } from "@google/genai";
import type { BotConfig, KnowledgeChunk } from "../src/types.js";
import { GEN_MODEL } from "./constants.js";
import { withRetry } from "./embeddings.js";
import type { Intent, BuyingSignal } from "./understand.js";

export type ConversationGoal = "lead" | "order" | "consult";
export type GoalState = { isFirstTurn: boolean; hasContact: boolean; askedRecently: boolean };

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
  // Chế độ "nhanh": tắt thinking để cắt độ trễ (dùng cho kênh bridge phải trả lời
  // đồng bộ trong thời gian chờ giới hạn của nền tảng thứ 3, vd Botcake ~5s).
  fast?: boolean;
  // Tầng HIỂU + mục tiêu hội thoại (goal-driven). Không truyền → hành vi sales cũ.
  intent?: Intent;
  buyingSignal?: BuyingSignal;
  goal?: ConversationGoal;
  goalState?: GoalState;
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

// Hướng dẫn hành xử theo intent — bảng cố định, không để LLM tự đoán.
const INTENT_GUIDANCE: Record<string, string> = {
  hoi_gia: "Khách hỏi GIÁ: nếu tài liệu có giá, nói giá NGAY Ở CÂU ĐẦU, sau đó mới thêm giá trị/gợi ý.",
  hoi_san_pham: "Khách tìm hiểu sản phẩm: trả lời đúng trọng tâm, nêu 1-2 điểm mạnh liên quan nhất, không kể lể.",
  tin_hieu_mua: "Khách CÓ TÍN HIỆU MUA: không tư vấn lan man — xác nhận nhu cầu và tiến ngay tới bước tiếp theo của MỤC TIÊU.",
  cung_cap_lien_he: "Khách vừa GỬI THÔNG TIN LIÊN HỆ: cảm ơn, xác nhận đã ghi nhận, nói rõ bước tiếp theo (bên em sẽ liên hệ lại...). KHÔNG hỏi xin lại thông tin.",
  phan_nan: "Khách PHÀN NÀN: câu đầu tiên phải nhận lỗi/xoa dịu chân thành, rồi mới xử lý nội dung. TUYỆT ĐỐI không chào bán gì ở lượt này.",
  chit_chat: "Khách chỉ xã giao: đáp ngắn thân thiện; chỉ gợi mở nhẹ về sản phẩm/dịch vụ CÓ TRONG TÀI LIỆU (tài liệu trống thì hỏi mở xem khách cần gì, không nêu tên sản phẩm), không ép.",
  khac: "",
};

// Quy tắc dẫn dắt theo mục tiêu + trạng thái — phần "đúng thời điểm" chống spam.
// Intent nhạy cảm (phan_nan/cung_cap_lien_he) cũng chặn mời/chốt lượt này để prompt
// không tự mâu thuẫn với INTENT_GUIDANCE ("không chào bán", "không hỏi xin lại").
function buildGoalRule(goal: ConversationGoal, state: GoalState, buyingSignal: BuyingSignal, intent?: Intent): string {
  if (state.hasContact) {
    return (
      "MỤC TIÊU: khách ĐÃ để lại thông tin liên hệ. TUYỆT ĐỐI KHÔNG xin/hỏi lại liên hệ hay số điện thoại thêm lần nào nữa — " +
      "chỉ tư vấn chu đáo và nhắc bên em sẽ liên hệ lại khi phù hợp."
    );
  }
  const contactJustGiven = intent === "cung_cap_lien_he";
  const sensitiveTurn = intent === "phan_nan" || contactJustGiven;
  const holdOff = state.isFirstTurn || state.askedRecently || sensitiveTurn;
  const contactJustGivenLine = contactJustGiven
    ? "Khách VỪA GỬI thông tin liên hệ ngay lượt này: chỉ cảm ơn + xác nhận đã ghi nhận, TUYỆT ĐỐI KHÔNG xin thêm hay hỏi lại bất kỳ thông tin liên hệ nào."
    : null;
  if (goal === "order") {
    return [
      "MỤC TIÊU: CHỐT ĐƠN ngay trong chat. Khi khách có tín hiệu mua: chốt TỪNG BƯỚC —",
      "(1) xác nhận món + số lượng; (2) xin tên + số điện thoại + địa chỉ giao; (3) tóm tắt đơn để khách xác nhận.",
      "Mỗi tin nhắn chỉ hỏi 1-2 thứ, KHÔNG dồn hết một lượt.",
      holdOff
        ? "Lượt này KHÔNG mời chốt/xin thông tin (mới vào chuyện, vừa mời xong, hoặc lượt này không phù hợp để mời) — chỉ tư vấn cho tốt đã."
        : buyingSignal === "lanh"
          ? "Khách còn lạnh: tư vấn tạo giá trị trước, chưa vội chốt."
          : "Khách đang quan tâm: chủ động dẫn sang bước chốt một cách tự nhiên.",
      ...(contactJustGivenLine ? [contactJustGivenLine] : []),
    ].join("\n");
  }
  // goal === "lead"
  return [
    "MỤC TIÊU: lấy được THÔNG TIN LIÊN HỆ (số điện thoại) để nhân viên gọi tư vấn kỹ hơn.",
    holdOff
      ? "Lượt này KHÔNG mời để lại liên hệ (mới vào chuyện, vừa mời gần đây, hoặc lượt này không phù hợp để mời) — tập trung tư vấn cho tốt."
      : buyingSignal !== "lanh"
        ? "Khách đang quan tâm rõ: sau khi trả lời, mời khách để lại số điện thoại kèm LÝ DO tự nhiên (vd: 'để bên em gọi tư vấn kỹ và báo ưu đãi cho mình nhé')."
        : "Khách còn lạnh: tư vấn tạo giá trị trước; CHỈ mời để lại liên hệ nếu tài liệu không đủ trả lời câu hỏi.",
    ...(contactJustGivenLine ? [contactJustGivenLine] : []),
    "Khách từ chối cho số → tôn trọng, tiếp tục tư vấn vui vẻ, KHÔNG nài thêm.",
  ].join("\n");
}

// Few-shot dạy GIỌNG (không phải nội dung) — nhân viên tư vấn VN thật.
const FEW_SHOTS = [
  "VÍ DỤ VỀ GIỌNG TRẢ LỜI CHUẨN (chỉ học cách nói, KHÔNG copy nội dung/giá vào câu trả lời thật):",
  'Khách: "son này bn tiền v" → "Dạ son A bên em 200k ạ 💄 Màu này đang bán chạy lắm, mình định lấy tone đỏ hay cam đất để em tư vấn kỹ hơn ạ?"',
  'Khách: "lấy cho mình 2 hộp" → "Dạ em chốt 2 hộp cho mình nha! Mình cho em xin tên + số điện thoại + địa chỉ nhận hàng để em lên đơn luôn ạ."',
  'Khách: "hàng gì mà giao chậm thế" → "Dạ em xin lỗi mình vì để mình đợi lâu ạ 🙏 Mình cho em xin mã đơn để em kiểm tra ngay giúp mình nhé."',
  'Khách hỏi điều tài liệu không có → "Dạ phần này em chưa có thông tin chính xác để trả lời mình ạ. Mình để lại số điện thoại để bạn tư vấn viên gọi giải đáp kỹ giúp mình nha?"',
].join("\n");

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

  const goal: ConversationGoal =
    opts.goal || (opts.answerStyle === "reference" ? "consult" : "lead");
  const useGoalMode = goal !== "consult" && opts.answerStyle !== "reference";

  // 2 câu mở đầu gần nhất của bot — để LLM tránh lặp mẫu câu.
  const recentOpeners = (opts.history || [])
    .filter(t => t.role === "bot").slice(-2)
    .map(t => t.text.split(/[.!?\n]/)[0].trim()).filter(Boolean);

  const styleBlock = useGoalMode
    ? [
        "Giọng như nhân viên tư vấn bán hàng người Việt THẬT: câu ngắn, tách dòng thoáng, tối đa 4-5 câu " +
          "(trừ khi khách hỏi chi tiết), tối đa 1 emoji khi thật phù hợp. Vẫn tuyệt đối bám tài liệu.",
        ...(recentOpeners.length
          ? [`KHÔNG mở đầu giống các lượt trước (gần đây bạn đã mở đầu: ${recentOpeners.map(o => `"${o}"`).join(", ")}). Đổi cách vào câu.`]
          : []),
        ...(opts.intent && INTENT_GUIDANCE[opts.intent] ? [INTENT_GUIDANCE[opts.intent]] : []),
        buildGoalRule(goal, opts.goalState || { isFirstTurn: true, hasContact: false, askedRecently: false }, opts.buyingSignal || "lanh", opts.intent),
        "",
        FEW_SHOTS,
      ].join("\n")
    // goal đã resolve = "consult" thì đi giọng tra cứu bất kể answerStyle (consult thắng);
    // còn lại là answerStyle "reference" thuần túy như cũ.
    : buildStyleRule(goal === "consult" ? "reference" : opts.answerStyle, opts.allowProductIntro);

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

  // Không có đoạn tài liệu nào → cấm tuyệt đối suy đoán ngành hàng/sản phẩm
  // (kể cả từ TÊN bot — vd tên chứa "Balo" không có nghĩa là shop bán balo).
  const emptyDocsRule = passages.length
    ? []
    : [
        "4b. TÀI LIỆU ĐANG TRỐNG: TUYỆT ĐỐI KHÔNG suy đoán shop bán gì từ tên bot hay bất kỳ nguồn nào — " +
          "KHÔNG kể tên loại sản phẩm/dịch vụ cụ thể. Chỉ chào hỏi/đáp xã giao chung, hỏi mở xem khách cần gì, " +
          "hoặc nói em chưa có thông tin và mời để lại liên hệ.",
      ];

  return [
    `Bạn là trợ lý của "${bot.name}" (lĩnh vực ${field}).`,
    styleBlock,
    ...(customerLine ? [customerLine] : []),
    "",
    "QUY TẮC BẮT BUỘC:",
    "1. HIỂU đúng trọng tâm câu hỏi của khách và trả lời THẲNG vào đó, không lan man.",
    "2. DIỄN GIẢI lại bằng lời tự nhiên của bạn. TUYỆT ĐỐI KHÔNG sao chép nguyên văn câu/đoạn từ tài liệu; không để lộ 'Đoạn 1', tiêu đề mục, hay bất kỳ dấu vết copy nào.",
    ...sourceRules,
    ...emptyDocsRule,
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
    // Bật "thinking" ở mức vừa để câu trả lời mạch lạc, đầy đặn hơn (trước đây tắt hẳn
    // để tiết kiệm token khiến bot trả lời cụt). Budget cố định để kiểm soát cost.
    // Mode mở rộng: nới temperature + budget để câu trả lời phong phú, tự nhiên hơn.
    config: { systemInstruction, temperature: opts.expand ? 0.6 : 0.4, thinkingConfig: { thinkingBudget: opts.fast ? 0 : (opts.expand ? 2048 : 1024) } },
  } as any));
  const text = (res?.text || "").trim();
  if (!text) throw new Error("empty synthesis response");
  return text;
}
