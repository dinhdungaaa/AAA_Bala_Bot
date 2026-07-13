import type { Brand, Pillar } from "./types.js";

// Default universal mix from content-engine.md Tầng 4.
export const DEFAULT_PILLARS: Pillar[] = [
  { id: "authority", name: "Authority / góc nhìn ngành", share: 40 },
  { id: "value", name: "Value / How-to", share: 30 },
  { id: "story", name: "Story / Trust", share: 20 },
  { id: "engagement", name: "Engagement", share: 10 },
];

function sumShares(pillars: Pillar[]): number {
  return pillars.reduce((s, p) => s + p.share, 0);
}

// Returns the brand's own pillar mix if present (validated), else the default.
export function resolvePillarMix(brand: Brand): Pillar[] {
  if (!brand.pillars || brand.pillars.length === 0) return DEFAULT_PILLARS;
  const total = sumShares(brand.pillars);
  if (total !== 100) {
    throw new Error(`Brand pillars must sum to 100, got ${total}`);
  }
  return brand.pillars;
}
