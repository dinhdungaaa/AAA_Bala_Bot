// Enforces invariant Facebook output rules from AGENTS.md / content-engine.md:
// plain text, no Markdown syntax, no hashtags, normalized blank lines.
export function sanitizePostContent(raw: string): string {
  let text = raw;

  // Remove fenced code blocks' fences (keep inner content).
  text = text.replace(/```[^\n]*\n?/g, "");

  // Process line by line for line-anchored markers.
  const lines = text.split("\n").flatMap((line) => {
    let l = line;
    // ATX headings: strip leading #'s + spaces, keep text.
    l = l.replace(/^\s{0,3}#{1,6}\s+/, "");
    // Blockquote markers.
    l = l.replace(/^\s{0,3}>\s?/, "");
    // Horizontal rules: remove entirely (return no lines).
    if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) return [];
    return [l];
  });
  text = lines.join("\n");

  // Bold/strong markers.
  text = text.replace(/\*\*(.*?)\*\*/g, "$1");
  text = text.replace(/__(.*?)__/g, "$1");

  // Inline code backticks.
  text = text.replace(/`/g, "");

  // Hashtags: '#' immediately followed by a letter/number (Unicode-aware).
  text = text.replace(/#[\p{L}\p{N}_]+/gu, "");

  // Collapse 3+ newlines to exactly two; trim trailing spaces per line.
  text = text
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n");
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}
