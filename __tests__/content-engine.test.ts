import { describe, it, expect } from "vitest";

// Import all engine functions
import { POST_FORMULAS, getFormula } from "../contentEngine/post-formulas.js";
import { POKE_HOLE_FILTERS, VERDICTS } from "../contentEngine/poke-holes.js";
import { DEFAULT_PILLARS, resolvePillarMix } from "../contentEngine/pillars.js";
import type { Brand } from "../contentEngine/types.js";
import {
  QUALITY_ITEMS,
  STRESS_TESTS,
  QUALITY_THRESHOLD,
  evaluateQualityGate,
} from "../contentEngine/quality-gate.js";
import { sanitizePostContent } from "../contentEngine/sanitize.js";
import { findMarkdownViolations, hasVietnameseDiacritics } from "../contentEngine/guardrails.js";
import { resolveLength, bucketFromWords, medianWords, countWords } from "../contentEngine/length.js";
import {
  buildIdeaPrompt,
  buildDraftPrompt,
  buildRevisePrompt,
  buildScoringPrompt,
  type PromptInput,
} from "../contentEngine/prompts.js";

// ============ Post Formulas Tests ============
describe("post formulas", () => {
  it("defines all 7 formulas D1–D7", () => {
    const ids = POST_FORMULAS.map((f) => f.id).sort();
    expect(ids).toEqual(["D1", "D2", "D3", "D4", "D5", "D6", "D7"]);
  });

  it("getFormula returns the matching formula", () => {
    const f = getFormula("D1");
    expect(f.name.toLowerCase()).toContain("storytelling");
    expect(f.minWords).toBeLessThan(f.maxWords);
    expect(f.structure.length).toBeGreaterThan(0);
  });

  it("each formula has a non-empty structure and length range", () => {
    for (const f of POST_FORMULAS) {
      expect(f.minWords).toBeGreaterThan(0);
      expect(f.maxWords).toBeGreaterThanOrEqual(f.minWords);
      expect(f.structure.length).toBeGreaterThan(0);
      expect(f.exampleHooks.length).toBeGreaterThan(0);
    }
  });
});

// ============ Poke Holes Tests ============
describe("poke holes", () => {
  it("defines exactly 4 critique filters", () => {
    expect(POKE_HOLE_FILTERS.length).toBe(4);
  });

  it("each filter has an id, name, and test question", () => {
    for (const f of POKE_HOLE_FILTERS) {
      expect(f.id).toBeTruthy();
      expect(f.name).toBeTruthy();
      expect(f.testQuestion.length).toBeGreaterThan(0);
    }
  });

  it("defines the 4 verdict tags", () => {
    expect(VERDICTS).toEqual(["PASS", "TWEAK", "DROP", "ADD"]);
  });
});

// ============ Pillars Tests ============
describe("pillars", () => {
  it("default pillars sum to 100", () => {
    const total = DEFAULT_PILLARS.reduce((s, p) => s + p.share, 0);
    expect(total).toBe(100);
  });

  it("uses default mix when brand has no pillars", () => {
    const brand: Brand = { name: "Test" };
    expect(resolvePillarMix(brand)).toEqual(DEFAULT_PILLARS);
  });

  it("uses brand pillars when provided", () => {
    const brand: Brand = {
      name: "Học & Làm cùng AI",
      pillars: [
        { id: "news", name: "Cập nhật tin AI", share: 30 },
        { id: "howto", name: "Hướng dẫn thực chiến", share: 30 },
        { id: "tools", name: "Công cụ AI", share: 20 },
        { id: "human", name: "Tư duy Human-first", share: 10 },
        { id: "money", name: "Case study / Kiếm tiền", share: 10 },
      ],
    };
    expect(resolvePillarMix(brand)).toBe(brand.pillars);
  });

  it("throws if brand pillars do not sum to 100", () => {
    const brand: Brand = { name: "Bad", pillars: [{ id: "a", name: "A", share: 50 }] };
    expect(() => resolvePillarMix(brand)).toThrow();
  });
});

// ============ Quality Gate Tests ============
function allPass(): Record<string, boolean> {
  return Object.fromEntries(QUALITY_ITEMS.map((i) => [i.id, true]));
}

describe("quality gate", () => {
  it("has 11 checklist items and 4 stress tests", () => {
    expect(QUALITY_ITEMS.length).toBe(11);
    expect(STRESS_TESTS.length).toBe(4);
  });

  it("scores 100 and passes when all items pass", () => {
    const r = evaluateQualityGate(allPass());
    expect(r.score).toBe(100);
    expect(r.passed).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it("fails the gate when a required item fails, even if score is high", () => {
    const scores = allPass();
    const required = QUALITY_ITEMS.find((i) => i.required)!;
    scores[required.id] = false;
    const r = evaluateQualityGate(scores);
    expect(r.passed).toBe(false);
    expect(r.failures).toContain(required.label);
  });

  it("fails when score is below threshold from non-required misses", () => {
    const scores = allPass();
    const optional = QUALITY_ITEMS.filter((i) => !i.required);
    // Fail enough optional items to drop below threshold.
    for (const item of optional) scores[item.id] = false;
    const r = evaluateQualityGate(scores);
    expect(r.score).toBeLessThan(QUALITY_THRESHOLD);
    expect(r.passed).toBe(false);
  });

  it("treats a missing score as a failed item", () => {
    const scores = allPass();
    const first = QUALITY_ITEMS[0];
    delete scores[first.id];
    const r = evaluateQualityGate(scores);
    expect(r.failures).toContain(first.label);
  });
});

// ============ Sanitize Tests ============
describe("sanitizePostContent", () => {
  it("strips ATX heading markers but keeps the text", () => {
    expect(sanitizePostContent("# Tiêu đề\nNội dung")).toBe("Tiêu đề\nNội dung");
    expect(sanitizePostContent("### Phụ đề")).toBe("Phụ đề");
  });

  it("removes bold markers", () => {
    expect(sanitizePostContent("Nội dung **đậm** thật")).toBe("Nội dung đậm thật");
    expect(sanitizePostContent("Một __đậm__ nữa")).toBe("Một đậm nữa");
  });

  it("removes inline and fenced code backticks", () => {
    expect(sanitizePostContent("dùng `code` nhé")).toBe("dùng code nhé");
    expect(sanitizePostContent("```\nblock\n```")).toBe("block");
  });

  it("removes hashtags", () => {
    expect(sanitizePostContent("Bài hay\n#AI #Marketing")).toBe("Bài hay");
  });

  it("removes blockquote and horizontal-rule markers", () => {
    expect(sanitizePostContent("> trích dẫn")).toBe("trích dẫn");
    expect(sanitizePostContent("trên\n---\ndưới")).toBe("trên\ndưới");
  });

  it("collapses 3+ blank lines into one blank line and trims", () => {
    expect(sanitizePostContent("a\n\n\n\nb\n\n")).toBe("a\n\nb");
  });
});

// ============ Guardrails Tests ============
describe("guardrails", () => {
  it("findMarkdownViolations flags headings, bold, code, and hashtags", () => {
    const v = findMarkdownViolations("# Tiêu đề\n**đậm**\n`code`\n#AI");
    expect(v).toContain("heading");
    expect(v).toContain("bold");
    expect(v).toContain("code");
    expect(v).toContain("hashtag");
  });

  it("findMarkdownViolations returns empty for clean plain text", () => {
    expect(findMarkdownViolations("Nội dung sạch.\nDòng hai.")).toEqual([]);
  });

  it("hasVietnameseDiacritics detects diacritics", () => {
    expect(hasVietnameseDiacritics("Nội dung")).toBe(true);
    expect(hasVietnameseDiacritics("Tôi và bạn")).toBe(true);
  });

  it("hasVietnameseDiacritics is false for undiacritized text", () => {
    expect(hasVietnameseDiacritics("Noi dung khong dau")).toBe(false);
  });
});

// ============ Length Tests ============
describe("countWords / medianWords", () => {
  it("counts words", () => {
    expect(countWords("một hai ba")).toBe(3);
    expect(countWords("  ")).toBe(0);
  });
  it("median ignores empties and is robust to outliers", () => {
    expect(medianWords(["a b", "a b c d", "a b c"])).toBe(3); // [2,3,4] → 3
    expect(medianWords(["a b", "a b c d"])).toBe(3); // even → (2+4)/2
    expect(medianWords([])).toBe(0);
  });
});

describe("bucketFromWords", () => {
  it("maps learned length to a bucket", () => {
    expect(bucketFromWords(90)).toBe("short");
    expect(bucketFromWords(220)).toBe("medium");
    expect(bucketFromWords(500)).toBe("long");
  });
});

describe("resolveLength", () => {
  it("explicit preference wins", () => {
    expect(resolveLength("short").maxWords).toBeLessThan(resolveLength("long").minWords);
    expect(resolveLength("medium").minWords).toBe(150);
  });
  it("auto uses the learned median", () => {
    expect(resolveLength("auto", 500)).toEqual(resolveLength("long"));
    expect(resolveLength("auto", 90)).toEqual(resolveLength("short"));
  });
  it("auto falls back to medium with no samples", () => {
    expect(resolveLength("auto", 0)).toEqual(resolveLength("medium"));
    expect(resolveLength("auto")).toEqual(resolveLength("medium"));
  });
});

// ============ Prompts Tests ============
const input: PromptInput = {
  brandName: "Học & Làm cùng AI",
  topic: "AI Agent thay đổi cách làm việc",
  postType: "D2",
  goal: "xây authority",
  ingredients: "kinh nghiệm dùng AI agent",
  writingStyle: "Câu ngắn, gần gũi.",
  customerInsight: "Sợ tụt lại phía sau.",
};

describe("prompts", () => {
  it("idea prompt includes the 4 poke-hole filters and the topic", () => {
    const p = buildIdeaPrompt(input);
    expect(p).toContain("AI Agent thay đổi cách làm việc");
    expect(p).toContain("bão hòa");
    expect(p).toContain("khác biệt");
  });

  it("draft prompt enforces invariant output rules", () => {
    const p = buildDraftPrompt(input, "Góc đã chọn");
    expect(p).toContain("tiếng Việt có dấu");
    expect(p.toLowerCase()).toContain("markdown");
    expect(p).toContain("hashtag");
    expect(p).toContain("Học & Làm cùng AI");
    expect(p).toContain("Góc đã chọn");
  });

  it("draft prompt includes the formula structure for the post type", () => {
    const p = buildDraftPrompt(input, "x");
    // D2 structure beat
    expect(p).toContain("Framework");
  });

  it("draft prompt injects engagement craft rules and bans AI clichés", () => {
    const p = buildDraftPrompt(input, "x");
    expect(p).toContain("vòng tò mò"); // open loop
    expect(p).toContain("Show, don't tell");
    expect(p).toContain("Trong thời đại số"); // a banned cliché is listed
  });

  it("draft prompt demands depth and a minimum substantive length", () => {
    const p = buildDraftPrompt(input, "x");
    expect(p).toContain("SÂU SẮC");
    expect(p).toContain("CƠ CHẾ");
    expect(p).toContain("tối thiểu"); // minimum word floor stated
  });

  it("revise prompt lists the failures to fix and keeps craft rules", () => {
    const p = buildRevisePrompt(input, "bài hiện tại", ["CTA rõ ràng", "Hook 3 dòng đầu khiến dừng scroll"]);
    expect(p).toContain("CTA rõ ràng");
    expect(p).toContain("bài hiện tại");
    expect(p).toContain("vòng tò mò");
  });

  it("scoring prompt lists the quality items to evaluate", () => {
    const p = buildScoringPrompt(input, "bài cần chấm");
    expect(p).toContain("bài cần chấm");
    expect(p).toContain("hook");
    expect(p).toContain("sell_outcome");
  });
});
