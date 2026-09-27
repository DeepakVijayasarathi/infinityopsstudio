import type { CampaignObjective, CampaignStatus, Prisma, TaskStatus } from "@prisma/client";
import { db } from "../db";
import { badRequest, notFound, paymentRequired } from "../errors";
import { audit } from "../audit";
import { streamText } from "../ai/service";
import type { WorkspaceContext } from "../tenant";
import { can } from "../tenant";
import { paginated, pageArgs, orderBy, type PaginationInput } from "../pagination";
import { emitEvent } from "./events";
import { notify } from "./notifications";
import { enqueue } from "../queue";
import { getPlan, withinLimit } from "@/config/plans";

export type CampaignInput = {
  name: string;
  description?: string | null;
  objective?: CampaignObjective;
  status?: CampaignStatus;
  targetAudience?: string | null;
  budgetCents?: number;
  currency?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  channels?: string[];
  kpis?: Record<string, number> | null;
  ownerId?: string | null;
};

/** Allowed status transitions — keeps the lifecycle consistent. */
export const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ["PLANNING", "ACTIVE", "ARCHIVED"],
  PLANNING: ["DRAFT", "ACTIVE", "ARCHIVED"],
  ACTIVE: ["PAUSED", "COMPLETED"],
  PAUSED: ["ACTIVE", "COMPLETED", "ARCHIVED"],
  COMPLETED: ["ARCHIVED", "ACTIVE"],
  ARCHIVED: ["DRAFT"],
};

function validateDates(start?: Date | null, end?: Date | null) {
  if (start && end && end < start) throw badRequest("End date must be after the start date");
}

export async function listCampaigns(workspaceId: string, p: PaginationInput & { status?: CampaignStatus; objective?: CampaignObjective }) {
  const where: Prisma.CampaignWhereInput = {
    workspaceId,
    deletedAt: null,
    ...(p.status ? { status: p.status } : { status: { not: "ARCHIVED" } }),
    ...(p.objective ? { objective: p.objective } : {}),
    ...(p.q ? { OR: [{ name: { contains: p.q, mode: "insensitive" } }, { description: { contains: p.q, mode: "insensitive" } }] } : {}),
  };
  const [items, total] = await Promise.all([
    db.campaign.findMany({
      where,
      include: { owner: { select: { id: true, name: true } }, _count: { select: { tasks: true, contents: true, leads: true } } },
      orderBy: orderBy(p, ["createdAt", "updatedAt", "name", "startDate", "budgetCents"] as const, "createdAt"),
      ...pageArgs(p),
    }),
    db.campaign.count({ where }),
  ]);
  const ids = items.map((c) => c.id);
  const metrics = ids.length
    ? await db.metricDaily.groupBy({ by: ["campaignId"], where: { campaignId: { in: ids } }, _sum: { impressions: true, clicks: true, conversions: true, leads: true, revenueCents: true } })
    : [];
  return paginated(
    items.map((c) => ({ ...c, metrics: metrics.find((m) => m.campaignId === c.id)?._sum ?? null })),
    total,
    p,
  );
}

export async function getCampaign(workspaceId: string, id: string) {
  const campaign = await db.campaign.findFirst({
    where: { id, workspaceId, deletedAt: null },
    include: {
      owner: { select: { id: true, name: true } },
      tasks: { orderBy: [{ status: "asc" }, { sortOrder: "asc" }], include: { worker: { select: { id: true, name: true, color: true } } } },
      contents: { where: { deletedAt: null }, select: { id: true, title: true, type: true, status: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 20 },
      aiTasks: { select: { id: true, title: true, status: true, createdAt: true, worker: { select: { name: true, color: true } } }, orderBy: { createdAt: "desc" }, take: 10 },
      _count: { select: { leads: true, socialPosts: true, emailCampaigns: true } },
    },
  });
  if (!campaign) throw notFound("Campaign");
  return campaign;
}

export async function campaignPerformance(workspaceId: string, id: string) {
  const rows = await db.metricDaily.findMany({ where: { workspaceId, campaignId: id }, orderBy: { date: "asc" } });
  const byDate = new Map<string, { date: string; impressions: number; clicks: number; conversions: number; leads: number; spendCents: number; revenueCents: number }>();
  for (const r of rows) {
    const key = r.date.toISOString().slice(0, 10);
    const cur = byDate.get(key) ?? { date: key, impressions: 0, clicks: 0, conversions: 0, leads: 0, spendCents: 0, revenueCents: 0 };
    cur.impressions += r.impressions;
    cur.clicks += r.clicks;
    cur.conversions += r.conversions;
    cur.leads += r.leads;
    cur.spendCents += r.spendCents;
    cur.revenueCents += r.revenueCents;
    byDate.set(key, cur);
  }
  const series = [...byDate.values()];
  const totals = series.reduce(
    (a, d) => ({
      impressions: a.impressions + d.impressions,
      clicks: a.clicks + d.clicks,
      conversions: a.conversions + d.conversions,
      leads: a.leads + d.leads,
      spendCents: a.spendCents + d.spendCents,
      revenueCents: a.revenueCents + d.revenueCents,
    }),
    { impressions: 0, clicks: 0, conversions: 0, leads: 0, spendCents: 0, revenueCents: 0 },
  );
  const byChannel = await db.metricDaily.groupBy({ by: ["channel"], where: { workspaceId, campaignId: id }, _sum: { impressions: true, clicks: true, conversions: true, spendCents: true } });
  return {
    series,
    totals: {
      ...totals,
      ctr: totals.impressions ? totals.clicks / totals.impressions : 0,
      conversionRate: totals.clicks ? totals.conversions / totals.clicks : 0,
      roas: totals.spendCents ? totals.revenueCents / totals.spendCents : 0,
      cpl: totals.leads ? totals.spendCents / totals.leads : 0,
    },
    byChannel: byChannel.map((c) => ({ channel: c.channel, ...c._sum })),
  };
}

export async function createCampaign(ctx: WorkspaceContext, input: CampaignInput) {
  validateDates(input.startDate, input.endDate);
  const plan = getPlan(ctx.plan);
  const count = await db.campaign.count({ where: { workspaceId: ctx.workspace.id, deletedAt: null, status: { not: "ARCHIVED" } } });
  if (!withinLimit(plan.limits.campaigns, count)) throw paymentRequired(`The ${plan.name} plan includes ${plan.limits.campaigns} campaigns. Archive one or upgrade.`);

  const campaign = await db.campaign.create({
    data: {
      workspaceId: ctx.workspace.id,
      ownerId: input.ownerId ?? ctx.user.id,
      name: input.name,
      description: input.description,
      objective: input.objective ?? "AWARENESS",
      status: input.status ?? "DRAFT",
      targetAudience: input.targetAudience,
      budgetCents: input.budgetCents ?? 0,
      currency: input.currency ?? "USD",
      startDate: input.startDate,
      endDate: input.endDate,
      channels: input.channels ?? [],
      kpis: input.kpis ?? undefined,
    },
  });
  await audit({ action: "campaign.created", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "Campaign", entityId: campaign.id });
  return campaign;
}

export async function updateCampaign(ctx: WorkspaceContext, id: string, input: Partial<CampaignInput>) {
  const existing = await getCampaign(ctx.workspace.id, id);
  validateDates(input.startDate ?? existing.startDate, input.endDate ?? existing.endDate);
  if (input.status && input.status !== existing.status) return changeCampaignStatus(ctx, id, input.status, input);
  const { kpis, ...rest } = input;
  const campaign = await db.campaign.update({ where: { id }, data: { ...rest, ...(kpis !== undefined ? { kpis: kpis ?? undefined } : {}) } });
  await audit({ action: "campaign.updated", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "Campaign", entityId: id });
  return campaign;
}

export async function changeCampaignStatus(ctx: WorkspaceContext, id: string, status: CampaignStatus, extra: Partial<CampaignInput> = {}) {
  const existing = await getCampaign(ctx.workspace.id, id);
  if (!CAMPAIGN_TRANSITIONS[existing.status].includes(status)) {
    throw badRequest(`A ${existing.status.toLowerCase()} campaign cannot move to ${status.toLowerCase()}`);
  }
  // Launching a campaign that is pending approval requires approval rights.
  if (status === "ACTIVE" && existing.approvalStatus === "PENDING" && !can(ctx, "campaigns:approve")) {
    throw badRequest("This campaign is awaiting approval before it can be launched");
  }
  const { kpis: _k, ...rest } = extra;
  const campaign = await db.campaign.update({
    where: { id },
    data: { ...rest, status, ...(status === "ACTIVE" && !existing.startDate ? { startDate: new Date() } : {}), ...(status === "COMPLETED" && !existing.endDate ? { endDate: new Date() } : {}) },
  });
  await audit({ action: "campaign.status_changed", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "Campaign", entityId: id, metadata: { from: existing.status, to: status } });
  if (status === "COMPLETED") {
    await notify({ workspaceId: ctx.workspace.id, type: "campaign.completed", title: `Campaign “${campaign.name}” completed`, body: "A performance report is being generated.", link: `/app/campaigns/${id}` });
    await enqueue("reports", { kind: "campaign-report", campaignId: id, workspaceId: ctx.workspace.id });
    await emitEvent(ctx.workspace.id, "CAMPAIGN_COMPLETED", { campaignId: id, name: campaign.name });
  }
  return campaign;
}

export async function deleteCampaign(ctx: WorkspaceContext, id: string) {
  await getCampaign(ctx.workspace.id, id);
  await db.campaign.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ action: "campaign.deleted", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "Campaign", entityId: id });
}

export async function duplicateCampaign(ctx: WorkspaceContext, id: string) {
  const c = await getCampaign(ctx.workspace.id, id);
  const copy = await createCampaign(ctx, {
    name: `${c.name} (copy)`,
    description: c.description,
    objective: c.objective,
    targetAudience: c.targetAudience,
    budgetCents: c.budgetCents,
    currency: c.currency,
    channels: c.channels,
    kpis: (c.kpis as Record<string, number>) ?? null,
  });
  if (c.tasks.length) {
    await db.campaignTask.createMany({
      data: c.tasks.map((t, i) => ({ workspaceId: ctx.workspace.id, campaignId: copy.id, title: t.title, description: t.description, sortOrder: i, workerId: t.workerId })),
    });
  }
  if (c.strategy) await db.campaign.update({ where: { id: copy.id }, data: { strategy: c.strategy } });
  return copy;
}

// ─── Approval workflow ───

export async function submitForApproval(ctx: WorkspaceContext, id: string) {
  const c = await getCampaign(ctx.workspace.id, id);
  if (c.approvalStatus === "PENDING") throw badRequest("This campaign is already awaiting approval");
  await db.campaign.update({ where: { id }, data: { approvalStatus: "PENDING", status: c.status === "DRAFT" ? "PLANNING" : c.status } });
  await notify({
    workspaceId: ctx.workspace.id,
    type: "ai_task.approval",
    title: `${ctx.user.name} requested approval for “${c.name}”`,
    link: `/app/campaigns/${id}`,
    permission: "campaigns:approve",
  });
  await audit({ action: "campaign.approval_requested", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "Campaign", entityId: id });
}

export async function reviewCampaign(ctx: WorkspaceContext, id: string, decision: "approve" | "changes", note?: string) {
  const c = await getCampaign(ctx.workspace.id, id);
  if (c.approvalStatus !== "PENDING") throw badRequest("This campaign is not awaiting approval");
  await db.campaign.update({ where: { id }, data: { approvalStatus: decision === "approve" ? "APPROVED" : "CHANGES_REQUESTED" } });
  if (c.ownerId) {
    await notify({
      workspaceId: ctx.workspace.id,
      type: "ai_task.approval",
      title: decision === "approve" ? `“${c.name}” was approved` : `Changes requested on “${c.name}”`,
      body: note,
      link: `/app/campaigns/${id}`,
      userIds: [c.ownerId],
    });
  }
  await audit({ action: `campaign.${decision === "approve" ? "approved" : "changes_requested"}`, workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "Campaign", entityId: id, metadata: { note } });
}

// ─── AI strategy ───

export async function generateStrategy(ctx: WorkspaceContext, id: string, extraInstructions?: string) {
  const c = await getCampaign(ctx.workspace.id, id);
  const strategist = await db.aIWorker.findFirst({ where: { workspaceId: ctx.workspace.id, key: "marketing-strategist" } });
  const prompt = `Create a complete campaign strategy.

Campaign: ${c.name}
Description: ${c.description ?? "n/a"}
Objective: ${c.objective}
Target audience: ${c.targetAudience ?? "n/a"}
Budget: ${(c.budgetCents / 100).toLocaleString()} ${c.currency}
Timeline: ${c.startDate ? c.startDate.toDateString() : "TBD"} → ${c.endDate ? c.endDate.toDateString() : "TBD"}
Channels: ${c.channels.join(", ") || "recommend the best channels"}
${extraInstructions ? `Additional instructions: ${extraInstructions}` : ""}

Include: executive summary, audience insight, core message and 3 supporting messages, channel plan with budget split, week-by-week timeline, content deliverables checklist, KPIs with targets, and risks.`;

  return streamText(
    {
      workspaceId: ctx.workspace.id,
      userId: ctx.user.id,
      feature: "campaign:strategy",
      system: strategist?.systemPrompt,
      messages: [{ role: "user", content: prompt }],
      model: strategist?.model,
    },
    async (text) => {
      await db.campaign.update({ where: { id }, data: { strategy: text } });
      await audit({ action: "campaign.strategy_generated", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "Campaign", entityId: id });
    },
  );
}

// ─── Tasks ───

export async function addTask(ctx: WorkspaceContext, campaignId: string, input: { title: string; description?: string | null; dueDate?: Date | null; workerId?: string | null; assigneeId?: string | null }) {
  await getCampaign(ctx.workspace.id, campaignId);
  if (input.workerId) {
    const w = await db.aIWorker.findFirst({ where: { id: input.workerId, workspaceId: ctx.workspace.id } });
    if (!w) throw notFound("AI worker");
  }
  const max = await db.campaignTask.aggregate({ where: { campaignId }, _max: { sortOrder: true } });
  return db.campaignTask.create({ data: { ...input, workspaceId: ctx.workspace.id, campaignId, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
}

export async function updateTask(ctx: WorkspaceContext, campaignId: string, taskId: string, input: { title?: string; description?: string | null; status?: TaskStatus; dueDate?: Date | null }) {
  const task = await db.campaignTask.findFirst({ where: { id: taskId, campaignId, workspaceId: ctx.workspace.id } });
  if (!task) throw notFound("Task");
  return db.campaignTask.update({ where: { id: taskId }, data: input });
}

export async function deleteTask(ctx: WorkspaceContext, campaignId: string, taskId: string) {
  const task = await db.campaignTask.findFirst({ where: { id: taskId, campaignId, workspaceId: ctx.workspace.id } });
  if (!task) throw notFound("Task");
  await db.campaignTask.delete({ where: { id: taskId } });
}

/** Parses the AI strategy's deliverables checklist into campaign tasks. */
export async function tasksFromStrategy(ctx: WorkspaceContext, id: string) {
  const c = await getCampaign(ctx.workspace.id, id);
  if (!c.strategy) throw badRequest("Generate a strategy first");
  const lines = c.strategy
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^([-*]|\d+\.)\s+/.test(l))
    .map((l) => l.replace(/^([-*]|\d+\.)\s+(\[.\]\s*)?/, "").replace(/\*\*/g, "").trim())
    .filter((l) => l.length > 8 && l.length < 200)
    .slice(0, 12);
  if (!lines.length) throw badRequest("No actionable items were found in the strategy");
  const existing = new Set(c.tasks.map((t) => t.title));
  const fresh = lines.filter((l) => !existing.has(l));
  await db.campaignTask.createMany({
    data: fresh.map((title, i) => ({ workspaceId: ctx.workspace.id, campaignId: id, title, sortOrder: c.tasks.length + i + 1 })),
  });
  return { created: fresh.length };
}
