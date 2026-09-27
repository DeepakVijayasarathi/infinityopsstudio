export type ProviderId = "anthropic" | "openai" | "google" | "claude-code" | "local";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type GenerateParams = {
  model: string;
  system?: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  signal?: AbortSignal;
};

export type Usage = { promptTokens: number; completionTokens: number };

export type GenerateResult = Usage & { text: string; finishReason: string };

export type StreamChunk = { type: "text"; text: string } | ({ type: "done"; finishReason: string } & Usage);

export interface AIProvider {
  id: ProviderId;
  label: string;
  isConfigured(): boolean;
  generate(params: GenerateParams): Promise<GenerateResult>;
  stream(params: GenerateParams): AsyncGenerator<StreamChunk>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export type ModelInfo = {
  id: string;
  provider: ProviderId;
  label: string;
  description: string;
  /** USD per 1M tokens. Numerically equal to micro-dollars per token. */
  inputPerMTok: number;
  outputPerMTok: number;
  contextWindow: number;
  /** Model rejects sampling params such as temperature. */
  noSampling?: boolean;
};
