// content-engine.md Tầng 6.5 — 4 bộ lọc phản biện Topic Tree.
export interface PokeHoleFilter {
  id: string;
  name: string;
  testQuestion: string;
}

export const POKE_HOLE_FILTERS: PokeHoleFilter[] = [
  {
    id: "scope",
    name: "Độ rộng / hẹp",
    testQuestion:
      "Khách mục tiêu có dừng scroll và hiểu ngay bài nói gì không? Quá rộng hay quá hẹp?",
  },
  {
    id: "saturation",
    name: "Độ bão hòa",
    testQuestion:
      "Chủ đề này đã bão hòa trên MXH chưa? Bài của brand nổi bật ở điểm nào?",
  },
  {
    id: "differentiation",
    name: "Độ khác biệt với đối thủ",
    testQuestion:
      "Nếu đối thủ viết cùng chủ đề, bài của brand khác ở điểm nào? Nếu không tìm ra → đổi đề/góc.",
  },
  {
    id: "missing_angle",
    name: "Góc nhìn thiếu",
    testQuestion:
      "Topic có thiếu góc khán giả Việt quan tâm (tiền cụ thể, nỗi sợ tụt lại, bối cảnh VN, quick win, social proof Việt, sai lầm phổ biến)?",
  },
];

export const VERDICTS = ["PASS", "TWEAK", "DROP", "ADD"] as const;
export type Verdict = (typeof VERDICTS)[number];
