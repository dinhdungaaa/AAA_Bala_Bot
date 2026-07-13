import { Type } from "@google/genai";

// Stage 2 output: chosen angle after self-critique (Poke Holes).
export const IDEA_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    angle: { type: Type.STRING, description: "Góc bài mạnh nhất sau phản biện" },
    pokeHoles: {
      type: Type.ARRAY,
      description: "Tóm tắt phản biện theo 4 bộ lọc",
      items: { type: Type.STRING },
    },
  },
  required: ["angle"],
};

// Stage 4 output: Quality Gate scoring. `scores` maps each checklist item id
// to a boolean pass; `suggestions` are concrete improvement ideas.
export const SCORING_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    scores: {
      type: Type.OBJECT,
      description: "Map item id -> pass/fail (boolean)",
      properties: {
        hook: { type: Type.BOOLEAN },
        tone: { type: Type.BOOLEAN },
        address: { type: Type.BOOLEAN },
        no_fluff: { type: Type.BOOLEAN },
        sell_outcome: { type: Type.BOOLEAN },
        specificity: { type: Type.BOOLEAN },
        depth: { type: Type.BOOLEAN },
        emoji: { type: Type.BOOLEAN },
        cta: { type: Type.BOOLEAN },
        pillar: { type: Type.BOOLEAN },
        mobile: { type: Type.BOOLEAN },
      },
    },
    suggestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "3 đề xuất cải thiện cụ thể",
    },
  },
  required: ["scores", "suggestions"],
};

// Hook brainstorm: 3-5 hook candidates the user can pick from before drafting.
export const HOOKS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    hooks: {
      type: Type.ARRAY,
      description: "3-5 hook mở bài khác nhau, tiếng Việt có dấu, mỗi cái 1-3 câu",
      items: { type: Type.STRING },
    },
  },
  required: ["hooks"],
};
