import type { PostType } from "./types.js";

export const FLASH = "gemini-2.5-flash";
export const PRO = "gemini-2.5-pro";

// Default policy: use FLASH for everything (lowest cost — ~4x cheaper than PRO
// on both input and output). `postType` is kept for future per-type tuning.
// Switch a stage back to PRO only if Vietnamese quality is not acceptable.
export function pickModel(_postType: PostType): string {
  return FLASH;
}
