import { db } from "../db";
import { env } from "../env";
import { logger } from "../logger";
import { AppError } from "../errors";
import { assertUsageAvailable, recordUsage } from "../billing/usage";
import { brandContext } from "./context";
import { calculateCostMicros, creditsFor } from "./models";
import { aiSettings, getProvider, resolveModel } from "./registry";
import { ProviderError, type ChatMessage, type GenerateParams, type ModelInfo, type Usage } from "./types";

export type AICallOptions = {
  workspaceId: string | null;
  userId?: string | null;
  taskId?: string | null;
  feature: string;
  system?: string;
  messages: ChatMessage[];
  model?: string | null;
  temperature?: number;
  maxTokens?: number;
  /** Inject the workspace Brand Kit into the system prompt (default true). */
  useBrandContext?: boolean;
};

export type AICallResult = Usage & { text: string; model: string; provider: string; costMicros: number; credits: number; latencyMs: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function prepare(opts: AICallOptions): Promise<{ model: ModelInfo; params: Omit<GenerateParams, "signal"> }> {
  if (opts.workspaceId) await assertUsageAvailable(opts.workspaceId, "AI_CREDITS", 1);
  const model = await resolveModel(opts.model);
  let system = opts.system ?? "You are a helpful marketing assistant.";
  if (opts.workspaceId && opts.useBrandContext !== false) system += await brandContext(opts.workspaceId);
  return {
    model,
    params: { model: model.id, system, messages: opts.messages, maxTokens: opts.maxTokens ?? 16000, temperature: opts.temperature },
  };
}

async function record(opts: AICallOptions, model: ModelInfo, usage: Usage, latencyMs: number, error?: string) {
  const { pricingOverrides } = await aiSettings();
  const costMicros = error ? 0 : calculateCostMicros(model.id, usage.promptTokens, usage.completionTokens, pricingOverrides);
  const credits = error ? 0 : creditsFor(usage.promptTokens, usage.completionTokens);
  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  await db.aIRequest
    .create({
      data: {
        workspaceId: opts.workspaceId,
        userId: opts.userId ?? null,
        taskId: opts.taskId ?? null,
        feature: opts.feature,
        provider: model.provider,
        model: model.id,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        costMicros,
        latencyMs,
        status: error ? "ERROR" : "SUCCESS",
        errorMessage: error?.slice(0, 500),
        promptPreview: lastUser.slice(0, 280),
      },
    })
    .catch((err) => logger.error("Failed to record AI request", { err }));
  if (!error && opts.workspaceId) {
    const ref = { refType: opts.taskId ? "AITask" : "AIRequest", refId: opts.taskId ?? undefined };
    await recordUsage({ workspaceId: opts.workspaceId, userId: opts.userId, metric: "AI_CREDITS", quantity: credits, ...ref });
    await recordUsage({ workspaceId: opts.workspaceId, userId: opts.userId, metric: "AI_TOKENS", quantity: usage.promptTokens + usage.completionTokens, ...ref });
  }
  return { costMicros, credits };
}

function userFacing(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ProviderError) return new AppError("SERVICE_UNAVAILABLE", err.message);
  return new AppError("INTERNAL_ERROR", "The AI request failed. Please try again.");
}

/** Non-streaming generation with timeout, exponential-backoff retries, cost tracking and audit logging. */
export async function generateText(opts: AICallOptions): Promise<AICallResult> {
  const { model, params } = await prepare(opts);
  const provider = getProvider(model.provider);
  const { AI_MAX_RETRIES, AI_REQUEST_TIMEOUT_MS } = env();
  const started = Date.now();
  let lastError: unknown;

  for (let attempt = 0; attempt <= AI_MAX_RETRIES; attempt++) {
    try {
      const result = await provider.generate({ ...params, signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS) });
      const latencyMs = Date.now() - started;
      const { costMicros, credits } = await record(opts, model, result, latencyMs);
      return { ...result, model: model.id, provider: model.provider, costMicros, credits, latencyMs };
    } catch (err) {
      lastError = err;
      const retryable = err instanceof ProviderError && err.retryable;
      logger.warn("AI request failed", { provider: model.provider, model: model.id, attempt, retryable, err });
      if (!retryable || attempt === AI_MAX_RETRIES) break;
      await sleep(Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250));
    }
  }
  await record(opts, model, { promptTokens: 0, completionTokens: 0 }, Date.now() - started, lastError instanceof Error ? lastError.message : "unknown error");
  throw userFacing(lastError);
}

/**
 * Streaming generation as Server-Sent Events:
 *   event: meta   data: {"model","provider"}
 *   event: token  data: {"text"}
 *   event: done   data: {"usage","costMicros","credits","text"}
 *   event: error  data: {"message"}
 * `onComplete` runs with the full text before `done` is emitted (e.g. to persist output).
 */
export async function streamText(opts: AICallOptions, onComplete?: (text: string, result: AICallResult) => Promise<void>): Promise<ReadableStream<Uint8Array>> {
  const { model, params } = await prepare(opts);
  const provider = getProvider(model.provider);
  const encoder = new TextEncoder();
  const controllerAbort = new AbortController();
  const timeout = AbortSignal.timeout(env().AI_REQUEST_TIMEOUT_MS * 2);
  const signal = AbortSignal.any([controllerAbort.signal, timeout]);

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const started = Date.now();
      let text = "";
      let usage: Usage = { promptTokens: 0, completionTokens: 0 };
      send("meta", { model: model.id, provider: model.provider, label: model.label });
      try {
        let attempt = 0;
        // Retry only if the failure happened before any token was streamed.
        while (true) {
          try {
            for await (const chunk of provider.stream({ ...params, signal })) {
              if (chunk.type === "text") {
                text += chunk.text;
                send("token", { text: chunk.text });
              } else {
                usage = { promptTokens: chunk.promptTokens, completionTokens: chunk.completionTokens };
              }
            }
            break;
          } catch (err) {
            const retryable = err instanceof ProviderError && err.retryable && text.length === 0 && attempt < env().AI_MAX_RETRIES;
            if (!retryable) throw err;
            attempt++;
            await sleep(500 * 2 ** attempt);
          }
        }
        const latencyMs = Date.now() - started;
        const { costMicros, credits } = await record(opts, model, usage, latencyMs);
        const result: AICallResult = { ...usage, text, model: model.id, provider: model.provider, costMicros, credits, latencyMs };
        if (onComplete) await onComplete(text, result);
        send("done", { usage, costMicros, credits, model: model.id });
      } catch (err) {
        await record(opts, model, usage, Date.now() - started, err instanceof Error ? err.message : "stream error");
        send("error", { message: userFacing(err).message });
      } finally {
        controller.close();
      }
    },
    cancel() {
      controllerAbort.abort();
    },
  });
}

export function sseResponse(stream: ReadableStream<Uint8Array>) {
  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
  });
}
