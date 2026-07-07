import { describe, it, expect } from "vitest";
import {
  parseUnderstandOutput, defaultUnderstanding,
  isValidVNPhone, normalizeVNPhone, buildUnderstandPrompt, understand,
} from "../understand.js";

describe("parseUnderstandOutput", () => {
  const q = "giá bao nhiêu";

  it("JSON chuẩn → parse đủ field", () => {
    const raw = JSON.stringify({
      intent: "hoi_gia", searchQuery: "giá khóa học bao nhiêu",
      buyingSignal: "am", contact: { phone: "0912345678" }, interest: "khóa học",
    });
    const u = parseUnderstandOutput(raw, q);
    expect(u.intent).toBe("hoi_gia");
    expect(u.searchQuery).toBe("giá khóa học bao nhiêu");
    expect(u.buyingSignal).toBe("am");
    expect(u.contact?.phone).toBe("0912345678");
    expect(u.interest).toBe("khóa học");
  });

  it("có ```json fence → vẫn parse được", () => {
    const raw = '```json\n{"intent":"chit_chat","searchQuery":"chào","buyingSignal":"lanh","contact":null,"interest":null}\n```';
    expect(parseUnderstandOutput(raw, q).intent).toBe("chit_chat");
  });

  it("enum sai → về giá trị mặc định, KHÔNG throw", () => {
    const raw = '{"intent":"mua_ngay_lap_tuc","searchQuery":"x","buyingSignal":"sôi sục","contact":null,"interest":null}';
    const u = parseUnderstandOutput(raw, q);
    expect(u.intent).toBe("khac");
    expect(u.buyingSignal).toBe("lanh");
  });

  it("searchQuery rỗng/quá dài → dùng câu gốc", () => {
    expect(parseUnderstandOutput('{"intent":"khac","searchQuery":"","buyingSignal":"lanh"}', q).searchQuery).toBe(q);
    const longQ = '{"intent":"khac","searchQuery":"' + "x".repeat(300) + '","buyingSignal":"lanh"}';
    expect(parseUnderstandOutput(longQ, q).searchQuery).toBe(q);
  });

  it("rác không phải JSON → default, KHÔNG throw", () => {
    const u = parseUnderstandOutput("xin lỗi tôi không thể", q);
    expect(u).toEqual(defaultUnderstanding(q));
  });

  it("contact không phải object → null", () => {
    const u = parseUnderstandOutput('{"intent":"khac","searchQuery":"x","buyingSignal":"lanh","contact":"0912345678"}', q);
    expect(u.contact).toBeNull();
  });
});

describe("isValidVNPhone", () => {
  it("hợp lệ: 0 đầu, +84, 84, có chấm/cách/gạch", () => {
    expect(isValidVNPhone("0912345678")).toBe(true);
    expect(isValidVNPhone("+84912345678")).toBe(true);
    expect(isValidVNPhone("84912345678")).toBe(true);
    expect(isValidVNPhone("091 234 5678")).toBe(true);
    expect(isValidVNPhone("091.234.5678")).toBe(true);
  });
  it("không hợp lệ: thiếu số, đầu số sai, chữ", () => {
    expect(isValidVNPhone("091234567")).toBe(false);   // 9 số
    expect(isValidVNPhone("0112345678")).toBe(false);  // đầu 1
    expect(isValidVNPhone("abc0912345678")).toBe(false);
    expect(isValidVNPhone("")).toBe(false);
  });
});

describe("normalizeVNPhone", () => {
  it("+84/84 → 0, bỏ ngăn cách", () => {
    expect(normalizeVNPhone("+84 912 345 678")).toBe("0912345678");
    expect(normalizeVNPhone("84912345678")).toBe("0912345678");
    expect(normalizeVNPhone("091.234.5678")).toBe("0912345678");
  });
});

describe("buildUnderstandPrompt", () => {
  it("chứa hội thoại + tin cuối + schema JSON", () => {
    const p = buildUnderstandPrompt("có giá không em", [
      { role: "user", text: "khóa học AI thế nào" },
      { role: "bot", text: "Dạ khóa học AI gồm 10 buổi ạ" },
    ]);
    expect(p.systemInstruction).toContain("intent");
    expect(p.systemInstruction).toContain("searchQuery");
    expect(p.contents).toContain("khóa học AI");
    expect(p.contents).toContain("có giá không em");
  });
  it("history rỗng vẫn chạy", () => {
    const p = buildUnderstandPrompt("giá sao", []);
    expect(p.contents).toContain("giá sao");
  });
});

describe("understand — fail-open", () => {
  it("generateContent throw → resolve về defaultUnderstanding, KHÔNG reject", async () => {
    const ai: any = { models: { generateContent: async () => { throw new Error("network down"); } } };
    const u = await understand(ai, "giá bao nhiêu", []);
    expect(u).toEqual(defaultUnderstanding("giá bao nhiêu"));
  });
  it("trả JSON hợp lệ → parse bình thường", async () => {
    const ai: any = { models: { generateContent: async () => ({ text: '{"intent":"hoi_gia","searchQuery":"giá son","buyingSignal":"am","contact":null,"interest":"son"}' }) } };
    const u = await understand(ai, "giá bn", []);
    expect(u.intent).toBe("hoi_gia");
    expect(u.searchQuery).toBe("giá son");
  });
  it("contact là ARRAY → null; raw có chữ quanh JSON không fence → vẫn parse", async () => {
    const ai: any = { models: { generateContent: async () => ({ text: 'Đây là kết quả: {"intent":"khac","searchQuery":"x","buyingSignal":"lanh","contact":[1,2]} xong.' }) } };
    const u = await understand(ai, "q", []);
    expect(u.contact).toBeNull();
    expect(u.intent).toBe("khac");
  });
});
