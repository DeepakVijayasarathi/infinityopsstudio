import { beforeEach, describe, expect, it, vi } from "vitest";

const probe = vi.hoisted(() => vi.fn(async (_token?: string) => ({ ok: true, message: "Connected — Claude replied “OK”." })));
vi.mock("@/server/ai/providers/claude-code", async (orig) => ({ ...(await orig<typeof import("@/server/ai/providers/claude-code")>()), probeClaudeCode: probe }));

import { db } from "@/server/db";
import { decrypt } from "@/server/crypto";
import { DEFAULT_AI_SETTINGS, getSetting } from "@/server/settings";
import { claudeStatus, connectClaude, disconnectClaude, testClaude } from "@/server/services/claude-connection";
import { createOwner, resetDb } from "../helpers/factory";

const TOKEN = "sk-ant-oat01-" + "a".repeat(60);

beforeEach(async () => {
  await resetDb();
  probe.mockClear();
});

describe("connecting a Claude plan from the browser", () => {
  it("rejects malformed tokens without testing them", async () => {
    const admin = await createOwner("Admin");
    await expect(connectClaude(admin.user.id, "not-a-token-at-all-really")).rejects.toThrow(/doesn't look like a Claude token/);
    expect(probe).not.toHaveBeenCalled();
  });

  it("refuses a token Claude doesn't accept", async () => {
    const admin = await createOwner("Admin");
    probe.mockResolvedValueOnce({ ok: false, message: "Invalid bearer token" });
    await expect(connectClaude(admin.user.id, TOKEN)).rejects.toThrow(/didn't accept this token: Invalid bearer token/);
    expect((await claudeStatus()).connected).toBe(false);
  });

  it("stores the token encrypted, switches the default model and disconnects cleanly", async () => {
    const admin = await createOwner("Admin");
    const status = await connectClaude(admin.user.id, `  ${TOKEN}\n`);
    expect(probe).toHaveBeenCalledWith(TOKEN);
    expect(status).toMatchObject({ connected: true, lastTest: { ok: true } });
    expect(JSON.stringify(status)).not.toContain(TOKEN);

    const row = await db.systemSetting.findUniqueOrThrow({ where: { key: "claude-code" } });
    const stored = (row.value as { token: string }).token;
    expect(stored).not.toContain("sk-ant");
    expect(decrypt(stored)).toBe(TOKEN);
    expect((await getSetting("ai", DEFAULT_AI_SETTINGS)).defaultModel).toBe("claude-code-sonnet");
    expect(await db.auditLog.count({ where: { action: "admin.claude_connected" } })).toBe(1);

    probe.mockResolvedValueOnce({ ok: false, message: "Rate limited" });
    expect((await testClaude(admin.user.id)).lastTest).toMatchObject({ ok: false, message: "Rate limited" });

    const off = await disconnectClaude(admin.user.id);
    expect(off.connected).toBe(false);
    expect((await getSetting("ai", DEFAULT_AI_SETTINGS)).defaultModel).toBeNull();
    expect(((await db.systemSetting.findUniqueOrThrow({ where: { key: "claude-code" } })).value as { token: string | null }).token).toBeNull();
  });
});
