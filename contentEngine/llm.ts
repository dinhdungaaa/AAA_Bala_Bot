// Trừu tượng LLM để pipeline test được với fake. Adapter Gemini thêm ở Task 4.
export interface LlmClient {
  generateJson<T>(schema: object, prompt: string, model: string): Promise<T>;
  generateText(prompt: string, model: string): Promise<string>;
}
