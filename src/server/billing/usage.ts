import type { UsageMetric } from "@prisma/client";
import { db } from "../db";
import { paymentRequired } from "../errors";
import { getPlan, withinLimit, type PlanLimits } from "@/config/plans";
import { notify } from "../services/notifications";

export function currentPeriod(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getUsage(workspaceId: string, metric: UsageMetric, period = currentPeriod()): Promise<number> {
  const agg = await db.usageRecord.aggregate({ where: { workspaceId, metric, period }, _sum: { quantity: true } });
  return agg._sum.quantity ?? 0;
}

export async function workspacePlan(workspaceId: string) {
  const sub = await db.subscription.findUnique({ where: { workspaceId }, select: { plan: true, status: true } });
  return getPlan(sub?.plan ?? "FREE");
}

const METRIC_LIMIT: Partial<Record<UsageMetric, keyof PlanLimits>> = {
  AI_CREDITS: "aiCredits",
  EMAILS_SENT: "emailsPerMonth",
};

export async function assertUsageAvailable(workspaceId: string, metric: UsageMetric, adding = 1) {
  const limitKey = METRIC_LIMIT[metric];
  if (!limitKey) return;
  const plan = await workspacePlan(workspaceId);
  const limit = plan.limits[limitKey];
  const used = await getUsage(workspaceId, metric);
  if (!withinLimit(limit, used, adding)) {
    throw paymentRequired(`Your ${plan.name} plan's monthly ${metric === "AI_CREDITS" ? "AI credit" : "email"} limit (${limit.toLocaleString()}) has been reached. Upgrade to continue.`);
  }
}

/** Records usage and raises a one-time warning when a workspace crosses 80% of a limit. */
export async function recordUsage(input: { workspaceId: string; metric: UsageMetric; quantity: number; userId?: string | null; refType?: string; refId?: string }) {
  if (input.quantity <= 0) return;
  const period = currentPeriod();
  const before = await getUsage(input.workspaceId, input.metric, period);
  await db.usageRecord.create({ data: { ...input, userId: input.userId ?? null, period } });

  const limitKey = METRIC_LIMIT[input.metric];
  if (!limitKey) return;
  const plan = await workspacePlan(input.workspaceId);
  const limit = plan.limits[limitKey];
  if (limit <= 0) return;
  const after = before + input.quantity;
  const threshold = Math.floor(limit * 0.8);
  if (before < threshold && after >= threshold) {
    await notify({
      workspaceId: input.workspaceId,
      type: "usage.warning",
      title: `You've used 80% of your monthly ${input.metric === "AI_CREDITS" ? "AI credits" : "email sends"}`,
      body: `${after.toLocaleString()} of ${limit.toLocaleString()} used on the ${plan.name} plan this month.`,
      link: "/app/billing",
      permission: "billing:view",
    });
  }
}
