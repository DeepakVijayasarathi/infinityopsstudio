import type { Metadata } from "next";
import Link from "next/link";
import { Bot, Coins, FileText, Heart, Megaphone, Percent, Radio, Sparkles, Target, Users } from "lucide-react";
import { requireContext } from "@/server/page-context";
import { db } from "@/server/db";
import { aiUsageAnalytics, campaignTable, overview, resolveRange, timeseries } from "@/server/services/analytics";
import { recentActivity } from "@/server/services/activity";
import { brandCompleteness, getBrandKit } from "@/server/services/brand";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCompact, formatCurrency, formatMicros, formatNumber, formatPercent, timeAgo } from "@/lib/utils";
import { OverviewCharts } from "./overview-charts";
import { GettingStarted } from "./getting-started";
import { workspaceInsights } from "@/server/services/insights";
import { InsightsCard } from "@/components/app/insights-card";
import { AutopilotButton } from "@/components/app/autopilot-dialog";
import { can } from "@/server/tenant";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const ctx = await requireContext();
  const ws = ctx.workspace.id;
  const range = resolveRange({ days: 30 });
  const [ov, series, campaigns, ai, activity, kit, approvals, socialCount, memberCount, activeWorkers, upcoming] = await Promise.all([
    overview(ws, range),
    timeseries(ws, range),
    campaignTable(ws, range),
    aiUsageAnalytics(ws, range),
    recentActivity(ws, 10),
    getBrandKit(ws),
    Promise.all([
      db.aITask.count({ where: { workspaceId: ws, status: "AWAITING_APPROVAL" } }),
      db.socialPost.count({ where: { workspaceId: ws, status: "PENDING_APPROVAL" } }),
      db.campaign.count({ where: { workspaceId: ws, approvalStatus: "PENDING", deletedAt: null } }),
      db.content.count({ where: { workspaceId: ws, status: "IN_REVIEW", deletedAt: null } }),
    ]),
    db.socialAccount.count({ where: { workspaceId: ws } }),
    db.workspaceMember.count({ where: { workspaceId: ws } }),
    db.aIWorker.findMany({ where: { workspaceId: ws, isActive: true }, select: { id: true, name: true, title: true, color: true }, take: 6 }),
    db.socialPost.findMany({ where: { workspaceId: ws, status: "SCHEDULED", scheduledAt: { gte: new Date() } }, orderBy: { scheduledAt: "asc" }, take: 4, select: { id: true, platform: true, text: true, scheduledAt: true } }),
  ]);
  const k = ov.kpis;
  const insights = await workspaceInsights(ws);
  const { welcome } = await searchParams;
  const [taskApprovals, postApprovals, campaignApprovals, contentReviews] = approvals;
  const totalApprovals = approvals.reduce((a, b) => a + b, 0);
  const campaignCount = await db.campaign.count({ where: { workspaceId: ws, deletedAt: null } });
  const firstName = ctx.user.name.split(" ")[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={`Here's how ${ctx.workspace.name} performed over the last 30 days.`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/app/content/new">
                <Sparkles /> Generate content
              </Link>
            </Button>
            {can(ctx, "campaigns:write") && <AutopilotButton />}
          </>
        }
      />

      <GettingStarted
        forceOpen={welcome === "1"}
        steps={[
          { key: "brand", label: "Complete your Brand Kit", done: brandCompleteness(kit) >= 60, href: "/app/brand" },
          { key: "worker", label: "Assign a task to an AI worker", done: (await db.aITask.count({ where: { workspaceId: ws } })) > 0, href: "/app/workers" },
          { key: "campaign", label: "Create your first campaign", done: campaignCount > 0, href: "/app/campaigns?new=1" },
          { key: "social", label: "Connect a social account", done: socialCount > 0, href: "/app/social?tab=accounts" },
          { key: "team", label: "Invite a teammate", done: memberCount > 1, href: "/app/settings/team" },
        ]}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total campaigns" value={formatNumber(k.totalCampaigns.value)} icon={Megaphone} hint={<span>{k.activeCampaigns.value} active now</span>} />
        <StatCard label="Active campaigns" value={formatNumber(k.activeCampaigns.value)} icon={Radio} hint={<Link href="/app/campaigns?status=ACTIVE" className="hover:text-foreground">View active</Link>} />
        <StatCard label="Content generated" value={formatNumber(k.contentGenerated.value)} current={k.contentGenerated.value} previous={k.contentGenerated.previous} icon={FileText} />
        <StatCard label="Leads generated" value={formatNumber(k.leadsGenerated.value)} current={k.leadsGenerated.value} previous={k.leadsGenerated.previous} icon={Users} />
        <StatCard label="Social reach" value={formatCompact(k.socialReach.value)} current={k.socialReach.value} previous={k.socialReach.previous} icon={Target} />
        <StatCard label="Engagement" value={formatCompact(k.engagement.value)} current={k.engagement.value} previous={k.engagement.previous} icon={Heart} />
        <StatCard label="Conversion rate" value={formatPercent(k.conversionRate.value, 2)} current={k.conversionRate.value} previous={k.conversionRate.previous} icon={Percent} />
        <StatCard label="AI usage" value={`${formatNumber(k.aiUsage.value)} req`} current={k.aiUsage.value} previous={k.aiUsage.previous} icon={Bot} />
        <StatCard label="Monthly spend" value={formatCurrency(k.monthlySpend.value, "USD", { compact: true })} current={k.monthlySpend.value} previous={k.monthlySpend.previous} icon={Coins} invert />
        <StatCard label="AI cost (30d)" value={formatMicros(k.aiUsage.costMicros)} icon={Sparkles} hint={<span>{formatCompact(k.aiUsage.tokens)} tokens</span>} />
      </div>

      <InsightsCard insights={insights} />

      <OverviewCharts
        series={series.map((s) => ({ date: s.date, visits: s.visits, leads: s.leads, engagements: s.engagements, conversions: s.conversions }))}
        campaigns={campaigns.filter((c) => c.impressions > 0).slice(0, 6).map((c) => ({ name: c.name.length > 18 ? `${c.name.slice(0, 17)}…` : c.name, leads: c.leads }))}
        ai={ai.series.map((s) => ({ date: s.date, requests: s.requests }))}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Waiting on you</CardTitle>
            <CardDescription>{totalApprovals ? `${totalApprovals} item${totalApprovals === 1 ? "" : "s"} need review` : "Nothing needs your review"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {[
              { label: "AI outputs to approve", count: taskApprovals, href: "/app/workers?tab=approvals" },
              { label: "Social posts to approve", count: postApprovals, href: "/app/social?tab=approvals" },
              { label: "Campaigns awaiting approval", count: campaignApprovals, href: "/app/campaigns?approval=PENDING" },
              { label: "Content in review", count: contentReviews, href: "/app/content?status=IN_REVIEW" },
            ].map((r) => (
              <Link key={r.label} href={r.href} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-muted">
                <span>{r.label}</span>
                <span className={`min-w-6 rounded-full px-2 py-0.5 text-center text-xs font-semibold ${r.count ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}`}>{r.count}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Active AI workers</CardTitle>
            <CardDescription>{activeWorkers.length} workers ready for tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {activeWorkers.length === 0 && <p className="text-sm text-muted-foreground">No workers active yet.</p>}
            {activeWorkers.map((w) => (
              <Link key={w.id} href={`/app/workers/${w.id}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted">
                <span className="grid size-8 place-items-center rounded-lg text-xs font-semibold text-white" style={{ background: w.color }}>
                  {w.name.charAt(0)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{w.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{w.title}</p>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest changes across your workspace</CardDescription>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Activity will appear here as your team works.</p>
            ) : (
              <ol className="space-y-3">
                {activity.map((a) => (
                  <li key={a.id} className="flex gap-3 text-sm">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/60" aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate">
                        <span className="font-medium">{a.actor}</span> <span className="text-muted-foreground">{a.label}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{timeAgo(a.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {upcoming.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Upcoming social posts</CardTitle>
              <CardDescription>Next scheduled publications</CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/app/social">Open calendar</Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {upcoming.map((p) => (
              <div key={p.id} className="rounded-lg border border-border p-3">
                <p className="text-xs font-medium text-primary">
                  {p.platform} · {p.scheduledAt ? new Date(p.scheduledAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
                </p>
                <p className="mt-1 line-clamp-2 text-sm">{p.text}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
