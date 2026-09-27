import type { ModelInfo, ProviderId } from "./types";

/**
 * Built-in model catalog. Pricing is in USD per 1M tokens and can be overridden by
 * administrators (Admin → Settings → AI), so the catalog never has to be edited to
 * reflect provider price changes.
 */
export const MODEL_CATALOG: ModelInfo[] = [
  { id: "claude-opus-5", provider: "anthropic", label: "Claude Opus 5", description: "Most capable Claude for strategy and long-form work.", inputPerMTok: 5, outputPerMTok: 25, contextWindow: 1_000_000, noSampling: true },
  { id: "claude-sonnet-5", provider: "anthropic", label: "Claude Sonnet 5", description: "Fast, high-quality everyday writing.", inputPerMTok: 2, outputPerMTok: 10, contextWindow: 1_000_000, noSampling: true },
  { id: "claude-haiku-4-5", provider: "anthropic", label: "Claude Haiku 4.5", description: "Lowest latency for short copy.", inputPerMTok: 1, outputPerMTok: 5, contextWindow: 200_000 },
  { id: "gpt-4.1", provider: "openai", label: "GPT-4.1", description: "OpenAI flagship general model.", inputPerMTok: 2, outputPerMTok: 8, contextWindow: 1_000_000 },
  { id: "gpt-4.1-mini", provider: "openai", label: "GPT-4.1 mini", description: "Cost-efficient OpenAI model.", inputPerMTok: 0.4, outputPerMTok: 1.6, contextWindow: 1_000_000 },
  { id: "gemini-2.5-pro", provider: "google", label: "Gemini 2.5 Pro", description: "Google's advanced reasoning model.", inputPerMTok: 1.25, outputPerMTok: 10, contextWindow: 1_000_000 },
  { id: "gemini-2.5-flash", provider: "google", label: "Gemini 2.5 Flash", description: "Fast, low-cost Google model.", inputPerMTok: 0.3, outputPerMTok: 2.5, contextWindow: 1_000_000 },
  { id: "infinity-local", provider: "local", label: "Infinity Local (demo)", description: "Offline template engine for development and demos. No API key needed.", inputPerMTok: 0, outputPerMTok: 0, contextWindow: 32_000 },
];

export const DEFAULT_MODEL_BY_PROVIDER: Record<ProviderId, string> = {
  anthropic: "claude-opus-5",
  openai: "gpt-4.1",
  google: "gemini-2.5-pro",
  local: "infinity-local",
};

export function findModel(id: string): ModelInfo | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

export type PricingOverride = Record<string, { inputPerMTok: number; outputPerMTok: number }>;

/** Cost in micro-dollars (1e-6 USD). */
export function calculateCostMicros(model: string, promptTokens: number, completionTokens: number, overrides: PricingOverride = {}): number {
  const price = overrides[model] ?? findModel(model);
  if (!price) return 0;
  return Math.round(promptTokens * price.inputPerMTok + completionTokens * price.outputPerMTok);
}

/** Credits consumed by a request: 1 credit per 1,000 tokens, minimum 1. */
export function creditsFor(promptTokens: number, completionTokens: number): number {
  return Math.max(1, Math.ceil((promptTokens + completionTokens) / 1000));
}

/** Rough token estimate (~4 chars/token) for providers that don't report usage. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
