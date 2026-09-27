import { db } from "../db";
import { logger } from "../logger";
import { emitEvent } from "../services/events";
import { integrationCredentials } from "../services/integrations";

const startOfDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/**
 * Rolls first-party activity (social posts, email sends, leads) into MetricDaily for today,
 * refreshes follower counts from connected providers, and fires ENGAGEMENT_LOW automations.
 */
export async function syncWorkspaceAnalytics(workspaceId: string) {
  const today = startOfDay();
  const tomorrow = new Date(today.getTime() + 86400_000);

  const [social, emailSends, emailOpens, emailClicks, leads, wonLeads] = await Promise.all([
    db.socialPost.aggregate({ where: { workspaceId, status: "PUBLISHED", publishedAt: { gte: today, lt: tomorrow } }, _sum: { impressions: true, reach: true, likes: true, comments: true, shares: true, clicks: true } }),
    db.emailSend.count({ where: { workspaceId, sentAt: { gte: today, lt: tomorrow } } }),
    db.emailSend.count({ where: { workspaceId, openedAt: { gte: today, lt: tomorrow } } }),
    db.emailSend.count({ where: { workspaceId, clickedAt: { gte: today, lt: tomorrow } } }),
    db.lead.count({ where: { workspaceId, createdAt: { gte: today, lt: tomorrow }, deletedAt: null } }),
    db.lead.aggregate({ where: { workspaceId, status: "WON", updatedAt: { gte: today, lt: tomorrow } }, _count: true, _sum: { valueCents: true } }),
  ]);

  const upsert = async (channel: "SOCIAL" | "EMAIL" | "WEBSITE", data: Record<string, number>) => {
    // First-party rollups use campaignId = null; replace today's row atomically.
    await db.$transaction([
      db.metricDaily.deleteMany({ where: { workspaceId, channel, date: today, campaignId: null } }),
      db.metricDaily.create({ data: { workspaceId, channel, date: today, ...data } }),
    ]);
  };

  const s = social._sum;
  await upsert("SOCIAL", { impressions: s.impressions ?? 0, reach: s.reach ?? 0, engagements: (s.likes ?? 0) + (s.comments ?? 0) + (s.shares ?? 0), clicks: s.clicks ?? 0 });
  await upsert("EMAIL", { impressions: emailSends, engagements: emailOpens, clicks: emailClicks });
  await upsert("WEBSITE", { leads, conversions: wonLeads._count, revenueCents: wonLeads._sum.valueCents ?? 0 });

  // External providers
  const yt = await integrationCredentials(workspaceId, "youtube");
  if (yt) {
    try {
      const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(yt.config.channelId ?? "")}&key=${encodeURIComponent(yt.credentials.apiKey ?? "")}`, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        const json = (await res.json()) as { items?: { statistics?: { subscriberCount?: string } }[] };
        const subs = Number(json.items?.[0]?.statistics?.subscriberCount ?? 0);
        await db.socialAccount.updateMany({ where: { workspaceId, platform: "YOUTUBE" }, data: { followers: subs, lastSyncAt: new Date() } });
      }
      await db.integration.updateMany({ where: { workspaceId, provider: "youtube" }, data: { lastSyncAt: new Date() } });
    } catch (err) {
      logger.warn("YouTube sync failed", { err, workspaceId });
    }
  }

  // Low-engagement trigger (at most once per day per workflow)
  const watchers = await db.workflow.findMany({ where: { workspaceId, trigger: "ENGAGEMENT_LOW", isEnabled: true } });
  if (watchers.length) {
    const week = await db.socialPost.aggregate({
      where: { workspaceId, status: "PUBLISHED", publishedAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
      _sum: { impressions: true, likes: true, comments: true, shares: true },
      _count: true,
    });
    const impressions = week._sum.impressions ?? 0;
    const rate = impressions ? ((week._sum.likes ?? 0) + (week._sum.comments ?? 0) + (week._sum.shares ?? 0)) / impressions : 0;
    for (const wf of watchers) {
      const threshold = Number((wf.triggerConfig as { threshold?: number } | null)?.threshold ?? 0.02);
      const ranToday = wf.lastRunAt && wf.lastRunAt > today;
      if (week._count > 0 && rate < threshold && !ranToday) {
        await emitEvent(workspaceId, "ENGAGEMENT_LOW", { engagementRate: Number(rate.toFixed(4)), threshold, posts: week._count });
      }
    }
  }
}
