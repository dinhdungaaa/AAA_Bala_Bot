import type { BotConfig } from "../src/types.js";
import type { Brand } from "./types.js";

// Brand tối thiểu engine cần: chỉ name (pillars dùng mặc định của engine).
export function brandFromBot(bot: BotConfig): Brand {
  return { name: bot.name || "Thương hiệu" };
}

// Ghép các đoạn kiến thức thành "nguyên liệu" cho prompt. Giới hạn số đoạn để
// prompt không quá dài; mỗi đoạn gói gọn tiêu đề + nội dung.
export function ingredientsFromChunks(
  chunks: { title?: string; content?: string }[],
  max = 6,
): string {
  return (chunks || [])
    .slice(0, max)
    .map((c) => [c.title, c.content].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("\n");
}
