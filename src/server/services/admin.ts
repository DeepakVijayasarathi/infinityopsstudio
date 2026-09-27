import type { PlanKey, Prisma } from "@prisma/client";
import { db } from "../db";
import { badRequest, notFound } from "../errors";
import { audit } from "../audit";
import { revokeAllSessions } from "../auth/session";
import { paginated, pageArgs, type PaginationInput } from "../pagination";
import { getPlan, PLANS } from "@/config/plans";
import { aiUsageAnalytics, resolveRange } from "./analytics";
import { queueHealth } from "../queue";
import { setSetting } from "../settings";

export async function adminDashboard() {
  const since30 = new Date(Date.now() - 30 * 86400_000);
  const since1 = new Date(Date.now() - 86400_000);
  const [users, activeUsers, workspaces, subs, aiRequests, aiCost, campaigns, errors, signups] = await Promise.all([
    db.user.count({ where: { deletedAt: null } }),
    db.user.count({ where: { deletedAt: null, lastLoginAt: { gte: since30 } } }),
    db.workspace.count({ where: { deletedAt: null } }),
    db.subscription.findMany({ where: { status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] }, workspace: { deletedAt: null } }, select: { plan: true, interval: true } }),
    db.aIRequest.count({ where: { createdAt: { gte: since30 } } }),
    db.aIRequest.aggregate({ where: { createdAt: { gte: since30 } }, _sum: { costMicros: true } }),
    db.campaign.count({ where: { deletedAt: null } }),
    db.systemLog.count({ where: { level: "error", createdAt: { gte: since1 } } }),
    db.user.findMany({ where: { createdAt: { gte: since30 } }, select: { createdAt: true } }),
  ]);
  const mrrCents = subs.reduce((a, s) => {
    const p = getPlan(s.plan);
    if (p.monthlyPriceCents === null) return a;
    return a + (s.interval === "YEARLY" ? (p.yearlyPriceCents ?? p.monthlyPriceCents) : p.monthlyPriceCents);
  }, 0);
  const byPlan = PLANS.map((p) => ({ plan: p.key, name: p.name, count: subs.filter((s) => s.plan === p.key).length }));
  const signupSeries = new Map<string, number>();
  for (let i = 29; i >= 0; i--) signupSeries.set(new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10), 0);
  for (const u of signups) {
    const k = u.createdAt.toISOString().slice(0, 10);
    if (signupSeries.has(k)) signupSeries.set(k, signupSeries.get(k)! + 1);
  }
  return {
    metrics: { users, activeUsers, workspaces, mrrCents, aiRequests, aiCostMicros: aiCost._sum.costMicros ?? 0, campaigns, errors },
    byPlan,
    signups: [...signupSeries.entries()].map(([date, count]) => ({ date, count })),
    queues: await queueHealth().catch(() => null),
  };
}

export async function adminUsers(p: PaginationInput) {
  const where: Prisma.UserWhereInput = { deletedAt: null, ...(p.q ? { OR: [{ email: { contains: p.q, mode: "insensitive" } }, { name: { contains: p.q, mode: "insensitive" } }] } : {}) };
  const [items, total] = await Promise.all([
    db.user.findMany({
      where,
      select: { id: true, name: true, email: true, platformRole: true, status: true, emailVerifiedAt: true, twoFactorEnabled: true, lastLoginAt: true, createdAt: true, _count: { select: { memberships: true } } },
      orderBy: { createdAt: "desc" },
      ...pageArgs(p),
    }),
    db.user.count({ where }),
  ]);
  return paginated(items, total, p);
}

export async function setUserStatus(actorId: string, userId: string, status: "ACTIVE" | "SUSPENDED") {
  if (actorId === userId) throw badRequest("You cannot change your own status");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound("User");
  await db.user.update({ where: { id: userId }, data: { status } });
  if (status === "SUSPENDED") await revokeAllSessions(userId);
  await audit({ action: status === "SUSPENDED" ? "admin.user_suspended" : "admin.user_reactivated", actorId, entityType: "User", entityId: userId });
}

export async function setUserRole(actorId: string, userId: string, platformRole: "USER" | "SUPER_ADMIN") {
  if (actorId === userId) throw badRequest("You cannot change your own platform role");
  await db.user.update({ where: { id: userId }, data: { platformRole } });
  await audit({ action: "admin.user_role_changed", actorId, entityType: "User", entityId: userId, metadata: { platformRole } });
}

export async function adminWorkspaces(p: PaginationInput) {
  const where: Prisma.WorkspaceWhereInput = { deletedAt: null, ...(p.q ? { name: { contains: p.q, mode: "insensitive" } } : {}) };
  const [items, total] = await Promise.all([
    db.workspace.findMany({
      where,
      include: { subscription: { select: { plan: true, status: true, interval: true, provider: true } }, _count: { select: { members: true, campaigns: true, leads: true } } },
      orderBy: { createdAt: "desc" },
      ...pageArgs(p),
    }),
    db.workspace.count({ where }),
  ]);
  return paginated(items, total, p);
}

export async function adminSetPlan(actorId: string, workspaceId: string, plan: PlanKey) {
  const sub = await db.subscription.findUnique({ where: { workspaceId } });
  if (!sub) throw notFound("Subscription");
  await db.subscription.update({ where: { id: sub.id }, data: { plan, status: "ACTIVE", pendingPlan: null, cancelAtPeriodEnd: false } });
  await audit({ action: "admin.plan_overridden", actorId, workspaceId, metadata: { from: sub.plan, to: plan } });
}

export async function adminSubscriptions() {
  return db.subscription.findMany({
    where: { workspace: { deletedAt: null } },
    include: { workspace: { select: { id: true, name: true } }, invoices: { orderBy: { issuedAt: "desc" }, take: 1, select: { status: true, amountCents: true, issuedAt: true } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}

export async function markInvoicePaid(actorId: string, invoiceId: string) {
  const inv = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) throw notFound("Invoice");
  if (inv.status === "PAID") throw badRequest("Invoice is already paid");
  await db.invoice.update({ where: { id: invoiceId }, data: { status: "PAID", paidAt: new Date() } });
  await audit({ action: "admin.invoice_marked_paid", actorId, workspaceId: inv.workspaceId, entityType: "Invoice", entityId: invoiceId });
}

export async function adminAiUsage(days: number) {
  const usage = await aiUsageAnalytics(null, resolveRange({ days }));
  const byWorkspace = await db.aIRequest.groupBy({
    by: ["workspaceId"],
    where: { createdAt: { gte: new Date(Date.now() - days * 86400_000) } },
    _sum: { costMicros: true, promptTokens: true, completionTokens: true },
    _count: true,
    orderBy: { _sum: { costMicros: "desc" } },
    take: 20,
  });
  const names = await db.workspace.findMany({ where: { id: { in: byWorkspace.map((w) => w.workspaceId).filter(Boolean) as string[] } }, select: { id: true, name: true } });
  const recentErrors = await db.aIRequest.findMany({ where: { status: "ERROR" }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, provider: true, model: true, feature: true, errorMessage: true, createdAt: true } });
  return {
    ...usage,
    byWorkspace: byWorkspace.map((w) => ({ workspaceId: w.workspaceId, name: names.find((n) => n.id === w.workspaceId)?.name ?? "—", requests: w._count, tokens: (w._sum.promptTokens ?? 0) + (w._sum.completionTokens ?? 0), costMicros: w._sum.costMicros ?? 0 })),
    recentErrors,
  };
}

export async function adminContentOverview() {
  const [campaigns, content, workers, integrations] = await Promise.all([
    db.campaign.groupBy({ by: ["status"], where: { deletedAt: null }, _count: true }),
    db.content.groupBy({ by: ["type"], where: { deletedAt: null }, _count: true }),
    db.aITask.groupBy({ by: ["status"], _count: true }),
    db.integration.groupBy({ by: ["provider", "status"], _count: true }),
  ]);
  const workerUsage = await db.aITask.groupBy({ by: ["workerId"], _count: true, orderBy: { _count: { workerId: "desc" } }, take: 50 });
  const workerRows = await db.aIWorker.findMany({ where: { id: { in: workerUsage.map((w) => w.workerId) } }, select: { id: true, key: true, title: true } });
  const byKey = new Map<string, { title: string; tasks: number }>();
  for (const w of workerUsage) {
    const row = workerRows.find((r) => r.id === w.workerId);
    if (!row) continue;
    const cur = byKey.get(row.key) ?? { title: row.title, tasks: 0 };
    cur.tasks += w._count;
    byKey.set(row.key, cur);
  }
  return {
    campaigns: campaigns.map((c) => ({ status: c.status, count: c._count })),
    content: content.map((c) => ({ type: c.type, count: c._count })),
    tasks: workers.map((t) => ({ status: t.status, count: t._count })),
    workers: [...byKey.entries()].map(([key, v]) => ({ key, ...v })),
    integrations: integrations.map((i) => ({ provider: i.provider, status: i.status, count: i._count })),
  };
}

export async function auditLogs(p: PaginationInput & { action?: string; workspaceId?: string }) {
  const where: Prisma.AuditLogWhereInput = {
    ...(p.action ? { action: { startsWith: p.action } } : {}),
    ...(p.workspaceId ? { workspaceId: p.workspaceId } : {}),
    ...(p.q ? { OR: [{ action: { contains: p.q } }, { actor: { email: { contains: p.q, mode: "insensitive" } } }] } : {}),
  };
  const [items, total] = await Promise.all([
    db.auditLog.findMany({ where, include: { actor: { select: { email: true, name: true } }, workspace: { select: { name: true } } }, orderBy: { createdAt: "desc" }, ...pageArgs(p) }),
    db.auditLog.count({ where }),
  ]);
  return paginated(items, total, p);
}

export async function systemLogs(p: PaginationInput & { level?: string }) {
  const where: Prisma.SystemLogWhereInput = { ...(p.level ? { level: p.level } : {}), ...(p.q ? { message: { contains: p.q, mode: "insensitive" } } : {}) };
  const [items, total] = await Promise.all([db.systemLog.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs(p) }), db.systemLog.count({ where })]);
  return paginated(items, total, p);
}

export async function listFlags() {
  return db.featureFlag.findMany({ orderBy: { key: "asc" } });
}

export async function upsertFlag(actorId: string, input: { key: string; description?: string | null; enabled: boolean; rolloutPercent?: number; workspaceIds?: string[] }) {
  const flag = await db.featureFlag.upsert({ where: { key: input.key }, create: { ...input, workspaceIds: input.workspaceIds ?? [] }, update: input });
  await audit({ action: "admin.flag_updated", actorId, entityType: "FeatureFlag", entityId: flag.id, metadata: { key: input.key, enabled: input.enabled } });
  return flag;
}

export async function deleteFlag(actorId: string, key: string) {
  await db.featureFlag.delete({ where: { key } });
  await audit({ action: "admin.flag_deleted", actorId, metadata: { key } });
}

export async function updateSettings(actorId: string, key: "ai" | "platform", value: Prisma.InputJsonValue) {
  await setSetting(key, value);
  await audit({ action: `admin.settings_${key}_updated`, actorId, metadata: value });
}
