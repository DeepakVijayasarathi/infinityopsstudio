# AI architecture

Every AI feature — workers, the content generator, inline editor actions, worker chat, the email writer, campaign strategies, SEO keyword suggestions, social captions and hashtags, and automation AI steps — goes through one service layer. Provider keys stay on the server; the browser only ever talks to `/api/v1`.

```
feature code ──▶ generateText / streamText (src/server/ai/service.ts)
                   │ 1. credit check (plan limit)          → 402 when exhausted
                   │ 2. resolveModel()                       (registry.ts)
                   │ 3. system prompt + Brand Kit context    (context.ts)
                   │ 4. provider call with timeout + retries (providers/*)
                   │ 5. cost + credits                       (models.ts)
                   └ 6. AIRequest audit row + UsageRecord
```

## Providers

`src/server/ai/providers` implements one interface:

```ts
interface AIProvider {
  id: "anthropic" | "openai" | "google" | "local";
  isConfigured(): boolean;
  generate(params): Promise<{ text; promptTokens; completionTokens; finishReason }>;
  stream(params): AsyncGenerator<{ type: "text"; text } | { type: "done"; … }>;
}
```

| Provider | Implementation | Key |
|---|---|---|
| Anthropic | Official `@anthropic-ai/sdk` (Messages API, streaming) | `ANTHROPIC_API_KEY` |
| OpenAI | Chat Completions over `fetch` with SSE parsing | `OPENAI_API_KEY` |
| Google | Gemini `generateContent` / `streamGenerateContent` over `fetch` | `GOOGLE_AI_API_KEY` |
| Local | Deterministic offline template engine | none |

Provider errors are normalised to `ProviderError { retryable, status }`: rate limits, timeouts, connection failures and 5xx are retryable; authentication errors, bad requests and refusals are not.

**Anthropic specifics.** Opus 5 and Sonnet 5 manage sampling themselves, so `temperature` is omitted for them (`noSampling` in the catalog). Requests to Opus-tier models opt into server-side fallbacks (`fallbacks: "default"` with the `server-side-fallback-2026-07-01` beta), so a request declined by a safety classifier is re-run on a suitable model instead of failing the task. A final `stop_reason: "refusal"` is surfaced as a clear, non-retryable error ("The model declined this request…").

**The local provider** makes every feature usable without API keys (development, CI, demos). It reads the brief and the Brand Kit context and returns structured marketing output — strategies, blog posts, social posts, ad variations, keyword tables, analyses — and applies inline transforms (summarise, shorten, expand, rewrite) to the given text. It is labelled *Infinity Local (demo)* in model pickers and is never chosen when a real provider is configured and selected.

## Models

`MODEL_CATALOG` (`src/server/ai/models.ts`) lists each model's provider, context window and price per million tokens:

| Model | Provider | Input $/MTok | Output $/MTok |
|---|---|---|---|
| `claude-opus-5` | Anthropic | 5.00 | 25.00 |
| `claude-sonnet-5` | Anthropic | 2.00 | 10.00 |
| `claude-haiku-4-5` | Anthropic | 1.00 | 5.00 |
| `gpt-4.1` | OpenAI | 2.00 | 8.00 |
| `gpt-4.1-mini` | OpenAI | 0.40 | 1.60 |
| `gemini-2.5-pro` | Google | 1.25 | 10.00 |
| `gemini-2.5-flash` | Google | 0.30 | 2.50 |
| `infinity-local` | Local | 0 | 0 |

A model is **usable** when its provider has a key and the platform admin hasn't disabled it. `resolveModel(requested)` picks, in order:

1. the model requested by the feature (a worker's configured model, or the user's choice in a picker) — if admins allow user model selection,
2. the admin default model (`/admin/settings`),
3. `AI_DEFAULT_MODEL`,
4. the default model of `AI_DEFAULT_PROVIDER`,
5. the first usable real model, then the local provider.

Super admins enable or disable models, set the default, control whether users may pick models and override prices (for negotiated rates) at `/admin/settings`; overrides apply to cost calculations immediately. `/admin/ai` reports usage and cost.

## Prompts

- **Workers** (`src/config/workers.ts`): each of the eight workers has a system prompt describing its role and standards, plus capabilities, each with a prompt template (`{{input}}` is the user's brief). A workspace can add custom instructions, choose a model and temperature, and require approval per worker.
- **Content generator** (`src/server/ai/prompts.ts`): seven generators (blog, social, ad, landing page, email, product description, SEO meta), each with form fields and a template, plus eight tones and seven inline editor actions (rewrite, summarise, expand, shorten, change tone, repurpose, improve).
- **Brand Kit context** (`src/server/ai/context.ts`) is appended to every system prompt: company, tagline, industry, voice and attributes, audience, products, USPs, competitors, always / never rules and guidelines. Callers that must stay brand-neutral can opt out with `useBrandContext: false`.

## Execution paths

| Path | Used by | Mechanics |
|---|---|---|
| **Queued** | AI worker tasks, automation *Assign worker* steps | `AITask` row → `ai` queue → `runTask()` → `generateText` → `AWAITING_APPROVAL` (or `COMPLETED` when the worker doesn't require approval) → notification to the requester |
| **Streaming** | Content generator, inline actions, worker chat, email writer | `streamText` returns an SSE stream (`meta`, `token`, `done`, `error`); the client hook `useAIStream` renders tokens as they arrive and supports stopping |
| **Inline** | Campaign strategy, keyword suggestions, captions, hashtags, automation *AI action* steps | `generateText` inside the request or job |

Failed tasks keep their error message and can be retried; reviewers can approve, reject with a note, or edit the output before approving, then save it to Content Studio.

## Reliability

- Timeout per call: `AI_REQUEST_TIMEOUT_MS` (default 60 s).
- Retries: up to `AI_MAX_RETRIES` (default 2) for retryable errors, with exponential backoff (500 ms × 2ⁿ, capped at 8 s) and jitter. Streams are retried only if no text has been sent yet.
- Default `max_tokens` is 16,000; long generations stream so they never hit HTTP timeouts.

## Cost and usage tracking

For every call, successful or not, an `AIRequest` row records workspace, user, task, feature (for example `worker:content-writer:blog-post`), provider, model, prompt and completion tokens, cost in micro-dollars, latency, status and a 280-character prompt preview.

Successful calls also write `UsageRecord`s:

- `AI_CREDITS` — 1 credit per 1,000 tokens (minimum 1), checked against the plan's monthly allowance before each call,
- `AI_TOKENS` — raw token count.

Workspaces see usage on the Billing page and in Analytics › AI usage; super admins see platform-wide cost by model, provider, feature and workspace at `/admin/ai`.

## Adding a provider or model

1. Implement `AIProvider` in `src/server/ai/providers/<name>.ts` and register it in `registry.ts`.
2. Add its key to `src/server/env.ts` and `.env.example`.
3. Add models with pricing to `MODEL_CATALOG` and a default in `DEFAULT_MODEL_BY_PROVIDER`.
4. Add a unit test for request mapping and error normalisation.
