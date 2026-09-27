import { env } from "../../env";
import { ProviderError, type AIProvider, type GenerateParams, type StreamChunk } from "../types";
import { httpError, parseSSE } from "./sse";

const URL = "https://api.openai.com/v1/chat/completions";

function body(p: GenerateParams, stream: boolean) {
  return JSON.stringify({
    model: p.model,
    max_completion_tokens: p.maxTokens,
    ...(p.temperature !== undefined ? { temperature: p.temperature } : {}),
    messages: [...(p.system ? [{ role: "system", content: p.system }] : []), ...p.messages],
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
  });
}

async function call(p: GenerateParams, stream: boolean): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env().OPENAI_API_KEY}` },
      body: body(p, stream),
      signal: p.signal,
    });
  } catch (err) {
    throw new ProviderError(err instanceof Error && err.name === "AbortError" ? "Request timed out" : "Could not reach OpenAI", true);
  }
  if (!res.ok) {
    const e = httpError("OpenAI", res.status, await res.text());
    throw new ProviderError(e.message, e.retryable, res.status);
  }
  return res;
}

type Completion = {
  choices: { message?: { content?: string }; delta?: { content?: string }; finish_reason?: string | null }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
};

export const openaiProvider: AIProvider = {
  id: "openai",
  label: "OpenAI",
  isConfigured: () => !!env().OPENAI_API_KEY,

  async generate(p) {
    const json = (await (await call(p, false)).json()) as Completion;
    return {
      text: json.choices[0]?.message?.content ?? "",
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
      finishReason: json.choices[0]?.finish_reason ?? "stop",
    };
  },

  async *stream(p): AsyncGenerator<StreamChunk> {
    const res = await call(p, true);
    let finishReason = "stop";
    let usage = { promptTokens: 0, completionTokens: 0 };
    for await (const raw of parseSSE(res.body!)) {
      const chunk = raw as Completion;
      const choice = chunk.choices?.[0];
      if (choice?.delta?.content) yield { type: "text", text: choice.delta.content };
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (chunk.usage) usage = { promptTokens: chunk.usage.prompt_tokens, completionTokens: chunk.usage.completion_tokens };
    }
    yield { type: "done", finishReason, ...usage };
  },
};
