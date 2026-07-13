// Detects Markdown that must never appear in the final Facebook post.
// Returns a list of violation tags (empty = clean).
export function findMarkdownViolations(text: string): string[] {
  const violations: string[] = [];
  if (/^\s{0,3}#{1,6}\s+/m.test(text)) violations.push("heading");
  if (/\*\*.+?\*\*|__.+?__/.test(text)) violations.push("bold");
  if (/`/.test(text)) violations.push("code");
  if (/#[\p{L}\p{N}_]+/u.test(text)) violations.push("hashtag");
  return violations;
}

// Vietnamese diacritic characters (precomposed). Presence indicates the text
// is written với dấu, not undiacritized.
const VN_DIACRITICS =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

export function hasVietnameseDiacritics(text: string): boolean {
  return VN_DIACRITICS.test(text);
}
