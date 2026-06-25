import type { GoogleGenAI } from "@google/genai";
import { createHash } from "crypto";
import { EMBED_MODEL } from "./constants.js";

export function cosineSim(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function hashText(text: string): string {
  return createHash("sha1").update(text || "").digest("hex");
}

// Retry transient Gemini overload/rate errors (503/429/overloaded) with backoff.
export async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e: any) {
      lastErr = e;
      const msg = (e?.message || String(e)).toLowerCase();
      const transient = /503|429|overloaded|high demand|unavailable|resource_exhausted|rate limit/.test(msg);
      if (!transient || i === tries - 1) throw e;
      await new Promise(r => setTimeout(r, 700 * Math.pow(2, i) + Math.random() * 300));
    }
  }
  throw lastErr;
}

// Chuan hoa shape tra ve cua embedContent ve number[] (cach ly khac biet phien ban SDK).
function extractVector(res: any): number[] {
  const e = res?.embeddings?.[0] ?? res?.embedding;
  const v = e?.values ?? e;
  return Array.isArray(v) ? (v as number[]) : [];
}
function extractVectors(res: any): number[][] {
  const arr = res?.embeddings ?? [];
  return arr.map((e: any) => (Array.isArray(e?.values) ? e.values : Array.isArray(e) ? e : []));
}

export async function embedText(ai: GoogleGenAI, text: string): Promise<number[]> {
  const res = await withRetry(() => ai.models.embedContent({ model: EMBED_MODEL, contents: text } as any));
  return extractVector(res);
}

export async function embedBatch(ai: GoogleGenAI, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await ai.models.embedContent({ model: EMBED_MODEL, contents: texts } as any);
  const vecs = extractVectors(res);
  // Fallback: neu SDK khong batch, embed tung cai.
  if (vecs.length !== texts.length) {
    const out: number[][] = [];
    for (const t of texts) out.push(await embedText(ai, t));
    return out;
  }
  return vecs;
}
