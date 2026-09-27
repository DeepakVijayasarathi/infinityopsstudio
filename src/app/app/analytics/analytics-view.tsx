"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bot, Coins, Download, FileText, Heart, Mail, Percent, Sparkles, Target, Users } from "lucide-react";
import { api } from "@/lib/api-client";
import { humanize, PLATFORM_LABELS, type SocialPlatform } from "@/lib/constants";
import { formatCompact, formatCurrency, formatMicros, formatNumber, formatPercent } from "@/lib/utils";
import { useQueryState } from "@/hooks/use-query-state";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DonutChart, FunnelChart, SimpleBarChart, TrendAreaChart, TrendLineChart } from "@/components/charts/charts";

type Kpi = { value: number; previous?: number; tokens?: number; costMicros?: number };
type Data = {
  ov: { kpis: Record<string, Kpi> };
  series: { date: string; visits: number; leads: number; conversions: number; engagements: number; impressions: number; spendCents: number; revenueCents: number; clicks: number }[];
  channels: { channel: string; impressions: number | null; visits: number | null; clicks: number | null; leads: number | null; conversions: number | null; spendCents: number | null; revenueCents: number | null }[];
  campaigns: { id: string; name: string; status: string; impressions: number; clicks: number; leads: number; conversions: number; spendCents: number; revenueCents: number; ctr: number; roas: number }[];
  funnel: { funnel: { stage: string; value: number }[]; bySource: { source: string; count: number }[] };
  email: { totals: { delivered: number; opens: number; clicks: number; openRate: number; clickRate: number; unsubscribes: number }; campaigns: { id: string; name: string; sentAt: string; deliveredCount: number; openRate: number; clickRate: number }[] };
  ai: { byModel: { model: string; provider: string; requests: number; tokens: number; costMicros: number }[]; byFeature: { feature: string; requests: number; tokens: number; costMicros: number }[]; series: { date: string; requests: number; tokens: number; costMicros: number }[]; totals: { requests: number; errors: number; tokens: number; costMicros: number } };
  social: { byPlatform: { platform: SocialPlatform; posts: number; impressions: number | null; engagements: number; engagementRate: number }[] };
};

const PRESETS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
];

export function AnalyticsView({ range, data }: { range: { from: string; to: string; days: number | null }; data: Data }) {
  const q = useQueryState();
  const router = useRouter();
  const [from, setFrom] = React.useState(range.from.slice(0, 10));
  const [to, setTo] = React.useState(range.to.slice(0, 10));
  const [reporting, setReporting] = React.useState(false);
  const k = data.ov.kpis;
  const rangeQs = range.days ? `days=${range.days}` : `from=${range.from}&to=${range.to}`;

  async function report() {
    setReporting(true);
    try {
      const r = await api.post<{ id: string; title: string }>("analytics/reports", { days: range.days ?? Math.max(1, Math.round((new Date(range.to).getTime() - new Date(range.from).getTime()) / 86400000)) });
      toast.success(`${r.title} created`);
      router.push(`/app/content/${r.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setReporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border bg-card p-0.5" role="radiogroup" aria-label="Date range">
            {PRESETS.map((p) => (
              <button key={p.days} role="radio" aria-checked={range.days === p.days} onClick={() => q.set({ days: p.days, from: null, to: null })} className={`rounded-md px-3 py-1.5 text-sm ${range.days === p.days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              q.set({ from: new Date(from).toISOString(), to: new Date(`${to}T23:59:59`).toISOString(), days: null });
            }}
          >
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9 w-36" aria-label="From date" />
            <span className="text-muted-foreground">–</span>
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-9 w-36" aria-label="To date" />
            <Button type="submit" variant="outline" size="sm">
              Apply
            </Button>
          </form>
          {q.pending && <span className="text-xs text-muted-foreground">Updating…</span>}
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem asChild>
                <a href={`/api/v1/analytics/export?format=csv&${rangeQs}`} download>
                  <FileText /> Daily metrics (CSV)
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`/api/v1/analytics/export?format=pdf&${rangeQs}`} download>
                  <FileText /> Performance report (PDF)
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={report} loading={reporting}>
            <Sparkles /> AI report
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Leads" value={formatNumber(k.leadsGenerated!.value)} current={k.leadsGenerated!.value} previous={k.leadsGenerated!.previous} icon={Users} />
        <StatCard label="Conversion rate" value={formatPercent(k.conversionRate!.value, 2)} current={k.conversionRate!.value} previous={k.conversionRate!.previous} icon={Percent} />
        <StatCard label="Revenue" value={formatCurrency(k.revenue!.value, "USD", { compact: true })} current={k.revenue!.value} previous={k.revenue!.previous} icon={Target} />
        <StatCard label="Ad spend" value={formatCurrency(k.monthlySpend!.value, "USD", { compact: true })} current={k.monthlySpend!.value} previous={k.monthlySpend!.previous} icon={Coins} invert />
        <StatCard label="Social reach" value={formatCompact(k.socialReach!.value)} current={k.socialReach!.value} previous={k.socialReach!.previous} icon={Heart} />
        <StatCard label="Engagement" value={formatCompact(k.engagement!.value)} current={k.engagement!.value} previous={k.engagement!.previous} icon={Heart} />
        <StatCard label="Email open rate" value={formatPercent(data.email.totals.openRate)} icon={Mail} hint={<span>{formatNumber(data.email.totals.delivered)} delivered</span>} />
        <StatCard label="AI cost" value={formatMicros(data.ai.totals.costMicros)} icon={Bot} hint={<span>{formatNumber(data.ai.totals.requests)} requests</span>} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="leads">Leads & conversions</TabsTrigger>
          <TabsTrigger value="social">Social & website</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="ai">AI usage</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Website traffic</CardTitle>
                <CardDescription>Visits per day</CardDescription>
              </CardHeader>
              <CardContent>
                <TrendAreaChart data={data.series} xKey="date" series={[{ key: "visits", label: "Visits" }]} height={240} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Leads and conversions</CardTitle>
                <CardDescription>Per day</CardDescription>
              </CardHeader>
              <CardContent>
                <TrendLineChart data={data.series} xKey="date" series={[{ key: "leads", label: "Leads" }, { key: "conversions", label: "Conversions" }]} height={240} />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Channel breakdown</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-[320px_1fr]">
              <DonutChart stacked height={200} data={data.channels.map((c) => ({ name: `${humanize(c.channel)} leads`, value: c.leads ?? 0 }))} />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <caption className="sr-only">Metrics by channel</caption>
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2">Channel</th>
                      <th className="py-2 text-right">Impressions</th>
                      <th className="py-2 text-right">Clicks</th>
                      <th className="py-2 text-right">Leads</th>
                      <th className="py-2 text-right">Conv.</th>
                      <th className="py-2 text-right">Spend</th>
                      <th className="py-2 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.channels.map((c) => (
                      <tr key={c.channel}>
                        <td className="py-2">{humanize(c.channel)}</td>
                        <td className="py-2 text-right tabular-nums">{formatCompact(c.impressions ?? 0)}</td>
                        <td className="py-2 text-right tabular-nums">{formatCompact(c.clicks ?? 0)}</td>
                        <td className="py-2 text-right tabular-nums">{(c.leads ?? 0).toLocaleString()}</td>
                        <td className="py-2 text-right tabular-nums">{(c.conversions ?? 0).toLocaleString()}</td>
                        <td className="py-2 text-right tabular-nums">{formatCurrency(c.spendCents ?? 0, "USD", { compact: true })}</td>
                        <td className="py-2 text-right tabular-nums">{formatCurrency(c.revenueCents ?? 0, "USD", { compact: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="campaigns">
          {data.campaigns.length === 0 ? (
            <EmptyState title="No campaigns yet" />
          ) : (
            <Card>
              <CardContent className="overflow-x-auto pt-5">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2">Campaign</th>
                      <th className="py-2">Status</th>
                      <th className="py-2 text-right">Impressions</th>
                      <th className="py-2 text-right">CTR</th>
                      <th className="py-2 text-right">Leads</th>
                      <th className="py-2 text-right">Conv.</th>
                      <th className="py-2 text-right">Spend</th>
                      <th className="py-2 text-right">ROAS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.campaigns.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2.5">
                          <Link href={`/app/campaigns/${c.id}`} className="font-medium hover:text-primary">
                            {c.name}
                          </Link>
                        </td>
                        <td className="py-2.5">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{formatCompact(c.impressions)}</td>
                        <td className="py-2.5 text-right tabular-nums">{formatPercent(c.ctr, 2)}</td>
                        <td className="py-2.5 text-right tabular-nums">{c.leads.toLocaleString()}</td>
                        <td className="py-2.5 text-right tabular-nums">{c.conversions.toLocaleString()}</td>
                        <td className="py-2.5 text-right tabular-nums">{formatCurrency(c.spendCents, "USD", { compact: true })}</td>
                        <td className="py-2.5 text-right tabular-nums">{c.roas.toFixed(2)}×</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="leads">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Lead funnel</CardTitle>
                <CardDescription>Stage conversion shown on the right</CardDescription>
              </CardHeader>
              <CardContent>
                <FunnelChart stages={data.funnel.funnel} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Leads by source</CardTitle>
              </CardHeader>
              <CardContent>
                <SimpleBarChart data={data.funnel.bySource.map((s) => ({ source: humanize(s.source), count: s.count }))} xKey="source" series={[{ key: "count", label: "Leads" }]} horizontal height={260} />
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Conversions and revenue</CardTitle>
                <CardDescription>Daily conversions</CardDescription>
              </CardHeader>
              <CardContent>
                <SimpleBarChart data={data.series} xKey="date" series={[{ key: "conversions", label: "Conversions" }]} height={220} dateAxis />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="social">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Social engagement</CardTitle>
                <CardDescription>Engagements per day</CardDescription>
              </CardHeader>
              <CardContent>
                <TrendAreaChart data={data.series} xKey="date" series={[{ key: "engagements", label: "Engagements" }]} height={240} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Engagement rate by platform</CardTitle>
              </CardHeader>
              <CardContent>
                {data.social.byPlatform.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No published posts in this period.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.social.byPlatform.map((p) => (
                      <li key={p.platform} className="flex items-center justify-between text-sm">
                        <span>{PLATFORM_LABELS[p.platform]}</span>
                        <span className="tabular-nums">
                          {formatPercent(p.engagementRate, 2)} <span className="text-xs text-muted-foreground">· {p.posts} posts</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Website clicks</CardTitle>
              </CardHeader>
              <CardContent>
                <TrendAreaChart data={data.series} xKey="date" series={[{ key: "clicks", label: "Clicks" }]} height={220} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="email">
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Delivered", formatNumber(data.email.totals.delivered)],
              ["Open rate", formatPercent(data.email.totals.openRate)],
              ["Click rate", formatPercent(data.email.totals.clickRate)],
              ["Unsubscribes", formatNumber(data.email.totals.unsubscribes)],
            ].map(([l, v]) => (
              <Card key={l} className="p-4">
                <p className="text-xs text-muted-foreground">{l}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{v}</p>
              </Card>
            ))}
          </div>
          {data.email.campaigns.length === 0 ? (
            <EmptyState icon={Mail} title="No emails sent in this period" />
          ) : (
            <Card>
              <CardContent className="pt-5">
                <SimpleBarChart data={data.email.campaigns.map((c) => ({ name: c.name.slice(0, 24), open: Math.round(c.openRate * 1000) / 10 }))} xKey="name" series={[{ key: "open", label: "Open rate (%)" }]} height={240} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="ai">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>AI requests per day</CardTitle>
                <CardDescription>
                  {formatNumber(data.ai.totals.requests)} requests · {formatCompact(data.ai.totals.tokens)} tokens · {formatMicros(data.ai.totals.costMicros)} · {data.ai.totals.errors} errors
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SimpleBarChart data={data.ai.series} xKey="date" series={[{ key: "requests", label: "Requests" }]} height={220} dateAxis />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Cost by model</CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart stacked height={200} data={data.ai.byModel.map((m) => ({ name: m.model, value: m.costMicros }))} format={(v) => formatMicros(v)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Top AI features</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border text-sm">
                  {data.ai.byFeature.map((f) => (
                    <li key={f.feature} className="flex items-center justify-between py-2">
                      <span className="truncate">{f.feature}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {f.requests} · {formatMicros(f.costMicros)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
