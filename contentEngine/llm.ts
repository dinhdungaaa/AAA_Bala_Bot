import type { GoogleGenAI } from "@google/genai";

// Trừu tượng LLM để pipeline test được với fake. Adapter Gemini thêm ở Task 4.
export interface LlmClient {
  generateJson<T>(schema: object, prompt: string, model: string): Promise<T>;
  generateText(prompt: string, model: string): Promise<string>;
}

// Adapter Gemini: hiện thực LlmClient bằng client @google/genai của BalaBot.
// generateJson dùng responseMimeType JSON + responseSchema; generateText trả text thô.
export function buildGeminiLlmClient(ai: GoogleGenAI): LlmClient {
  return {
    async generateJson<T>(schema: object, prompt: string, model: string): Promise<T> {
      const res: any = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: schema as any, temperature: 0.7 },
      } as any);
      const text = (res?.text || "").trim();
      return JSON.parse(text) as T;
    },
    async generateText(prompt: string, model: string): Promise<string> {
      const res: any = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { temperature: 0.8, thinkingConfig: { thinkingBudget: 1024 } },
      } as any);
      return (res?.text || "").trim();
    },
  };
}
