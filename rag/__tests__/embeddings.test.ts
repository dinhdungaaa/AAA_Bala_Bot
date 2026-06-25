import { describe, it, expect } from "vitest";
import { cosineSim, hashText } from "../embeddings.js";

describe("cosineSim", () => {
  it("vector trung nhau -> 1", () => {
    expect(cosineSim([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
  });
  it("truc giao -> 0", () => {
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });
  it("nguoc huong -> -1", () => {
    expect(cosineSim([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });
  it("vector rong / lech chieu -> 0 (an toan)", () => {
    expect(cosineSim([], [])).toBe(0);
    expect(cosineSim([1, 2], [1])).toBe(0);
  });
});

describe("hashText", () => {
  it("on dinh va khac nhau theo noi dung", () => {
    expect(hashText("abc")).toBe(hashText("abc"));
    expect(hashText("abc")).not.toBe(hashText("abd"));
  });
});
