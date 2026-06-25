// One-off: backfill chunk embeddings into Supabase + smoke-test the RAG flow
// using the REAL rag/ modules. Run: GEMINI_API_KEY=... npx tsx scripts/rag-backfill.mts [test]
// Service key + url are fetched from the prod owner-only config endpoint (no secrets in argv).
import { GoogleGenAI } from "@google/genai";
import { embedText, hashText } from "../rag/embeddings.js";
import { rankBySimilarity } from "../rag/retriever.js";
import { synthesizeAnswer } from "../rag/synthesis.js";
import { TOP_K, SIM_THRESHOLD } from "../rag/constants.js";
import type { KnowledgeChunk, BotConfig } from "../src/types.js";

const OWNER = "ox102.crypto@gmail.com";
const PROD = "https://aaabalabot-production.up.railway.app";
const TEST_ONLY = process.argv.includes("test");

async function getSb(): Promise<{ url: string; key: string }> {
  const cfg = await fetch(`${PROD}/api/supabase/config`, { headers: { "x-balabot-user-email": OWNER } }).then(r => r.json());
  if (!cfg?.config?.url || !cfg?.config?.key) throw new Error("could not fetch supabase service config");
  return { url: cfg.config.url, key: cfg.config.key };
}
function sbHeaders(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", ...extra };
}

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const { url, key } = await getSb();

  // Load active chunks
  const chunks: KnowledgeChunk[] = await fetch(
    `${url}/rest/v1/knowledge_chunks?select=id,botId,title,content,category,tags,isActive,embedding,embeddingHash&isActive=eq.true`,
    { headers: sbHeaders(key) }
  ).then(r => r.json());
  console.log(`Loaded ${chunks.length} active chunks.`);

  if (!TEST_ONLY) {
    let done = 0, skipped = 0, failed = 0;
    for (const c of chunks) {
      const text = `${c.title}\n${c.content}`.trim();
      const h = hashText(text);
      if (Array.isArray(c.embedding) && c.embedding.length && c.embeddingHash === h) { skipped++; continue; }
      try {
        const vec = await embedText(ai, text);
        if (!vec.length) throw new Error("empty embedding");
        const resp = await fetch(`${url}/rest/v1/knowledge_chunks?id=eq.${encodeURIComponent(c.id)}`, {
          method: "PATCH", headers: sbHeaders(key, { Prefer: "return=minimal" }),
          body: JSON.stringify({ embedding: vec, embeddingHash: h }),
        });
        if (!resp.ok) throw new Error(`PATCH ${resp.status}: ${(await resp.text()).slice(0, 120)}`);
        c.embedding = vec; c.embeddingHash = h; done++;
        if (done % 25 === 0) console.log(`  embedded ${done}...`);
      } catch (e: any) { failed++; console.warn(`  FAIL ${c.id}: ${e.message}`); }
    }
    console.log(`Backfill done: embedded=${done} skipped=${skipped} failed=${failed} total=${chunks.length}`);
  }

  // Smoke test: load bots + run a few queries through the real retrieval+synthesis
  // NOTE: 'answerStyle' column may not exist on bots yet — don't select it (default sales).
  const bots: BotConfig[] = await fetch(
    `${url}/rest/v1/bots?select=id,name,field,fallbackMessage`,
    { headers: sbHeaders(key) }
  ).then(r => r.json());

  const fixed = (process.env.RAG_TEST_QUESTIONS || "").split("||").map(s => s.trim()).filter(Boolean);
  const stripTitle = (t: string) => (t || "").replace(/\s*\(M[uụ]c\s*\d+\)\s*$/i, "").trim();
  const pick = <T,>(arr: T[], n: number) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);

  for (const bot of bots) {
    const botChunks = chunks.filter(c => c.botId === bot.id && Array.isArray(c.embedding) && c.embedding!.length);
    if (!botChunks.length) continue;
    console.log(`\n===== BOT: ${bot.name} (${botChunks.length} embedded chunks, style=${bot.answerStyle || "sales"}) =====`);
    // Random-but-relevant questions derived from this bot's own chunk titles, unless fixed ones given.
    const questions = fixed.length
      ? fixed
      : pick(botChunks, 3).map(c => `Cho mình hỏi về ${stripTitle(c.title) || stripTitle(c.content.slice(0, 40))}?`);
    for (const q of questions) {
      try {
        const qVec = await embedText(ai, q);
        const top = rankBySimilarity(qVec, botChunks, TOP_K);
        const maxScore = top[0]?.score ?? 0;
        const grounded = maxScore >= SIM_THRESHOLD ? top : [];
        const style = bot.answerStyle === "reference" ? "reference" : "sales";
        const answer = await synthesizeAnswer(ai, bot, q, grounded, { answerStyle: style }).catch(() => "(synthesis error)");
        console.log(`\nQ: ${q}`);
        console.log(`  topScore=${maxScore.toFixed(3)} grounded=${grounded.length} matched=[${top.slice(0,3).map(t=>t.chunk.title+":"+t.score.toFixed(2)).join(" | ")}]`);
        console.log(`  A: ${String(answer).replace(/\n/g, " ").slice(0, 400)}`);
      } catch (e: any) { console.log(`Q: ${q} -> ERR ${e.message}`); }
    }
  }
}

main().catch(e => { console.error("FATAL", e.message); process.exit(1); });
