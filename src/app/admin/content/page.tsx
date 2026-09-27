import type { Metadata } from "next";
import { adminContentOverview } from "@/server/services/admin";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { CONTENT_TYPE_LABELS, humanize, type ContentType } from "@/lib/constants";

export const metadata: Metadata = { title: "Campaigns, content & workers" };

export default async function AdminContentPage() {
  const d = await adminContentOverview();
  const section = (title: string, rows: { label: React.ReactNode; count: number }[]) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {rows.map((r, i) => (
              <li key={i} className="flex items-center justify-between py-2">
                <span>{r.label}</span>
                <span className="tabular-nums">{r.count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
  return (
    <>
      <PageHeader title="Campaigns, content & workers" description="Platform-wide activity by module. Tenant data is never modified from here." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {section("Campaigns by status", d.campaigns.map((c) => ({ label: <StatusBadge status={c.status} />, count: c.count })))}
        {section("Content by type", d.content.map((c) => ({ label: CONTENT_TYPE_LABELS[c.type as ContentType] ?? c.type, count: c.count })))}
        {section("AI tasks by status", d.tasks.map((t) => ({ label: <StatusBadge status={t.status} />, count: t.count })))}
        {section("AI worker usage", d.workers.sort((a, b) => b.tasks - a.tasks).map((w) => ({ label: w.title, count: w.tasks })))}
        {section("Integrations", d.integrations.map((i) => ({ label: `${i.provider} · ${humanize(i.status)}`, count: i.count })))}
      </div>
    </>
  );
}
