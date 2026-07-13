// Post-length control. Two inputs decide the target word range:
//  1) what the user explicitly picks (short / medium / long), or
//  2) "auto" = learned from the median length of the brand's reference posts.
// Buckets are absolute word ranges grounded in Facebook length research
// (short posts reach more; long-form works for storytelling/guides).

export type LengthPreference = "auto" | "short" | "medium" | "long";

export interface LengthTarget {
  minWords: number;
  maxWords: number;
  hint: string; // qualitative instruction injected into the draft/revise prompt
}

export const LENGTH_OPTIONS: { value: LengthPreference; label: string }[] = [
  { value: "auto", label: "Tự động (theo phong cách của bạn)" },
  { value: "short", label: "Ngắn" },
  { value: "medium", label: "Vừa" },
  { value: "long", label: "Dài" },
];

const BUCKETS: Record<"short" | "medium" | "long", LengthTarget> = {
  short: {
    minWords: 60,
    maxWords: 130,
    hint: "Ưu tiên NGẮN GỌN, súc tích, đi thẳng vào ý chính — hợp người lướt nhanh. Cắt mọi câu thừa.",
  },
  medium: {
    minWords: 150,
    maxWords: 300,
    hint: "Độ dài vừa phải: đủ ý, đủ ví dụ, vẫn dễ đọc trên mobile.",
  },
  long: {
    minWords: 400,
    maxWords: 700,
    hint: "Phát triển CHUYÊN SÂU: kể chuyện/cẩm nang trọn vẹn, nhiều ví dụ thật — nhưng tuyệt đối không nhồi chữ, không lặp ý.",
  },
};

// Map a learned median word count to the nearest bucket.
export function bucketFromWords(words: number): "short" | "medium" | "long" {
  if (words <= 140) return "short";
  if (words <= 340) return "medium";
  return "long";
}

// Resolve the final target. "auto" uses the learned median (falls back to medium).
export function resolveLength(pref: LengthPreference, learnedMedianWords?: number): LengthTarget {
  if (pref === "auto") {
    if (typeof learnedMedianWords === "number" && learnedMedianWords > 0) {
      return BUCKETS[bucketFromWords(learnedMedianWords)];
    }
    return BUCKETS.medium;
  }
  return BUCKETS[pref];
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Median word count across reference posts (robust to outliers vs the mean).
export function medianWords(texts: string[]): number {
  const counts = texts.map(countWords).filter((n) => n > 0).sort((a, b) => a - b);
  if (counts.length === 0) return 0;
  const mid = Math.floor(counts.length / 2);
  return counts.length % 2 === 1 ? counts[mid] : Math.round((counts[mid - 1] + counts[mid]) / 2);
}
