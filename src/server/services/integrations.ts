import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { badRequest, notFound } from "../errors";
import { decrypt, encrypt } from "../crypto";
import { audit } from "../audit";
import type { WorkspaceContext } from "../tenant";
import { getIntegration, INTEGRATIONS, type TestResult } from "../integrations/registry";
import { PROVIDERS } from "../ai/registry";
import { notify } from "./notifications";

export async function listIntegrations(workspaceId: string) {
  const connected = await db.integration.findMany({ where: { workspaceId } });
  const aiStatus: Record<string, boolean> = {
    anthropic: PROVIDERS.anthropic.isConfigured(),
    openai: PROVIDERS.openai.isConfigured(),
    "google-ai": PROVIDERS.google.isConfigured(),
  };
  // Roadmap ("coming soon") entries are listed after everything that can be connected today.
  const ordered = [...INTEGRATIONS].sort((a, b) => Number(a.availability === "coming_soon") - Number(b.availability === "coming_soon"));
  return ordered.map(({ test, ...def }) => {
    const row = connected.find((c) => c.provider === def.key);
    return {
      ...def,
      testable: !!test,
      connection: row
        ? { id: row.id, status: row.status, config: row.config as Record<string, string> | null, lastSyncAt: row.lastSyncAt, error: row.error, createdAt: row.createdAt }
        : def.availability === "admin" && aiStatus[def.key]
          ? { id: null, status: "CONNECTED" as const, config: null, lastSyncAt: null, error: null, createdAt: null }
          : null,
    };
  });
}

function split(key: string, values: Record<string, string>) {
  const def = getIntegration(key);
  if (!def || def.availability !== "available") throw notFound("Integration");
  const config: Record<string, string> = {};
  const credentials: Record<string, string> = {};
  for (const f of def.fields) {
    const v = values[f.key]?.trim();
    if (f.required && !v) throw badRequest(`${f.label} is required`);
    if (!v) continue;
    if (f.type === "url") {
      try {
        const u = new URL(v);
        if (u.protocol !== "https:" && process.env.NODE_ENV === "production") throw new Error();
      } catch {
        throw badRequest(`${f.label} must be a valid https URL`);
      }
    }
    (f.secret ? credentials : config)[f.key] = v;
  }
  return { def, config, credentials };
}

export async function connectIntegration(ctx: WorkspaceContext, key: string, values: Record<string, string>) {
  const { def, config, credentials } = split(key, values);
  let result: TestResult | null = null;
  if (def.test) result = await def.test(config, credentials);
  const data = {
    category: def.category,
    status: result && !result.ok ? ("ERROR" as const) : ("CONNECTED" as const),
    config: config as Prisma.InputJsonValue,
    credentials: Object.keys(credentials).length ? encrypt(JSON.stringify(credentials)) : null,
    error: result && !result.ok ? result.message : null,
    connectedById: ctx.user.id,
  };
  const row = await db.integration.upsert({
    where: { workspaceId_provider: { workspaceId: ctx.workspace.id, provider: key } },
    create: { workspaceId: ctx.workspace.id, provider: key, ...data },
    update: data,
  });
  await audit({ action: "integration.connected", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "Integration", entityId: row.id, metadata: { provider: key, ok: result?.ok ?? null } });
  return { id: row.id, status: row.status, test: result };
}

export async function testIntegration(ctx: WorkspaceContext, key: string) {
  const row = await db.integration.findUnique({ where: { workspaceId_provider: { workspaceId: ctx.workspace.id, provider: key } } });
  const def = getIntegration(key);
  if (!row || !def) throw notFound("Integration");
  if (!def.test) return { ok: true, message: "Credentials saved. They are used the next time this integration sends or syncs." };
  const creds = row.credentials ? (JSON.parse(decrypt(row.credentials)) as Record<string, string>) : {};
  const result = await def.test((row.config ?? {}) as Record<string, string>, creds);
  await db.integration.update({ where: { id: row.id }, data: { status: result.ok ? "CONNECTED" : "ERROR", error: result.ok ? null : result.message, lastSyncAt: new Date() } });
  if (!result.ok && row.status === "CONNECTED") {
    await notify({ workspaceId: ctx.workspace.id, type: "integration.disconnected", title: `${def.name} needs attention`, body: result.message, link: "/app/integrations", permission: "integrations:manage" });
  }
  return result;
}

export async function disconnectIntegration(ctx: WorkspaceContext, key: string) {
  const row = await db.integration.findUnique({ where: { workspaceId_provider: { workspaceId: ctx.workspace.id, provider: key } } });
  if (!row) throw notFound("Integration");
  await db.integration.delete({ where: { id: row.id } });
  await audit({ action: "integration.disconnected", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "Integration", entityId: row.id, metadata: { provider: key } });
}

/** Server-side only: decrypted credentials for provider calls. */
export async function integrationCredentials(workspaceId: string, key: string) {
  const row = await db.integration.findUnique({ where: { workspaceId_provider: { workspaceId, provider: key } } });
  if (!row || row.status !== "CONNECTED") return null;
  return {
    config: (row.config ?? {}) as Record<string, string>,
    credentials: row.credentials ? (JSON.parse(decrypt(row.credentials)) as Record<string, string>) : {},
  };
}
