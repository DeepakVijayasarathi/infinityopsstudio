import type { Metadata } from "next";
import { Activity, AlertOctagon, Bot, Building2, Coins, Megaphone, UserCheck, Users } from "lucide-react";
import { adminDashboard } from "@/server/services/admin";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatMicros, formatNumber } from "@/lib/utils";
import { AdminCharts } from "./admin-charts";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboardPage() {
  const d = await adminDashboard();
  const m = d.metrics;
  return (
    <>
      <PageHeader title="Platform dashboard" description="Health, growth and cost across all workspaces." />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total users" value={formatNumber(m.users)} icon={Users} />
        <StatCard label="Active users (30d)" value={formatNumber(m.activeUsers)} icon={UserCheck} hint={<span>{m.users ? Math.round((m.activeUsers / m.users) * 100) : 0}% of users</span>} />
        <StatCard label="Workspaces" value={formatNumber(m.workspaces)} icon={Building2} />
        <StatCard label="MRR" value={formatCurrency(m.mrrCents)} icon={Coins} hint={<span>ARR {formatCurrency(m.mrrCents * 12, "USD", { compact: true })}</span>} />
        <StatCard label="AI requests (30d)" value={formatNumber(m.aiRequests)} icon={Bot} />
        <StatCard label="AI cost (30d)" value={formatMicros(m.aiCostMicros)} icon={Activity} />
        <StatCard label="Campaigns" value={formatNumber(m.campaigns)} icon={Megaphone} />
        <StatCard label="Errors (24h)" value={formatNumber(m.errors)} icon={AlertOctagon} invert />
      </div>
      <div className="mt-6">
        <AdminCharts signups={d.signups} byPlan={d.byPlan.map((p) => ({ name: p.name, value: p.count }))} />
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Background queues</CardTitle>
          <CardDescription>{d.queues ? "Live BullMQ job counts" : "Redis is not configured — jobs run in-process"}</CardDescription>
        </CardHeader>
        {d.queues && (
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2">Queue</th>
                  <th className="py-2 text-right">Waiting</th>
                  <th className="py-2 text-right">Active</th>
                  <th className="py-2 text-right">Delayed</th>
                  <th className="py-2 text-right">Failed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {Object.entries(d.queues).map(([q, c]) => (
                  <tr key={q}>
                    <td className="py-2 font-medium">{q}</td>
                    <td className="py-2 text-right tabular-nums">{c.waiting}</td>
                    <td className="py-2 text-right tabular-nums">{c.active}</td>
                    <td className="py-2 text-right tabular-nums">{c.delayed}</td>
                    <td className={`py-2 text-right tabular-nums ${c.failed ? "text-danger" : ""}`}>{c.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        )}
      </Card>
    </>
  );
}
