import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../env";
import { findModel } from "../models";
import { ProviderError, type AIProvider, type GenerateParams, type GenerateResult, type StreamChunk } from "../types";

let client: Anthropic | undefined;
function getClient(): Anthropic {
  // Retries/timeouts are handled uniformly by the AI service layer.
  client ??= new Anthropic({ apiKey: env().ANTHROPIC_API_KEY, maxRetries: 0 });
  return client;
}

// Opus/Fable-tier models can decline requests via safety classifiers; server-side
// fallbacks re-run the request on a suitable model instead of failing the task.
function supportsFallbacks(model: string) {
  return model.startsWith("claude-opus-5") || model.startsWith("claude-fable-5");
}

function buildRequest(p: GenerateParams) {
  const info = findModel(p.model);
  const fallback = supportsFallbacks(p.model);
  return {
    model: p.model,
    max_tokens: p.maxTokens,
    ...(p.system ? { system: p.system } : {}),
    messages: p.messages.map((m) => ({ role: m.role, content: m.content })),
    ...(!info?.noSampling && p.temperature !== undefined ? { temperature: p.temperature } : {}),
    ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  };
}

function toProviderError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof Anthropic.RateLimitError) return new ProviderError("Anthropic rate limit reached", true, 429);
  if (err instanceof Anthropic.InternalServerError) return new ProviderError("Anthropic service error", true, err.status);
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new ProviderError("Anthropic request timed out", true);
  if (err instanceof Anthropic.APIConnectionError) return new ProviderError("Could not reach Anthropic", true);
  if (err instanceof Anthropic.AuthenticationError) return new ProviderError("Anthropic API key is invalid", false, 401);
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 500;
    return new ProviderError(`Anthropic error: ${err.message}`, status === 408 || status === 409 || status >= 500, status);
  }
  if (err instanceof Error && err.name === "AbortError") return new ProviderError("Request timed out", true);
  return new ProviderError(err instanceof Error ? err.message : "Unknown Anthropic error", false);
}

function assertNotRefused(stopReason: string | null | undefined) {
  if (stopReason === "refusal") throw new ProviderError("The model declined this request. Try rephrasing the brief.", false, 400);
}

export const anthropicProvider: AIProvider = {
  id: "anthropic",
  label: "Anthropic",
  isConfigured: () => !!env().ANTHROPIC_API_KEY,

  async generate(p): Promise<GenerateResult> {
    try {
      const msg = await getClient().beta.messages.create({ ...buildRequest(p), stream: false }, { signal: p.signal });
      assertNotRefused(msg.stop_reason);
      const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      return {
        text,
        promptTokens: msg.usage.input_tokens,
        completionTokens: msg.usage.output_tokens,
        finishReason: msg.stop_reason ?? "end_turn",
      };
    } catch (err) {
      throw toProviderError(err);
    }
  },

  async *stream(p): AsyncGenerator<StreamChunk> {
    try {
      const stream = getClient().beta.messages.stream(buildRequest(p), { signal: p.signal });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { type: "text", text: event.delta.text };
        }
      }
      const final = await stream.finalMessage();
      assertNotRefused(final.stop_reason);
      yield {
        type: "done",
        finishReason: final.stop_reason ?? "end_turn",
        promptTokens: final.usage.input_tokens,
        completionTokens: final.usage.output_tokens,
      };
    } catch (err) {
      throw toProviderError(err);
    }
  },
};
