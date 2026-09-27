import type { Metadata } from "next";
import { adminAiUsage } from "@/server/services/admin";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { formatCompact, formatMicros, formatNumber } from "@/lib/utils";
import { AiCharts } from "./ai-charts";

export const metadata: Metadata = { title: "AI usage & costs" };

export default async function AdminAiPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = Math.min(365, Math.max(1, Number((await searchParams).days) || 30));
  const d = await adminAiUsage(days);
  return (
    <>
      <PageHeader title="AI usage & costs" description={`Every model request across the platform, last ${days} days. Costs use catalog pricing plus admin overrides.`} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Requests" value={formatNumber(d.totals.requests)} />
        <StatCard label="Tokens" value={formatCompact(d.totals.tokens)} />
        <StatCard label="Cost" value={formatMicros(d.totals.costMicros)} />
        <StatCard label="Errors" value={formatNumber(d.totals.errors)} hint={<span>{d.totals.requests ? ((d.totals.errors / d.totals.requests) * 100).toFixed(1) : 0}% error rate</span>} invert />
      </div>
      <div className="mt-6">
        <AiCharts series={d.series} byModel={d.byModel.map((m) => ({ name: `${m.model}`, value: m.costMicros }))} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top workspaces by cost</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {d.byWorkspace.map((w) => (
                <li key={w.workspaceId ?? "none"} className="flex justify-between py-2">
                  <span>{w.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatNumber(w.requests)} req · {formatMicros(w.costMicros)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent AI errors</CardTitle>
            <CardDescription>Provider failures after retries</CardDescription>
          </CardHeader>
          <CardContent>
            {d.recentErrors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No errors recorded.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {d.recentErrors.map((e) => (
                  <li key={e.id} className="rounded-lg border border-border p-2.5">
                    <p className="font-medium">
                      {e.provider}/{e.model} · {e.feature}
                    </p>
                    <p className="text-xs text-danger">{e.errorMessage}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
