import type { PlanLimit } from "./src/types.js";

// Hạn mức theo gói (Phase 1). Hạn mức hiệu lực của 1 khách có thể bị override
// bằng customer.messageLimit (admin set); xem billingResolve.ts.
export const PLAN_LIMITS: Record<"free" | "starter" | "pro" | "business" | "enterprise", PlanLimit> = {
  free:       { messages: 150,    bots: 1,        channels: 1 },
  starter:    { messages: 3000,   bots: 3,        channels: "all" },
  pro:        { messages: 10000,  bots: 10,       channels: "all" },
  business:   { messages: 30000,  bots: Infinity, channels: "all" },
  enterprise: { messages: 250000, bots: Infinity, channels: "all" },
};

// "YYYY-MM" theo giờ Việt Nam (UTC+7) để chu kỳ reset khớp tháng địa phương.
export function currentYearMonth(d: Date = new Date()): string {
  const vn = new Date(d.getTime() + 7 * 3600 * 1000);
  return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Phân định trạng thái dùng so với hạn mức: ân hạn +10% trước khi chặn cứng.
export function usageVerdict(count: number, limit: number): "ok" | "warn" | "blocked" {
  if (!limit || limit <= 0) return "ok";
  // So sánh bằng phép nhân nguyên để tránh sai số dấu phẩy động (vd 100*1.1 = 110.0000001).
  if (count * 10 >= limit * 11) return "blocked"; // >= 110%
  if (count * 10 >= limit * 8) return "warn";     // >= 80%
  return "ok";
}
