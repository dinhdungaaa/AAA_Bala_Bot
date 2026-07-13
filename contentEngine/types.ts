// Post format identifiers from content-engine.md Tầng 5 (D1–D7).
export type PostType = "D1" | "D2" | "D3" | "D4" | "D5" | "D6" | "D7";

// Thumbnail classification from Tầng 8.
export type ThumbnailKind = "human" | "graphic" | "either";

// A single content pillar with a target share of the calendar (percent 0–100).
export interface Pillar {
  id: string;
  name: string;
  share: number; // percent
}

// Minimal brand shape the engine reads. Full Brand Blueprint lives in DB later;
// the engine only needs these fields to make decisions.
export interface Brand {
  name: string;
  pillars?: Pillar[]; // brand override; if absent, engine uses defaults
}

// One Quality Gate checklist item.
export interface QualityItem {
  id: string;
  label: string;
  required: boolean; // a failed required item fails the whole gate
}

// One stress-test question (qualitative; scored by LLM later, listed here).
export interface StressTest {
  id: string;
  question: string;
}
