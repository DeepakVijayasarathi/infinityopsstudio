import type { MetricChannel, Prisma } from "@prisma/client";
import { db } from "../db";
import { toCsv } from "@/lib/csv";

export type DateRange = { from: Date; to: Date };

export function resolveRange(input: { from?: string | Date; to?: string | Date; days?: number }): DateRange {
  const to = input.to ? new Date(input.to) : new Date();
  const from = input.from ? new Date(input.from) : new Date(to.getTime() - (input.days ?? 30) * 86400_000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return { from: new Date(Date.now() - 30 * 86400_000), to: new Date() };
  // Cap to 2 years to bound queries.
  if (to.getTime() - from.getTime() > 730 * 86400_000) return { from: new Date(to.getTime() - 730 * 86400_000), to };
  return { from, to };
}

export function previousRange(r: DateRange): DateRange {
  const span = r.to.getTime() - r.from.getTime();
  return { from: new Date(r.from.getTime() - span), to: new Date(r.from.getTime()) };
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

function eachDay(r: DateRange): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(r.from.getUTCFullYear(), r.from.getUTCMonth(), r.from.getUTCDate()));
  while (d <= r.to) {
    out.push(dayKey(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

async function metricTotals(workspaceId: string, r: DateRange, where: Prisma.MetricDailyWhereInput = {}) {
  const agg = await db.metricDaily.aggregate({
    where: { workspaceId, date: { gte: r.from, lte: r.to }, ...where },
    _sum: { impressions: true, reach: true, visits: true, clicks: true, engagements: true, leads: true, conversions: true, revenueCents: true, spendCents: true },
  });
  const s = agg._sum;
  return {
    impressions: s.impressions ?? 0,
    reach: s.reach ?? 0,
    visits: s.visits ?? 0,
    clicks: s.clicks ?? 0,
    engagements: s.engagements ?? 0,
    leads: s.leads ?? 0,
    conversions: s.conversions ?? 0,
    revenueCents: s.revenueCents ?? 0,
    spendCents: s.spendCents ?? 0,
  };
}

export async function overview(workspaceId: string, r: DateRange) {
  const prev = previousRange(r);
  const [cur, before, campaigns, activeCampaigns, content, contentPrev, leads, leadsPrev, ai, aiPrev, social, socialPrev] = await Promise.all([
    metricTotals(workspaceId, r),
    metricTotals(workspaceId, prev),
    db.campaign.count({ where: { workspaceId, deletedAt: null } }),
    db.campaign.count({ where: { workspaceId, deletedAt: null, status: "ACTIVE" } }),
    db.content.count({ where: { workspaceId, deletedAt: null, generatedByAI: true, createdAt: { gte: r.from, lte: r.to } } }),
    db.content.count({ where: { workspaceId, deletedAt: null, generatedByAI: true, createdAt: { gte: prev.from, lte: prev.to } } }),
    db.lead.count({ where: { workspaceId, deletedAt: null, createdAt: { gte: r.from, lte: r.to } } }),
    db.lead.count({ where: { workspaceId, deletedAt: null, createdAt: { gte: prev.from, lte: prev.to } } }),
    db.aIRequest.aggregate({ where: { workspaceId, createdAt: { gte: r.from, lte: r.to }, status: "SUCCESS" }, _sum: { promptTokens: true, completionTokens: true, costMicros: true }, _count: true }),
    db.aIRequest.count({ where: { workspaceId, createdAt: { gte: prev.from, lte: prev.to }, status: "SUCCESS" } }),
    db.socialPost.aggregate({ where: { workspaceId, status: "PUBLISHED", publishedAt: { gte: r.from, lte: r.to } }, _sum: { reach: true, likes: true, comments: true, shares: true, impressions: true } }),
    db.socialPost.aggregate({ where: { workspaceId, status: "PUBLISHED", publishedAt: { gte: prev.from, lte: prev.to } }, _sum: { reach: true, likes: true, comments: true, shares: true, impressions: true } }),
  ]);
  const socialReach = Math.max(social._sum.reach ?? 0, cur.reach);
  const engagement = (social._sum.likes ?? 0) + (social._sum.comments ?? 0) + (social._sum.shares ?? 0) + cur.engagements;
  const engagementPrev = (socialPrev._sum.likes ?? 0) + (socialPrev._sum.comments ?? 0) + (socialPrev._sum.shares ?? 0) + before.engagements;
  const leadTotal = Math.max(leads, cur.leads);
  const leadPrev = Math.max(leadsPrev, before.leads);
  return {
    range: { from: r.from, to: r.to },
    kpis: {
      totalCampaigns: { value: campaigns },
      activeCampaigns: { value: activeCampaigns },
      contentGenerated: { value: content, previous: contentPrev },
      leadsGenerated: { value: leadTotal, previous: leadPrev },
      socialReach: { value: socialReach, previous: Math.max(socialPrev._sum.reach ?? 0, before.reach) },
      engagement: { value: engagement, previous: engagementPrev },
      conversionRate: { value: cur.visits ? cur.conversions / cur.visits : 0, previous: before.visits ? before.conversions / before.visits : 0 },
      aiUsage: { value: ai._count, previous: aiPrev, tokens: (ai._sum.promptTokens ?? 0) + (ai._sum.completionTokens ?? 0), costMicros: ai._sum.costMicros ?? 0 },
      monthlySpend: { value: cur.spendCents, previous: before.spendCents },
      revenue: { value: cur.revenueCents, previous: before.revenueCents },
    },
    totals: cur,
  };
}

export async function timeseries(workspaceId: string, r: DateRange, channel?: MetricChannel, campaignId?: string) {
  const rows = await db.metricDaily.findMany({
    where: { workspaceId, date: { gte: r.from, lte: r.to }, ...(channel ? { channel } : {}), ...(campaignId ? { campaignId } : {}) },
    select: { date: true, channel: true, impressions: true, visits: true, clicks: true, engagements: true, leads: true, conversions: true, spendCents: true, revenueCents: true, reach: true },
  });
  const map = new Map(eachDay(r).map((d) => [d, { date: d, impressions: 0, visits: 0, clicks: 0, engagements: 0, leads: 0, conversions: 0, spendCents: 0, revenueCents: 0, reach: 0 }]));
  for (const row of rows) {
    const cur = map.get(dayKey(row.date));
    if (!cur) continue;
    for (const k of ["impressions", "visits", "clicks", "engagements", "leads", "conversions", "spendCents", "revenueCents", "reach"] as const) cur[k] += row[k];
  }
  return [...map.values()];
}

export async function byChannel(workspaceId: string, r: DateRange) {
  const rows = await db.metricDaily.groupBy({
    by: ["channel"],
    where: { workspaceId, date: { gte: r.from, lte: r.to } },
    _sum: { impressions: true, visits: true, clicks: true, engagements: true, leads: true, conversions: true, spendCents: true, revenueCents: true },
  });
  return rows.map((c) => ({ channel: c.channel, ...c._sum }));
}

export async function campaignTable(workspaceId: string, r: DateRange) {
  const campaigns = await db.campaign.findMany({ where: { workspaceId, deletedAt: null }, select: { id: true, name: true, status: true, budgetCents: true, objective: true } });
  const metrics = await db.metricDaily.groupBy({
    by: ["campaignId"],
    where: { workspaceId, date: { gte: r.from, lte: r.to }, campaignId: { not: null } },
    _sum: { impressions: true, clicks: true, leads: true, conversions: true, spendCents: true, revenueCents: true },
  });
  return campaigns
    .map((c) => {
      const m = metrics.find((x) => x.campaignId === c.id)?._sum;
      const impressions = m?.impressions ?? 0;
      const clicks = m?.clicks ?? 0;
      const spend = m?.spendCents ?? 0;
      return { ...c, impressions, clicks, leads: m?.leads ?? 0, conversions: m?.conversions ?? 0, spendCents: spend, revenueCents: m?.revenueCents ?? 0, ctr: impressions ? clicks / impressions : 0, roas: spend ? (m?.revenueCents ?? 0) / spend : 0 };
    })
    .sort((a, b) => b.impressions - a.impressions);
}

export async function leadFunnel(workspaceId: string, r: DateRange) {
  const [visits, leads, byStatus, bySource] = await Promise.all([
    db.metricDaily.aggregate({ where: { workspaceId, date: { gte: r.from, lte: r.to } }, _sum: { visits: true } }),
    db.lead.count({ where: { workspaceId, deletedAt: null, createdAt: { gte: r.from, lte: r.to } } }),
    db.lead.groupBy({ by: ["status"], where: { workspaceId, deletedAt: null, createdAt: { gte: r.from, lte: r.to } }, _count: true }),
    db.lead.groupBy({ by: ["source"], where: { workspaceId, deletedAt: null, createdAt: { gte: r.from, lte: r.to } }, _count: true }),
  ]);
  const count = (s: string[]) => byStatus.filter((b) => s.includes(b.status)).reduce((a, b) => a + b._count, 0);
  return {
    funnel: [
      { stage: "Visitors", value: visits._sum.visits ?? 0 },
      { stage: "Leads", value: leads },
      { stage: "Contacted", value: count(["CONTACTED", "QUALIFIED", "PROPOSAL", "WON"]) },
      { stage: "Qualified", value: count(["QUALIFIED", "PROPOSAL", "WON"]) },
      { stage: "Proposal", value: count(["PROPOSAL", "WON"]) },
      { stage: "Won", value: count(["WON"]) },
    ],
    bySource: bySource.map((s) => ({ source: s.source, count: s._count })).sort((a, b) => b.count - a.count),
  };
}

export async function emailAnalytics(workspaceId: string, r: DateRange) {
  const campaigns = await db.emailCampaign.findMany({
    where: { workspaceId, sentAt: { gte: r.from, lte: r.to } },
    select: { id: true, name: true, sentAt: true, deliveredCount: true, openCount: true, clickCount: true, conversionCount: true, unsubscribeCount: true },
    orderBy: { sentAt: "desc" },
  });
  const t = campaigns.reduce((a, c) => ({ delivered: a.delivered + c.deliveredCount, opens: a.opens + c.openCount, clicks: a.clicks + c.clickCount, conversions: a.conversions + c.conversionCount, unsubscribes: a.unsubscribes + c.unsubscribeCount }), { delivered: 0, opens: 0, clicks: 0, conversions: 0, unsubscribes: 0 });
  return {
    totals: { ...t, openRate: t.delivered ? t.opens / t.delivered : 0, clickRate: t.delivered ? t.clicks / t.delivered : 0 },
    campaigns: campaigns.map((c) => ({ ...c, openRate: c.deliveredCount ? c.openCount / c.deliveredCount : 0, clickRate: c.deliveredCount ? c.clickCount / c.deliveredCount : 0 })),
  };
}

export async function aiUsageAnalytics(workspaceId: string | null, r: DateRange) {
  const where: Prisma.AIRequestWhereInput = { ...(workspaceId ? { workspaceId } : {}), createdAt: { gte: r.from, lte: r.to } };
  const [byModel, byFeature, rows, errors] = await Promise.all([
    db.aIRequest.groupBy({ by: ["model", "provider"], where, _sum: { promptTokens: true, completionTokens: true, costMicros: true }, _count: true }),
    db.aIRequest.groupBy({ by: ["feature"], where, _sum: { costMicros: true, promptTokens: true, completionTokens: true }, _count: true, orderBy: { _count: { feature: "desc" } }, take: 15 }),
    db.aIRequest.findMany({ where, select: { createdAt: true, promptTokens: true, completionTokens: true, costMicros: true } }),
    db.aIRequest.count({ where: { ...where, status: "ERROR" } }),
  ]);
  const series = new Map(eachDay(r).map((d) => [d, { date: d, requests: 0, tokens: 0, costMicros: 0 }]));
  for (const row of rows) {
    const cur = series.get(dayKey(row.createdAt));
    if (!cur) continue;
    cur.requests++;
    cur.tokens += row.promptTokens + row.completionTokens;
    cur.costMicros += row.costMicros;
  }
  return {
    byModel: byModel.map((m) => ({ model: m.model, provider: m.provider, requests: m._count, tokens: (m._sum.promptTokens ?? 0) + (m._sum.completionTokens ?? 0), costMicros: m._sum.costMicros ?? 0 })),
    byFeature: byFeature.map((f) => ({ feature: f.feature, requests: f._count, tokens: (f._sum.promptTokens ?? 0) + (f._sum.completionTokens ?? 0), costMicros: f._sum.costMicros ?? 0 })),
    series: [...series.values()],
    totals: { requests: rows.length, errors, tokens: rows.reduce((a, x) => a + x.promptTokens + x.completionTokens, 0), costMicros: rows.reduce((a, x) => a + x.costMicros, 0) },
  };
}

export async function exportAnalyticsCsv(workspaceId: string, r: DateRange) {
  const series = await timeseries(workspaceId, r);
  return toCsv(
    series.map((s) => ({ ...s, spend: (s.spendCents / 100).toFixed(2), revenue: (s.revenueCents / 100).toFixed(2) })),
    [
      { key: "date", label: "Date" },
      { key: "impressions", label: "Impressions" },
      { key: "reach", label: "Reach" },
      { key: "visits", label: "Visits" },
      { key: "clicks", label: "Clicks" },
      { key: "engagements", label: "Engagements" },
      { key: "leads", label: "Leads" },
      { key: "conversions", label: "Conversions" },
      { key: "spend", label: "Spend (USD)" },
      { key: "revenue", label: "Revenue (USD)" },
    ],
  );
}
