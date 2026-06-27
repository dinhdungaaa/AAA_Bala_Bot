import { PLAN_LIMITS } from "./billing.js";

type C = { id?: string; email?: string; tier?: string; messageLimit?: number };

// Hạn mức hiệu lực của 1 chủ sở hữu: ưu tiên messageLimit do admin set (>0),
// nếu không thì lấy mặc định theo gói; không tìm thấy khách -> gói free.
export function resolveLimitForOwner(ownerKey: string, customers: C[]): number {
  const c = customers.find(
    (x) => x.id === ownerKey || (x.email && x.email.toLowerCase() === String(ownerKey).toLowerCase())
  );
  if (c?.messageLimit && c.messageLimit > 0) return c.messageLimit;
  const tier = (c?.tier as keyof typeof PLAN_LIMITS) || "free";
  return (PLAN_LIMITS[tier] || PLAN_LIMITS.free).messages;
}
