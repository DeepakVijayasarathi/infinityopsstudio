import { encrypt } from "../crypto";
import { env } from "../env";
import { audit } from "../audit";
import { badRequest } from "../errors";
import { DEFAULT_AI_SETTINGS, getSetting, setSetting } from "../settings";
import { resolveModel } from "../ai/registry";
import { CLAUDE_CONNECTION_KEY, claudeCli, probeClaudeCode, syncClaudeConnection, type ClaudeConnection } from "../ai/providers/claude-code";

/**
 * Connecting a Claude Pro/Max plan from the browser (Admin → Settings). The long-lived token
 * from `claude setup-token` is tested first, then stored encrypted; it is never sent back
 * to the browser.
 */

// `claude setup-token` prints an OAuth token such as sk-ant-oat01-…
const TOKEN_RE = /^sk-ant-[a-z0-9]+-[A-Za-z0-9_-]{20,}$/;

export async function claudeStatus() {
  const c = await syncClaudeConnection();
  const e = env();
  const model = await resolveModel(null);
  return {
    cli: claudeCli(),
    connected: c.enabled && !!c.token,
    connectedAt: c.connectedAt,
    lastTest: c.lastTest,
    // Set up with manage.sh / environment variables instead of the browser.
    viaEnvironment: e.AI_DEFAULT_PROVIDER === "claude-code" || !!process.env.CLAUDE_CODE_OAUTH_TOKEN,
    activeModel: { id: model.id, label: model.label, provider: model.provider },
  };
}

async function save(next: ClaudeConnection) {
  await setSetting(CLAUDE_CONNECTION_KEY, next);
  await syncClaudeConnection();
}

export async function connectClaude(userId: string, rawToken: string) {
  const token = rawToken.trim();
  if (!TOKEN_RE.test(token)) throw badRequest("That doesn't look like a Claude token. Run `claude setup-token` and paste the whole token (it starts with sk-ant-).");
  const test = await probeClaudeCode(token);
  if (!test.ok) throw badRequest(`Claude didn't accept this token: ${test.message}`);
  const now = new Date().toISOString();
  await save({ enabled: true, token: encrypt(token), connectedAt: now, connectedBy: userId, lastTest: { ...test, at: now } });

  // Use Claude for everything unless an admin already picked a real model.
  const ai = await getSetting("ai", DEFAULT_AI_SETTINGS);
  if (!ai.defaultModel || ai.defaultModel === "infinity-local") await setSetting("ai", { ...ai, defaultModel: "claude-code-sonnet" });
  await audit({ action: "admin.claude_connected", actorId: userId });
  return claudeStatus();
}

export async function testClaude(userId: string) {
  const c = await syncClaudeConnection();
  const test = await probeClaudeCode();
  await save({ ...c, lastTest: { ...test, at: new Date().toISOString() } });
  await audit({ action: "admin.claude_tested", actorId: userId, metadata: { ok: test.ok } });
  return claudeStatus();
}

export async function disconnectClaude(userId: string) {
  const c = await syncClaudeConnection();
  await save({ ...c, enabled: false, token: null, lastTest: null });
  const ai = await getSetting("ai", DEFAULT_AI_SETTINGS);
  if (ai.defaultModel?.startsWith("claude-code") && env().AI_DEFAULT_PROVIDER !== "claude-code") await setSetting("ai", { ...ai, defaultModel: null });
  await audit({ action: "admin.claude_disconnected", actorId: userId });
  return claudeStatus();
}
