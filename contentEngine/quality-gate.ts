import type { QualityItem, StressTest } from "./types.js";

export const QUALITY_THRESHOLD = 85;

// content-engine.md Tầng 6 "Checklist bắt buộc". Required items are the
// non-negotiables: a single failure fails the gate regardless of score.
export const QUALITY_ITEMS: QualityItem[] = [
  { id: "hook", label: "Hook 3 dòng đầu CỤ THỂ + mở vòng tò mò, khiến dừng scroll", required: true },
  { id: "tone", label: "Đúng tone gần gũi + show-don't-tell (kể chi tiết, không phán xét hộ)", required: false },
  { id: "address", label: "Xưng hô đúng (Tôi - Bạn / theo brand)", required: false },
  { id: "no_fluff", label: "Không sáo rỗng / cliché kiểu AI / hứa hẹn viển vông", required: true },
  { id: "sell_outcome", label: "Bán kết quả, không bán công cụ", required: true },
  { id: "specificity", label: "Có chi tiết cụ thể (số, mốc thời gian, ví dụ thật)", required: false },
  { id: "depth", label: "Đủ sâu: có cơ chế (vì sao/bằng cách nào), ví dụ chứng minh, góc nhìn không hiển nhiên, điều áp dụng được", required: false },
  { id: "emoji", label: "Emoji ≤ 5, đặt chiến lược", required: false },
  { id: "cta", label: "CTA mời hành động/câu trả lời cụ thể", required: true },
  { id: "pillar", label: "Thuộc ít nhất 1 content pillar", required: true },
  { id: "mobile", label: "Dễ đọc trên mobile (đoạn ngắn, xuống dòng đủ)", required: false },
];

// content-engine.md Tầng 6 "Stress-test". Qualitative; surfaced to the LLM.
export const STRESS_TESTS: StressTest[] = [
  { id: "vs_generic", question: "Bài này có khác gì AI viết generic không?" },
  { id: "only_brand", question: "Có yếu tố 'chỉ brand này mới nói được' không?" },
  { id: "share_reason", question: "Người đọc có lý do để share không?" },
  { id: "hope_vs_fear", question: "Bài đang bán hy vọng hay bán nỗi sợ?" },
];

// Per-item result, for a transparent ✓/✗ checklist in the UI.
export interface QualityCheck {
  id: string;
  label: string;
  required: boolean;
  passed: boolean;
}

export interface QualityResult {
  score: number; // 0–100
  passed: boolean;
  failures: string[]; // labels of failed items
  items: QualityCheck[]; // full checklist with per-item pass/fail
}

// scores: map of item id -> passed boolean. Missing = failed.
export function evaluateQualityGate(scores: Record<string, boolean>): QualityResult {
  const failures: string[] = [];
  const items: QualityCheck[] = [];
  let passedCount = 0;
  let requiredFailed = false;

  for (const item of QUALITY_ITEMS) {
    const ok = scores[item.id] === true;
    items.push({ id: item.id, label: item.label, required: item.required, passed: ok });
    if (ok) {
      passedCount++;
    } else {
      failures.push(item.label);
      if (item.required) requiredFailed = true;
    }
  }

  const score = Math.round((passedCount / QUALITY_ITEMS.length) * 100);
  const passed = !requiredFailed && score >= QUALITY_THRESHOLD;
  return { score, passed, failures, items };
}
