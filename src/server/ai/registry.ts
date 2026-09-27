import { env } from "../env";
import { DEFAULT_AI_SETTINGS, getSetting, type AISettings } from "../settings";
import { DEFAULT_MODEL_BY_PROVIDER, MODEL_CATALOG, findModel } from "./models";
import { anthropicProvider } from "./providers/anthropic";
import { claudeCodeProvider } from "./providers/claude-code";
import { googleProvider } from "./providers/google";
import { localProvider } from "./providers/local";
import { openaiProvider } from "./providers/openai";
import type { AIProvider, ModelInfo, ProviderId } from "./types";

export const PROVIDERS: Record<ProviderId, AIProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  google: googleProvider,
  "claude-code": claudeCodeProvider,
  local: localProvider,
};

export function getProvider(id: ProviderId): AIProvider {
  return PROVIDERS[id];
}

export async function aiSettings(): Promise<AISettings> {
  return getSetting("ai", DEFAULT_AI_SETTINGS);
}

export type AvailableModel = ModelInfo & { configured: boolean; enabled: boolean };

export async function listModels(): Promise<AvailableModel[]> {
  const s = await aiSettings();
  return MODEL_CATALOG.map((m) => ({
    ...m,
    configured: PROVIDERS[m.provider].isConfigured(),
    enabled: !s.enabledModels || s.enabledModels.includes(m.id),
  }));
}

export async function usableModels(): Promise<AvailableModel[]> {
  return (await listModels()).filter((m) => m.configured && m.enabled);
}

/** Pick the model for a request: explicit → admin default → env default → first configured real provider → local. */
export async function resolveModel(requested?: string | null): Promise<ModelInfo> {
  const usable = await usableModels();
  const has = (id?: string | null) => (id ? usable.find((m) => m.id === id) : undefined);
  const s = await aiSettings();
  const e = env();
  return (
    (s.allowUserModelSelection ? has(requested) : undefined) ??
    has(s.defaultModel) ??
    has(e.AI_DEFAULT_MODEL) ??
    has(DEFAULT_MODEL_BY_PROVIDER[e.AI_DEFAULT_PROVIDER]) ??
    usable.find((m) => m.provider !== "local") ??
    findModel("infinity-local")!
  );
}
