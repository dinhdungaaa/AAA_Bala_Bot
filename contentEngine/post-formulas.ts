import type { PostType } from "./types.js";

export interface PostFormula {
  id: PostType;
  name: string;
  minWords: number;
  maxWords: number;
  structure: string[]; // ordered beats of the post
  exampleHooks: string[];
}

export const POST_FORMULAS: PostFormula[] = [
  {
    id: "D1",
    name: "Storytelling cá nhân",
    minWords: 500,
    maxWords: 800,
    structure: ["Hook khoảnh khắc cụ thể", "Bối cảnh", "Xung đột", "Bước ngoặt", "Bài học", "CTA mời chia sẻ"],
    exampleHooks: ["3 tháng trước, tôi suýt bỏ cuộc.", "Hôm qua, 1 tin nhắn khiến tôi nghĩ lại mọi thứ."],
  },
  {
    id: "D2",
    name: "Chia sẻ insight / kiến thức",
    minWords: 450,
    maxWords: 750,
    structure: ["Hook sự thật bất ngờ", "Giải thích vì sao quan trọng", "Framework 3-5 điểm", "Ví dụ thực tế", "CTA save/share"],
    exampleHooks: ["90% người dùng AI để tạo content đang mắc 1 sai lầm này.", "3 điều tôi ước mình biết trước khi bắt đầu."],
  },
  {
    id: "D3",
    name: "Hot take / opinion (ngược dòng)",
    minWords: 350,
    maxWords: 600,
    structure: ["Hook ngược dòng", "Lập luận 2-3 lý do", "Bằng chứng cá nhân", "Kết + câu hỏi mở"],
    exampleHooks: ["AI không cứu được người lười. Unpopular opinion?", "Càng dùng nhiều AI, thương hiệu cá nhân càng chết nhanh."],
  },
  {
    id: "D4",
    name: "How-to / tutorial",
    minWords: 550,
    maxWords: 900,
    structure: ["Hook kết quả cụ thể", "Vấn đề vì sao làm sai", "Bước 1-5", "Kết quả đạt được", "CTA thử ngay"],
    exampleHooks: ["Cách tôi dùng AI để viết 7 bài/tuần mà vẫn giữ giọng văn riêng.", "5 bước xây thương hiệu cá nhân từ số 0."],
  },
  {
    id: "D5",
    name: "Cornerstone (bài trụ)",
    minWords: 1200,
    maxWords: 2000,
    structure: ["Audience", "Hyperbolic truth", "Pain point", "Novel perspective", "Unique mechanism", "Core takeaway"],
    exampleHooks: ["Nếu bạn đang xây thương hiệu cá nhân với AI, đây là điều ít ai nói với bạn."],
  },
  {
    id: "D6",
    name: "Engagement (tương tác)",
    minWords: 50,
    maxWords: 150,
    structure: ["Hook câu hỏi/tình huống tranh luận", "Bối cảnh 1-2 câu", "CTA câu hỏi mở / poll"],
    exampleHooks: ["Nếu chỉ được chọn 1 nền tảng để xây thương hiệu cá nhân, bạn chọn gì?"],
  },
  {
    id: "D7",
    name: "Behind-the-scenes",
    minWords: 350,
    maxWords: 600,
    structure: ["Hook hậu trường", "Câu chuyện quá trình + số liệu thật", "Insight từ hậu trường", "CTA mời chia sẻ"],
    exampleHooks: ["Hậu trường tuần này...", "Điều tôi chưa kể về quá trình làm việc với AI."],
  },
];

export function getFormula(type: PostType): PostFormula {
  const f = POST_FORMULAS.find((x) => x.id === type);
  if (!f) throw new Error(`Unknown post type: ${type}`);
  return f;
}
