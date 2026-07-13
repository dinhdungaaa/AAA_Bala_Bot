import type { Brand, PostType } from "./types.js";
import type { LlmClient } from "./llm.js";
import { sanitizePostContent } from "./sanitize.js";
import { evaluateQualityGate, type QualityResult } from "./quality-gate.js";
import { IDEA_SCHEMA, SCORING_SCHEMA } from "./schemas.js";
import { pickModel } from "./model-policy.js";
import { findMarkdownViolations, hasVietnameseDiacritics } from "./guardrails.js";
import {
  buildIdeaPrompt,
  buildDraftPrompt,
  buildRevisePrompt,
  buildScoringPrompt,
  type PromptInput,
} from "./prompts.js";

export interface GenerationInput {
  brand: Brand;
  topic: string;
  postType: PostType;
  goal?: string;
  ingredients?: string;
  writingStyle?: string;
  customerInsight?: string;
  hookHint?: string; // optional: forces the draft to open with this hook
  lengthTarget?: import("./length.js").LengthTarget; // resolved target word range
}

export type ProgressEvent =
  | { stage: "idea" }
  | { stage: "draft"; round: number }
  | { stage: "score"; round: number }
  | { stage: "scored"; round: number; score: number; passed: boolean }
  | { stage: "revise"; round: number }
  | { stage: "sanitize" };

export interface GenerationDeps {
  client: LlmClient;
  model?: string; // override; default from pickModel(postType)
  maxRevisions?: number; // default: quality 3, economy 1
  onProgress?: (event: ProgressEvent) => void; // optional, for streaming UI
  // economy: skip the separate idea/poke-holes call and cap revisions to 1.
  // ~2-3 LLM calls/post instead of 4-8 — much kinder to free-tier quotas.
  economy?: boolean;
}

export interface GenerationResult {
  content: string;
  quality: QualityResult;
  suggestions: string[];
  rounds: number; // number of draft attempts made
  angle: string;
  diacriticsOk: boolean;
}

interface IdeaResponse {
  angle: string;
  pokeHoles?: string[];
}
interface ScoringResponse {
  scores: Record<string, boolean>;
  suggestions: string[];
}

export async function runGeneration(
  input: GenerationInput,
  deps: GenerationDeps,
): Promise<GenerationResult> {
  const economy = deps.economy ?? false;
  const model = deps.model ?? pickModel(input.postType);
  const maxRevisions = deps.maxRevisions ?? (economy ? 1 : 3);
  const prompt: PromptInput = {
    brandName: input.brand.name,
    topic: input.topic,
    postType: input.postType,
    goal: input.goal,
    ingredients: input.ingredients,
    writingStyle: input.writingStyle,
    customerInsight: input.customerInsight,
    hookHint: input.hookHint,
    lengthTarget: input.lengthTarget,
  };

  const report = (e: ProgressEvent) => deps.onProgress?.(e);

  // Stage 2: idea + poke holes. Skipped in economy mode (saves one call) —
  // the topic itself becomes the angle.
  let angle = input.topic;
  if (!economy) {
    report({ stage: "idea" });
    const idea = await deps.client.generateJson<IdeaResponse>(
      IDEA_SCHEMA,
      buildIdeaPrompt(prompt),
      model,
    );
    angle = idea.angle;
  }

  // Stage 3: first draft.
  report({ stage: "draft", round: 1 });
  let content = sanitizePostContent(await deps.client.generateText(buildDraftPrompt(prompt, angle), model));

  // Stage 4: score.
  report({ stage: "score", round: 1 });
  let scoring = await deps.client.generateJson<ScoringResponse>(
    SCORING_SCHEMA,
    buildScoringPrompt(prompt, content),
    model,
  );
  let quality = evaluateQualityGate(scoring.scores);
  report({ stage: "scored", round: 1, score: quality.score, passed: quality.passed });
  let rounds = 1;

  // Stage 5: revise loop until passed or out of attempts.
  while (!quality.passed && rounds <= maxRevisions) {
    report({ stage: "revise", round: rounds + 1 });
    const revised = await deps.client.generateText(
      buildRevisePrompt(prompt, content, quality.failures),
      model,
    );
    content = sanitizePostContent(revised);
    report({ stage: "score", round: rounds + 1 });
    scoring = await deps.client.generateJson<ScoringResponse>(
      SCORING_SCHEMA,
      buildScoringPrompt(prompt, content),
      model,
    );
    quality = evaluateQualityGate(scoring.scores);
    rounds++;
    report({ stage: "scored", round: rounds, score: quality.score, passed: quality.passed });
  }

  // Defensive second sanitize pass if any markdown slipped through.
  report({ stage: "sanitize" });
  if (findMarkdownViolations(content).length > 0) {
    content = sanitizePostContent(content);
  }

  return {
    content,
    quality,
    suggestions: scoring.suggestions,
    rounds,
    angle,
    diacriticsOk: hasVietnameseDiacritics(content),
  };
}
