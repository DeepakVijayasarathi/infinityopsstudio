import { env } from "../../env";
import { ProviderError, type AIProvider, type GenerateParams, type StreamChunk } from "../types";
import { httpError, parseSSE } from "./sse";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

async function call(p: GenerateParams, stream: boolean): Promise<Response> {
  const url = `${BASE}/${encodeURIComponent(p.model)}:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env().GOOGLE_AI_API_KEY ?? "" },
      body: JSON.stringify({
        ...(p.system ? { systemInstruction: { parts: [{ text: p.system }] } } : {}),
        contents: p.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: p.maxTokens, ...(p.temperature !== undefined ? { temperature: p.temperature } : {}) },
      }),
      signal: p.signal,
    });
  } catch (err) {
    throw new ProviderError(err instanceof Error && err.name === "AbortError" ? "Request timed out" : "Could not reach Google AI", true);
  }
  if (!res.ok) {
    const e = httpError("Google AI", res.status, await res.text());
    throw new ProviderError(e.message, e.retryable, res.status);
  }
  return res;
}

const textOf = (r: GeminiResponse) => r.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("") ?? "";

export const googleProvider: AIProvider = {
  id: "google",
  label: "Google",
  isConfigured: () => !!env().GOOGLE_AI_API_KEY,

  async generate(p) {
    const json = (await (await call(p, false)).json()) as GeminiResponse;
    return {
      text: textOf(json),
      promptTokens: json.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
      finishReason: json.candidates?.[0]?.finishReason ?? "STOP",
    };
  },

  async *stream(p): AsyncGenerator<StreamChunk> {
    const res = await call(p, true);
    let finishReason = "STOP";
    let usage = { promptTokens: 0, completionTokens: 0 };
    for await (const raw of parseSSE(res.body!)) {
      const chunk = raw as GeminiResponse;
      const text = textOf(chunk);
      if (text) yield { type: "text", text };
      if (chunk.candidates?.[0]?.finishReason) finishReason = chunk.candidates[0].finishReason;
      if (chunk.usageMetadata) {
        usage = { promptTokens: chunk.usageMetadata.promptTokenCount ?? 0, completionTokens: chunk.usageMetadata.candidatesTokenCount ?? 0 };
      }
    }
    yield { type: "done", finishReason, ...usage };
  },
};
