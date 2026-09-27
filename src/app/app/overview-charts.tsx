"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SimpleBarChart, TrendAreaChart } from "@/components/charts/charts";
import { EmptyState } from "@/components/ui/states";
import { BarChart3 } from "lucide-react";

type Point = { date: string; visits: number; leads: number; engagements: number; conversions: number };

const METRICS = [
  { key: "visits", label: "Traffic" },
  { key: "leads", label: "Leads" },
  { key: "engagements", label: "Engagement" },
  { key: "conversions", label: "Conversions" },
] as const;

export function OverviewCharts({ series, campaigns, ai }: { series: Point[]; campaigns: { name: string; leads: number }[]; ai: { date: string; requests: number }[] }) {
  const total = (k: keyof Point) => series.reduce((a, s) => a + (s[k] as number), 0);
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <Tabs defaultValue="visits">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Performance</CardTitle>
              <CardDescription>Daily totals, last 30 days</CardDescription>
            </div>
            <TabsList>
              {METRICS.map((m) => (
                <TabsTrigger key={m.key} value={m.key}>
                  {m.label}
                  <span className="text-[11px] tabular-nums text-muted-foreground">{total(m.key).toLocaleString()}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </CardHeader>
          <CardContent>
            {METRICS.map((m) => (
              <TabsContent key={m.key} value={m.key} className="mt-0">
                <TrendAreaChart data={series} xKey="date" series={[{ key: m.key, label: m.label }]} height={280} />
              </TabsContent>
            ))}
          </CardContent>
        </Tabs>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Campaign performance</CardTitle>
          <CardDescription>Leads by campaign, last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          {campaigns.length ? (
            <SimpleBarChart data={campaigns} xKey="name" series={[{ key: "leads", label: "Leads" }]} horizontal height={280} />
          ) : (
            <EmptyState icon={BarChart3} title="No campaign data yet" description="Launch a campaign to see its performance here." className="py-10" />
          )}
        </CardContent>
      </Card>
      <Card className="xl:col-span-3">
        <CardHeader>
          <CardTitle>AI usage</CardTitle>
          <CardDescription>AI requests per day across workers, content and automations</CardDescription>
        </CardHeader>
        <CardContent>
          <SimpleBarChart data={ai} xKey="date" series={[{ key: "requests", label: "AI requests" }]} height={200} dateAxis />
        </CardContent>
      </Card>
    </div>
  );
}
