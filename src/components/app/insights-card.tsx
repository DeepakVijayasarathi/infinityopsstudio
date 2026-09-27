"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2, FileBarChart, Info, Lightbulb } from "lucide-react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type InsightItem = {
  id: string;
  severity: "critical" | "warning" | "good" | "info";
  title: string;
  detail: string;
  action?: { label: string; href: string };
};

// Status meaning is carried by icon + label, never colour alone.
const SEVERITY = {
  critical: { icon: AlertOctagon, label: "Critical", className: "text-danger bg-danger/10" },
  warning: { icon: AlertTriangle, label: "Needs attention", className: "text-warning bg-warning/10" },
  good: { icon: CheckCircle2, label: "Good news", className: "text-success bg-success/10" },
  info: { icon: Info, label: "Heads up", className: "text-info bg-info/10" },
} as const;

export function InsightsCard({ insights, limit = 5, canReport = true }: { insights: InsightItem[]; limit?: number; canReport?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);
  const shown = showAll ? insights : insights.slice(0, limit);

  async function weekly() {
    setBusy(true);
    try {
      const r = await api.post<{ id: string }>("insights/weekly");
      toast.success("Weekly report ready");
      router.push(`/app/content/${r.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="size-4 text-primary" aria-hidden /> Smart insights
          </CardTitle>
          <CardDescription>{insights.length ? "What changed, what needs you, and what to do next" : "Everything looks steady"}</CardDescription>
        </div>
        {canReport && (
          <Button size="sm" variant="outline" onClick={weekly} loading={busy}>
            <FileBarChart /> Weekly report
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {insights.length === 0 ? (
          <p className="flex items-center gap-2 rounded-lg bg-success/10 p-3 text-sm">
            <CheckCircle2 className="size-4 text-success" aria-hidden /> No unusual changes, overdue approvals or stalled deals right now.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((i) => {
              const s = SEVERITY[i.severity];
              return (
                <li key={i.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                  <span className={cn("inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", s.className)}>
                    <s.icon className="size-3.5" aria-hidden /> {s.label}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{i.title}</p>
                    <p className="text-xs text-muted-foreground">{i.detail}</p>
                  </div>
                  {i.action && (
                    <Link href={i.action.href} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline">
                      {i.action.label} <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {insights.length > limit && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-sm font-medium text-muted-foreground hover:text-foreground">
            {showAll ? "Show fewer" : `Show all ${insights.length}`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
