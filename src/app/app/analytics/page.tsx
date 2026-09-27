import type { Metadata } from "next";
import { requirePagePermission } from "@/server/page-context";
import { aiUsageAnalytics, byChannel, campaignTable, emailAnalytics, leadFunnel, overview, resolveRange, timeseries } from "@/server/services/analytics";
import { socialAnalytics } from "@/server/services/social";
import { PageHeader } from "@/components/ui/page-header";
import { AnalyticsView } from "./analytics-view";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string }> }) {
  const ctx = await requirePagePermission("analytics:read");
  const sp = await searchParams;
  const days = Math.min(730, Math.max(1, Number(sp.days) || 30));
  const range = resolveRange({ days, from: sp.from, to: sp.to });
  const ws = ctx.workspace.id;
  const spanDays = Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / 86400_000));
  const [ov, series, channels, campaigns, funnel, email, ai, social] = await Promise.all([
    overview(ws, range),
    timeseries(ws, range),
    byChannel(ws, range),
    campaignTable(ws, range),
    leadFunnel(ws, range),
    emailAnalytics(ws, range),
    aiUsageAnalytics(ws, range),
    socialAnalytics(ws, spanDays),
  ]);
  return (
    <>
      <PageHeader title="Analytics" description="Campaign, channel, lead, email, social and AI performance in one place." />
      <AnalyticsView
        range={{ from: range.from.toISOString(), to: range.to.toISOString(), days: sp.from ? null : days }}
        data={JSON.parse(JSON.stringify({ ov, series, channels, campaigns, funnel, email, ai, social }))}
      />
    </>
  );
}
