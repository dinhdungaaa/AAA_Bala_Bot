import type { PostType } from "./types.js";
import { getFormula } from "./post-formulas.js";
import { POKE_HOLE_FILTERS } from "./poke-holes.js";
import { QUALITY_ITEMS } from "./quality-gate.js";
import type { LengthTarget } from "./length.js";

export interface PromptInput {
  brandName: string;
  topic: string;
  postType: PostType;
  goal?: string;
  ingredients?: string;
  writingStyle?: string;
  customerInsight?: string;
  hookHint?: string; // optional: forces the draft to open with this hook
  lengthTarget?: LengthTarget; // resolved target word range (overrides the formula)
}

function brandContext(input: PromptInput): string {
  const lines = [
    `Thương hiệu: ${input.brandName}`,
    input.goal ? `Mục tiêu bài viết: ${input.goal}` : "",
    input.writingStyle ? `Giọng văn cần theo: ${input.writingStyle}` : "",
    input.customerInsight ? `Insight khách hàng: ${input.customerInsight}` : "",
    input.ingredients ? `Nguyên liệu ưu tiên: ${input.ingredients}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

// Stage 2: brainstorm angle then self-critique with the 4 Poke Holes filters.
export function buildIdeaPrompt(input: PromptInput): string {
  const filters = POKE_HOLE_FILTERS.map((f) => `- ${f.name}: ${f.testQuestion}`).join("\n");
  return [
    `Bạn là content strategist cho thương hiệu cá nhân.`,
    brandContext(input),
    ``,
    `Chủ đề: ${input.topic}`,
    ``,
    `Hãy đề xuất góc bài mạnh nhất, rồi tự phản biện qua 4 bộ lọc:`,
    filters,
    ``,
    `Trả về JSON: { "angle": "góc mạnh nhất sau phản biện", "pokeHoles": ["tóm tắt từng bộ lọc"] }.`,
  ].join("\n");
}

const OUTPUT_RULES = [
  `- Viết bằng tiếng Việt có dấu đầy đủ. Tuyệt đối không viết tiếng Việt không dấu.`,
  `- Output là plain text Facebook. Không dùng Markdown: không #, không **đậm**, không \`code\`, không heading.`,
  `- Không dùng hashtag.`,
  `- Mỗi đoạn tối đa 2-3 câu, dễ đọc trên mobile.`,
  `- Hook 3 dòng đầu phải khiến dừng scroll. Có CTA rõ ràng cuối bài.`,
  `- Bán kết quả/chuyển hóa, không bán công cụ. Không sáo rỗng, không hứa hẹn viển vông.`,
].join("\n");

// Craft principles distilled from top digital writers (Ship30 / Justin Welsh /
// classic copywriting): specificity, open loops, show-don't-tell, one idea,
// rhythm. This is what turns a "correct" post into an engaging one.
const CRAFT_RULES = [
  `- CỤ THỂ hóa: dùng con số thật, mốc thời gian ("3 tháng trước", "tuần 2", "từ con số 0"), tên việc/tình huống cụ thể thay vì nói chung chung. Chi tiết cụ thể luôn thắng câu chữ mơ hồ.`,
  `- "Show, don't tell": kể chi tiết, hành động, lời thoại để người đọc TỰ cảm và tự kết luận — đừng phán xét hộ họ.`,
  `- Mở một "vòng tò mò" (open loop) ngay ở hook và chỉ giải đáp ở cuối bài, để giữ người đọc tới dòng cuối.`,
  `- Mỗi bài chỉ xoáy vào MỘT ý chính. Cắt mọi câu không phục vụ ý đó.`,
  `- Nhịp câu đa dạng: xen câu rất ngắn (2-4 từ) để nhấn mạnh. Xuống dòng tạo khoảng thở.`,
  `- Nói trực tiếp với "bạn", giọng như đang nhắn cho đúng MỘT người, không phải đám đông.`,
  `- Cho người đọc lý do quan tâm NGAY (stake): họ mất gì / bỏ lỡ gì nếu lướt qua.`,
  `- CTA mời một hành động/câu trả lời CỤ THỂ (vd "kể mình nghe trường hợp của bạn ở comment"), không chung chung kiểu "hãy like và share".`,
].join("\n");

// Phrases that scream "an AI wrote this" — banned outright.
export const AI_CLICHES = [
  "Trong thời đại số", "Trong thế giới ngày nay", "Không thể phủ nhận rằng",
  "Đã đến lúc", "chìa khóa thành công", "thay đổi cuộc chơi", "bùng nổ",
  "đột phá", "không còn xa lạ", "hơn bao giờ hết", "giờ đây", "Chào các bạn", "Hello mọi người",
];
const CLICHE_RULE =
  `- Tránh TUYỆT ĐỐI các cụm sáo rỗng kiểu AI: ${AI_CLICHES.map((c) => `"${c}"`).join(", ")}. ` +
  `Không mở đầu bằng câu chào generic. Viết như người thật đang nói.`;

const ENGAGEMENT_BLOCK = [`Nguyên tắc để bài HẤP DẪN (bắt buộc):`, CRAFT_RULES, CLICHE_RULE].join("\n");

// Depth principles — what makes a post worth a reader's time, not just a
// scroll-stopper. Forces substance over a thin listicle.
const DEPTH_RULES = [
  `- ĐỦ SÂU: phát triển TRỌN VẸN từng luận điểm — giải thích CƠ CHẾ "vì sao" và "bằng cách nào", không chỉ nêu "cái gì".`,
  `- Mỗi ý chính phải đi kèm 1 ví dụ cụ thể / câu chuyện nhỏ / con số thật để chứng minh — không liệt kê hời hợt, không nói chung chung.`,
  `- Đưa ít nhất 1 góc nhìn KHÔNG HIỂN NHIÊN (điều người đọc chưa nghĩ tới), không lặp lại điều ai cũng biết.`,
  `- Lường trước phản biện mạnh nhất của người đọc ("Nhưng nếu...") và trả lời nó ngay trong bài.`,
  `- Người đọc phải rút ra được điều ÁP DỤNG được ngay (bước/cách làm cụ thể), không chỉ cảm hứng suông.`,
  `- Khai thác hết chiều sâu chủ đề và ĐẠT tối thiểu số từ yêu cầu bằng nội dung THỰC CHẤT. Tuyệt đối không nhồi chữ, không lặp ý, không viết cho đủ dài.`,
];
const DEPTH_BLOCK = [`Nguyên tắc để bài SÂU SẮC & CHẤT LƯỢNG (bắt buộc):`, DEPTH_RULES.join("\n")].join("\n");

// Stage 3: write the draft following the formula for the post type.
export function buildDraftPrompt(input: PromptInput, angle: string): string {
  const f = getFormula(input.postType);
  const structure = f.structure.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const lt = input.lengthTarget ?? {
    minWords: f.minWords,
    maxWords: f.maxWords,
    hint: "Ưu tiên chiều sâu, không viết hời hợt cho ngắn.",
  };
  return [
    `Bạn là người viết content Facebook cho thương hiệu "${input.brandName}".`,
    brandContext(input),
    ``,
    `Chủ đề: ${input.topic}`,
    `Góc đã chọn: ${angle}`,
    input.hookHint ? `Hook BẮT BUỘC mở bài bằng (giữ nguyên ý, có thể tinh chỉnh nhẹ): "${input.hookHint}"` : "",
    `Dạng bài: ${f.name}. Độ dài mục tiêu: khoảng ${lt.minWords}-${lt.maxWords} từ. ${lt.hint}`,
    ``,
    `Cấu trúc cần theo (mỗi phần phát triển đầy đủ, không gạch đầu dòng cụt):`,
    structure,
    ``,
    DEPTH_BLOCK,
    ``,
    ENGAGEMENT_BLOCK,
    ``,
    `Quy tắc bắt buộc:`,
    OUTPUT_RULES,
    ``,
    `Chỉ trả về nội dung bài viết, không giải thích thêm.`,
  ].filter(Boolean).join("\n");
}

// Stage 5: rewrite addressing the specific Quality Gate failures.
export function buildRevisePrompt(input: PromptInput, current: string, failures: string[]): string {
  return [
    `Bài Facebook dưới đây chưa đạt. Hãy viết lại tốt hơn, giữ đúng chủ đề và thương hiệu "${input.brandName}".`,
    input.lengthTarget
      ? `Giữ độ dài mục tiêu khoảng ${input.lengthTarget.minWords}-${input.lengthTarget.maxWords} từ. ${input.lengthTarget.hint}`
      : "",
    ``,
    `Các điểm cần sửa:`,
    failures.map((x) => `- ${x}`).join("\n"),
    ``,
    `Khi viết lại, làm bài SÂU và thực chất hơn (không cắt ngắn để né lỗi):`,
    DEPTH_BLOCK,
    ``,
    ENGAGEMENT_BLOCK,
    ``,
    `Quy tắc bắt buộc:`,
    OUTPUT_RULES,
    ``,
    `Bài hiện tại:`,
    current,
    ``,
    `Chỉ trả về bài viết đã sửa, không giải thích.`,
  ].join("\n");
}

// Stage 4: score the draft against the Quality Gate checklist.
export function buildScoringPrompt(input: PromptInput, draft: string): string {
  const items = QUALITY_ITEMS.map((i) => `- ${i.id}: ${i.label}`).join("\n");
  return [
    `Bạn là biên tập viên khó tính. Chấm bài Facebook sau theo từng tiêu chí (đạt = true, không đạt = false).`,
    ``,
    `Tiêu chí:`,
    items,
    ``,
    `Trả về JSON: { "scores": { "<id>": true/false, ... cho tất cả tiêu chí }, "suggestions": ["3 đề xuất cải thiện cụ thể"] }.`,
    ``,
    `Bài viết:`,
    draft,
  ].join("\n");
}

// A/B hook brainstorm: 3-5 hook openings, distinct styles, the user picks one.
export function buildHooksPrompt(input: PromptInput): string {
  const f = getFormula(input.postType);
  const examples = f.exampleHooks.map((h, i) => `${i + 1}. "${h}"`).join("\n");
  return [
    `Bạn là copywriter Facebook cho thương hiệu "${input.brandName}".`,
    brandContext(input),
    ``,
    `Chủ đề: ${input.topic}`,
    `Dạng bài: ${f.name}.`,
    ``,
    `Hãy đề xuất 4 hook mở bài KHÁC NHAU (mỗi cái 1-3 câu, tiếng Việt có dấu).`,
    `Mỗi hook phải khiến người đọc dừng scroll. Đa dạng kiểu:`,
    `- 1 hook kiểu kể chuyện/cảnh huống cụ thể (có mốc thời gian, chi tiết thật).`,
    `- 1 hook kiểu sự thật bất ngờ / con số / dữ liệu.`,
    `- 1 hook kiểu ngược dòng / phản biện (Hot take).`,
    `- 1 hook kiểu lợi ích trực tiếp / kết quả (có số).`,
    ``,
    `Có thể dùng các khuôn hook đã được kiểm chứng:`,
    `- "Tôi từng [cách cũ]. Cho đến khi [phát hiện mới]."`,
    `- "[Con số]% người [làm X] đang mắc 1 sai lầm này."`,
    `- "Hot take: [điều ngược số đông]."`,
    `- Before/After có số: "Từ [X] xuống còn [Y] chỉ trong [thời gian]."`,
    `- PAS: chạm [nỗi đau cụ thể] → khoét sâu → hé lộ có lối ra.`,
    ``,
    `BẮT BUỘC mỗi hook:`,
    `- CỤ THỂ (có số / mốc thời gian / chi tiết thật), không chung chung.`,
    `- Mở một "vòng tò mò": gợi điều chưa nói hết để người đọc phải đọc tiếp.`,
    ``,
    `Ví dụ tham chiếu cho dạng bài này (CHỈ học cấu trúc, không sao chép nội dung):`,
    examples,
    ``,
    `Quy tắc:`,
    `- Tiếng Việt có dấu đầy đủ. Không Markdown, không hashtag, không emoji.`,
    `- Không sáo rỗng, không khẩu hiệu chung chung.`,
    `- Không bắt đầu bằng câu chào generic ("Chào các bạn", "Hello mọi người").`,
    ``,
    `Trả về JSON: { "hooks": ["hook 1", "hook 2", "hook 3", "hook 4"] }.`,
  ].join("\n");
}
