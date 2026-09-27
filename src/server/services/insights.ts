import { db } from "../db";
import { logger } from "../logger";
import { generateText } from "../ai/service";
import { notify } from "./notifications";

export type InsightSeverity = "critical" | "warning" | "good" | "info";

export type Insight = {
  id: string;
  severity: InsightSeverity;
  category: "performance" | "leads" | "campaigns" | "approvals" | "social" | "email" | "content";
  title: string;
  detail: string;
  action?: { label: string; href: string };
};

const DAY = 86_400_000;
const ORDER: Record<InsightSeverity, number> = { critical: 0, warning: 1, good: 2, info: 3 };
const METRICS = ["visits", "leads", "conversions", "engagements"] as const;
type Metric = (typeof METRICS)[number];
const LABEL: Record<Metric, string> = { visits: "Website traffic", leads: "Leads", conversions: "Conversions", engagements: "Engagement" };

const startOfUtcDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const pct = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`;

/** Daily totals for the last `days` complete days (today excluded — it is still filling up), oldest first. */
async function dailySeries(workspaceId: string, days: number): Promise<Record<Metric, number[]>> {
  const today = startOfUtcDay();
  const from = new Date(today.getTime() - days * DAY);
  const rows = await db.metricDaily.groupBy({
    by: ["date"],
    where: { workspaceId, date: { gte: from, lt: today } },
    _sum: { visits: true, leads: true, conversions: true, engagements: true },
  });
  const byDay = new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r._sum]));
  const out = { visits: [], leads: [], conversions: [], engagements: [] } as Record<Metric, number[]>;
  for (let i = days; i >= 1; i--) {
    const key = new Date(today.getTime() - i * DAY).toISOString().slice(0, 10);
    const s = byDay.get(key);
    for (const m of METRICS) out[m].push(s?.[m] ?? 0);
  }
  return out;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const std = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

/**
 * Compares the last 3 days with the 14 days before. A day-average drop of ≥ 25% that is also
 * ≥ 2 standard deviations below normal is an anomaly; the same rule upward is a spike.
 */
export function detectAnomaly(series: number[]): { kind: "drop" | "spike"; change: number } | null {
  if (series.length < 17) return null;
  const recent = series.slice(-3);
  const base = series.slice(-17, -3);
  const m = mean(base);
  if (m < 5) return null; // too little data to judge
  const r = mean(recent);
  const change = (r - m) / m;
  const z = (r - m) / Math.max(std(base), m * 0.05);
  if (change <= -0.25 && z <= -2) return { kind: "drop", change };
  if (change >= 0.3 && z >= 2) return { kind: "spike", change };
  return null;
}

/** Week-over-week change of the last 7 complete days vs the 7 before; null when there is no baseline. */
export function weekOverWeek(series: number[]): number | null {
  if (series.length < 14) return null;
  const cur = sum(series.slice(-7));
  const prev = sum(series.slice(-14, -7));
  return prev > 0 ? (cur - prev) / prev : null;
}

/** Rule-based insights across metrics, leads, campaigns, approvals, social and email. */
export async function workspaceInsights(workspaceId: string): Promise<Insight[]> {
  const now = new Date();
  const out: Insight[] = [];
  const series = await dailySeries(workspaceId, 21);

  for (const m of METRICS) {
    const a = detectAnomaly(series[m]);
    if (a?.kind === "drop") {
      out.push({ id: `anomaly-${m}`, severity: a.change <= -0.5 ? "critical" : "warning", category: "performance", title: `${LABEL[m]} dropped ${pct(a.change)}`, detail: `The last 3 days averaged ${pct(a.change)} versus the previous two weeks — well outside the normal range.`, action: { label: "Open analytics", href: "/app/analytics" } });
      continue;
    }
    if (a?.kind === "spike") {
      out.push({ id: `anomaly-${m}`, severity: "good", category: "performance", title: `${LABEL[m]} spiked ${pct(a.change)}`, detail: "The last 3 days are well above normal. Find out what drove it and do more of it.", action: { label: "See channels", href: "/app/analytics" } });
      continue;
    }
    const w = weekOverWeek(series[m]);
    if (w !== null && Math.abs(w) >= 0.15) {
      out.push({ id: `wow-${m}`, severity: w > 0 ? "good" : "warning", category: "performance", title: `${LABEL[m]} ${w > 0 ? "up" : "down"} ${pct(w)} week over week`, detail: `${sum(series[m].slice(-7)).toLocaleString()} in the last 7 days vs ${sum(series[m].slice(-14, -7)).toLocaleString()} the week before.`, action: { label: "View trend", href: "/app/analytics" } });
    }
  }

  const [hotLeads, staleDeals, activeCampaigns, awaitingTasks, awaitingPosts, failedPosts, lowOpen, upcomingPosts, reviewContent] = await Promise.all([
    db.lead.findMany({
      where: { workspaceId, deletedAt: null, score: { gte: 70 }, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] }, OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: new Date(now.getTime() - 3 * DAY) } }] },
      orderBy: { score: "desc" },
      take: 5,
      select: { id: true, firstName: true, lastName: true, company: true, score: true },
    }),
    db.lead.count({ where: { workspaceId, deletedAt: null, status: "PROPOSAL", updatedAt: { lt: new Date(now.getTime() - 14 * DAY) } } }),
    db.campaign.findMany({ where: { workspaceId, deletedAt: null, status: "ACTIVE" }, select: { id: true, name: true, budgetCents: true, spentCents: true, startDate: true, endDate: true } }),
    db.aITask.count({ where: { workspaceId, status: "AWAITING_APPROVAL", updatedAt: { lt: new Date(now.getTime() - 2 * DAY) } } }),
    db.socialPost.count({ where: { workspaceId, status: "PENDING_APPROVAL", updatedAt: { lt: new Date(now.getTime() - 2 * DAY) } } }),
    db.socialPost.count({ where: { workspaceId, status: "FAILED", updatedAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
    db.emailCampaign.findMany({ where: { workspaceId, status: "SENT", sentAt: { gte: new Date(now.getTime() - 30 * DAY) }, recipientsCount: { gte: 50 } }, select: { id: true, name: true, recipientsCount: true, openCount: true } }),
    db.socialPost.count({ where: { workspaceId, status: { in: ["SCHEDULED", "PENDING_APPROVAL"] }, scheduledAt: { gte: now, lte: new Date(now.getTime() + 7 * DAY) } } }),
    db.content.count({ where: { workspaceId, deletedAt: null, status: "IN_REVIEW", updatedAt: { lt: new Date(now.getTime() - 2 * DAY) } } }),
  ]);

  if (hotLeads.length) {
    const names = hotLeads.slice(0, 3).map((l) => `${l.firstName}${l.company ? ` (${l.company})` : ""}`).join(", ");
    out.push({ id: "hot-leads", severity: "warning", category: "leads", title: `${hotLeads.length} hot lead${hotLeads.length === 1 ? "" : "s"} waiting for follow-up`, detail: `Scored 70+ and not contacted in 3 days: ${names}.`, action: { label: "Follow up", href: `/app/leads/${hotLeads[0]!.id}` } });
  }
  if (staleDeals) out.push({ id: "stale-deals", severity: "warning", category: "leads", title: `${staleDeals} proposal${staleDeals === 1 ? "" : "s"} stalled for 2+ weeks`, detail: "Deals in the proposal stage with no update in 14 days tend to go cold.", action: { label: "Review pipeline", href: "/app/leads?view=pipeline" } });

  for (const c of activeCampaigns) {
    if (c.budgetCents > 0 && c.startDate && c.endDate && c.endDate > c.startDate) {
      const elapsed = Math.min(1, Math.max(0, (now.getTime() - c.startDate.getTime()) / (c.endDate.getTime() - c.startDate.getTime())));
      if (c.spentCents > c.budgetCents) {
        out.push({ id: `overbudget-${c.id}`, severity: "critical", category: "campaigns", title: `“${c.name}” is over budget`, detail: `Spent ${Math.round((c.spentCents / c.budgetCents) * 100)}% of its budget.`, action: { label: "Open campaign", href: `/app/campaigns/${c.id}` } });
      } else if (elapsed > 0.1 && c.spentCents > c.budgetCents * elapsed * 1.2) {
        out.push({ id: `pacing-${c.id}`, severity: "warning", category: "campaigns", title: `“${c.name}” is spending ahead of schedule`, detail: `${Math.round((c.spentCents / c.budgetCents) * 100)}% of budget used with ${Math.round(elapsed * 100)}% of the timeline elapsed.`, action: { label: "Adjust budget", href: `/app/campaigns/${c.id}` } });
      }
    }
    if (c.endDate && c.endDate > now && c.endDate.getTime() - now.getTime() <= 3 * DAY) {
      out.push({ id: `ending-${c.id}`, severity: "info", category: "campaigns", title: `“${c.name}” ends in ${Math.max(1, Math.ceil((c.endDate.getTime() - now.getTime()) / DAY))} day(s)`, detail: "Plan the wrap-up: final push, report and learnings.", action: { label: "Open campaign", href: `/app/campaigns/${c.id}` } });
    }
  }

  const waiting = awaitingTasks + awaitingPosts + reviewContent;
  if (waiting) out.push({ id: "approvals", severity: "warning", category: "approvals", title: `${waiting} item${waiting === 1 ? "" : "s"} waiting on approval for 2+ days`, detail: [awaitingTasks && `${awaitingTasks} AI output(s)`, awaitingPosts && `${awaitingPosts} social post(s)`, reviewContent && `${reviewContent} content item(s)`].filter(Boolean).join(", ") + ".", action: { label: "Review now", href: awaitingTasks ? "/app/workers?tab=approvals" : awaitingPosts ? "/app/social?tab=approvals" : "/app/content?status=IN_REVIEW" } });
  if (failedPosts) out.push({ id: "failed-posts", severity: "critical", category: "social", title: `${failedPosts} social post${failedPosts === 1 ? "" : "s"} failed to publish`, detail: "Usually an expired token or a platform limit. Reconnect the account and retry.", action: { label: "Fix posts", href: "/app/social?status=FAILED" } });
  if (!upcomingPosts) out.push({ id: "empty-calendar", severity: "info", category: "social", title: "Nothing scheduled for the next 7 days", detail: "Consistent posting keeps reach up. Let the AI draft a week of posts in one click.", action: { label: "Plan posts", href: "/app/social" } });

  for (const e of lowOpen) {
    const rate = e.openCount / e.recipientsCount;
    if (rate < 0.15) out.push({ id: `email-${e.id}`, severity: "warning", category: "email", title: `Low open rate on “${e.name}” (${Math.round(rate * 100)}%)`, detail: "Below the 15% floor. Test a new subject line and send time.", action: { label: "Open email", href: `/app/email/${e.id}` } });
  }

  return out.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

/** The three most useful next steps: actionable problems first, then opportunities. */
export function nextBestActions(insights: Insight[]): Insight[] {
  return insights.filter((i) => i.action && i.severity !== "good").slice(0, 3);
}

/** Notifies the workspace once per day about new critical/warning performance anomalies. */
export async function alertOnAnomalies(workspaceId: string) {
  const insights = (await workspaceInsights(workspaceId)).filter((i) => i.id.startsWith("anomaly-") && (i.severity === "critical" || i.severity === "warning"));
  const since = startOfUtcDay();
  let sent = 0;
  for (const i of insights) {
    const already = await db.notification.findFirst({ where: { workspaceId, type: "insight.alert", title: i.title, createdAt: { gte: since } }, select: { id: true } });
    if (already) continue;
    sent += await notify({ workspaceId, type: "insight.alert", title: i.title, body: i.detail, link: i.action?.href ?? "/app/analytics", permission: "analytics:read" });
  }
  return sent;
}

const isoWeek = (d: Date) => {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
};

/** Creates this week's AI digest (once per ISO week) as a Content item and notifies the team. */
export async function weeklyDigest(workspaceId: string, force = false) {
  const week = isoWeek(new Date());
  const title = `Weekly insights — ${week}`;
  if (!force && (await db.content.findFirst({ where: { workspaceId, title }, select: { id: true } }))) return null;
  const [insights, series] = await Promise.all([workspaceInsights(workspaceId), dailySeries(workspaceId, 14)]);
  const kpis = METRICS.map((m) => {
    const w = weekOverWeek(series[m]);
    return `${LABEL[m]}: ${sum(series[m].slice(-7)).toLocaleString()} this week${w === null ? "" : ` (${pct(w)} vs last week)`}`;
  });
  const data = [...kpis, "", "Signals:", ...(insights.length ? insights.map((i) => `- [${i.severity}] ${i.title} — ${i.detail}`) : ["- No notable signals"])].join("\n");
  let summary: string;
  try {
    const lens = await db.aIWorker.findFirst({ where: { workspaceId, key: "analytics-specialist" } });
    const r = await generateText({ workspaceId, feature: "insights:weekly", system: lens?.systemPrompt, maxTokens: 2000, messages: [{ role: "user", content: `Write a short weekly marketing performance report: executive summary, what worked, concerns, and the 3 most important actions for next week.\n\nData: this week's marketing performance\n\n${data}` }] });
    summary = r.text;
  } catch (err) {
    logger.warn("Weekly digest AI summary unavailable; using data only", { err, workspaceId });
    summary = "_AI summary unavailable this week (AI credits or provider). The data below is complete._";
  }
  const body = `${summary}\n\n---\n\n## This week in numbers\n\n${kpis.map((k) => `- ${k}`).join("\n")}\n\n## Signals\n\n${insights.length ? insights.map((i) => `- **${i.title}** — ${i.detail}`).join("\n") : "- No notable signals this week."}`;
  const content = await db.content.create({ data: { workspaceId, title, type: "OTHER", body, generatedByAI: true, status: "APPROVED", wordCount: body.split(/\s+/).length } });
  await notify({ workspaceId, type: "report.weekly", title: `Your weekly insights are ready (${week})`, body: insights[0]?.title, link: `/app/content/${content.id}`, permission: "analytics:read" });
  return content;
}
