import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline";
import { env } from "../../env";
import { logger } from "../../logger";
import { decrypt } from "../../crypto";
import { getSetting } from "../../settings";
import { ProviderError, type AIProvider, type GenerateParams, type GenerateResult, type StreamChunk } from "../types";

/**
 * Runs AI requests through a locally installed, signed-in Claude Code CLI (`claude -p`)
 * instead of an API key. Requests use the account the CLI is logged in with, so this is
 * meant for running the app on your own machine. The CLI runs with all tools disabled,
 * no session persistence and a scratch working directory: it only generates text.
 *
 * On a server, a super admin can connect a Claude Pro/Max plan from Admin → Settings: the
 * `claude setup-token` token is stored encrypted and handed to the CLI per request.
 */

export const CLAUDE_CONNECTION_KEY = "claude-code";
export type ClaudeConnection = { enabled: boolean; token: string | null; connectedAt: string | null; connectedBy: string | null; lastTest: { ok: boolean; message: string; at: string } | null };
export const DEFAULT_CLAUDE_CONNECTION: ClaudeConnection = { enabled: false, token: null, connectedAt: null, connectedBy: null, lastTest: null };

// `isConfigured` is synchronous, so the browser-made connection is mirrored here. The settings
// cache refreshes every 30 s, which is how the web and worker containers pick up a change.
let connection: ClaudeConnection = DEFAULT_CLAUDE_CONNECTION;
export async function syncClaudeConnection(): Promise<ClaudeConnection> {
  connection = await getSetting(CLAUDE_CONNECTION_KEY, DEFAULT_CLAUDE_CONNECTION);
  return connection;
}
const connected = () => connection.enabled && !!connection.token;

/** Catalog model id → CLI model alias. */
export const CLAUDE_CODE_MODELS: Record<string, string> = {
  "claude-code-opus": "opus",
  "claude-code-sonnet": "sonnet",
  "claude-code-haiku": "haiku",
};

let installed: boolean | undefined;
let version: string | null = null;
function cliInstalled(): boolean {
  if (installed === undefined) {
    const r = spawnSync(env().CLAUDE_CODE_PATH, ["--version"], { timeout: 10_000, encoding: "utf8" });
    installed = r.status === 0 && /claude code/i.test(r.stdout ?? "");
    version = installed ? (r.stdout ?? "").trim().split(/\s+/)[0] ?? null : null;
    if (!installed) logger.warn("Claude Code CLI not found; the claude-code AI provider is unavailable", { path: env().CLAUDE_CODE_PATH });
  }
  return installed;
}

export function claudeCli(): { installed: boolean; version: string | null } {
  return { installed: cliInstalled(), version };
}

// Each call starts a CLI process, so cap how many run at once.
let running = 0;
const waiting: (() => void)[] = [];
async function acquire(): Promise<() => void> {
  if (running >= env().CLAUDE_CODE_MAX_CONCURRENCY) await new Promise<void>((r) => waiting.push(r));
  running++;
  return () => {
    running--;
    waiting.shift()?.();
  };
}

/** The CLI takes one prompt, so earlier turns of a conversation are replayed as a transcript. */
export function buildPrompt(messages: GenerateParams["messages"]): string {
  if (messages.length === 1) return messages[0]!.content;
  const history = messages.slice(0, -1).map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n");
  const last = messages[messages.length - 1]!;
  return `Conversation so far:\n\n${history}\n\n---\n\nReply to this latest message from the user:\n\n${last.content}`;
}

export function buildArgs(p: GenerateParams): string[] {
  const model = CLAUDE_CODE_MODELS[p.model] ?? "sonnet";
  return [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--tools", "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--model", model,
    ...(p.system ? ["--system-prompt", p.system] : []),
  ];
}

type ResultLine = { type: "result"; is_error?: boolean; result?: string; api_error_status?: number | null; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };

/** `token` overrides the stored/environment token (used to test a token before saving it). */
async function* run(p: GenerateParams, token?: string): AsyncGenerator<StreamChunk> {
  if (p.signal?.aborted) throw new ProviderError("Request timed out", true);
  const release = await acquire();
  // Never hand the CLI an API key: it must use the signed-in Claude account.
  const { ANTHROPIC_API_KEY: _key, ANTHROPIC_AUTH_TOKEN: _token, ...childEnv } = process.env;
  const oauth = token ?? (connected() ? decrypt(connection.token!) : null);
  if (oauth) childEnv.CLAUDE_CODE_OAUTH_TOKEN = oauth;
  const child = spawn(env().CLAUDE_CODE_PATH, buildArgs(p), { cwd: tmpdir(), env: childEnv, stdio: ["pipe", "pipe", "pipe"] });
  const onAbort = () => child.kill("SIGTERM");
  p.signal?.addEventListener("abort", onAbort, { once: true });

  let stderr = "";
  child.stderr.on("data", (d: Buffer) => {
    stderr = (stderr + d.toString()).slice(-2000);
  });
  const exited = new Promise<number | null>((resolve) => child.on("close", resolve));
  const spawnError = new Promise<never>((_, reject) => child.on("error", (err) => reject(new ProviderError(`Could not start Claude Code: ${err.message}`, false))));
  spawnError.catch(() => undefined);

  child.stdin.end(buildPrompt(p.messages));

  let result: ResultLine | null = null;
  try {
    for await (const line of createInterface({ input: child.stdout })) {
      if (!line.startsWith("{")) continue;
      let msg: { type?: string; subtype?: string; error_status?: number; event?: { type?: string; delta?: { type?: string; text?: string } } };
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      // The CLI retries failed sign-ins up to 10 times; a rejected token won't start working.
      if (msg.type === "system" && msg.subtype === "api_retry" && (msg.error_status === 401 || msg.error_status === 403)) {
        throw new ProviderError("Claude rejected the sign-in (authentication failed). The token may be wrong, expired or revoked — create a new one with `claude setup-token`.", false, msg.error_status);
      }
      if (msg.type === "stream_event" && msg.event?.type === "content_block_delta" && msg.event.delta?.type === "text_delta" && msg.event.delta.text) {
        yield { type: "text", text: msg.event.delta.text };
      } else if (msg.type === "result") {
        result = msg as ResultLine;
      }
    }
    const code = await Promise.race([exited, spawnError]);
    if (p.signal?.aborted) throw new ProviderError("Request timed out", true);
    if (!result) throw new ProviderError(`Claude Code exited (${code ?? "killed"}) without a result${stderr ? `: ${stderr.trim().slice(-300)}` : ""}`, true);
    if (result.is_error) {
      const status = result.api_error_status ?? undefined;
      const text = result.result ?? "Claude Code request failed";
      const retryable = status === 429 || (status !== undefined && status >= 500) || /rate limit|overloaded/i.test(text);
      throw new ProviderError(/login|log in|authenticat/i.test(text) ? `${text} On a Docker server run: Admin → Settings → Connect Claude (or bash manage.sh connect-claude) — on your own computer run \`claude\` once and sign in.` : text, retryable, status);
    }
    if (result.stop_reason === "refusal") throw new ProviderError("The model declined this request. Try rephrasing the brief.", false, 400);
    const u = result.usage ?? {};
    yield {
      type: "done",
      finishReason: result.stop_reason ?? "end_turn",
      promptTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
      completionTokens: u.output_tokens ?? 0,
    };
  } finally {
    p.signal?.removeEventListener("abort", onAbort);
    if (child.exitCode === null) child.kill("SIGTERM");
    release();
  }
}

export const claudeCodeProvider: AIProvider = {
  id: "claude-code",
  label: "Claude Code (local)",
  // Opt-in, so a developer machine with the CLI installed never spends its Claude usage by surprise.
  isConfigured: () => (env().AI_DEFAULT_PROVIDER === "claude-code" || env().CLAUDE_CODE_ENABLED || connected()) && cliInstalled(),

  async generate(p): Promise<GenerateResult> {
    let text = "";
    for await (const chunk of run(p)) {
      if (chunk.type === "text") text += chunk.text;
      else return { text, promptTokens: chunk.promptTokens, completionTokens: chunk.completionTokens, finishReason: chunk.finishReason };
    }
    throw new ProviderError("Claude Code returned no result", true);
  },

  stream: (p) => run(p),
};

/** Sends a one-word prompt through the CLI to prove the sign-in works. */
export async function probeClaudeCode(token?: string): Promise<{ ok: boolean; message: string }> {
  if (!cliInstalled()) return { ok: false, message: "Claude Code isn't installed in this container. Rebuild the image with INSTALL_CLAUDE_CODE=1 (the default)." };
  try {
    let text = "";
    for await (const c of run({ model: "claude-code-haiku", messages: [{ role: "user", content: "Reply with exactly: OK" }], maxTokens: 10, signal: AbortSignal.timeout(90_000) }, token)) {
      if (c.type === "text") text += c.text;
    }
    return { ok: true, message: `Connected — Claude replied “${text.trim().slice(0, 40) || "OK"}”.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message.replace(/ On a Docker server run:[\s\S]*$/, "") : "Test failed" };
  }
}
