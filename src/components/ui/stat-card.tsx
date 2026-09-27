import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn, pctChange } from "@/lib/utils";
import { Card } from "./card";

export function StatCard({ label, value, previous, current, icon: Icon, hint, className, invert }: { label: string; value: React.ReactNode; current?: number; previous?: number; icon?: React.ComponentType<{ className?: string }>; hint?: React.ReactNode; className?: string; invert?: boolean }) {
  const change = current !== undefined && previous !== undefined ? pctChange(current, previous) : null;
  const good = change !== null && (invert ? change <= 0 : change >= 0);
  return (
    <Card className={cn("p-3.5 sm:p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <div className="hidden size-8 place-items-center rounded-lg bg-primary/10 text-primary sm:grid">
            <Icon className="size-4" />
          </div>
        )}
      </div>
      <p className="mt-2 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{value}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
        {change !== null && (
          <span className={cn("inline-flex items-center font-medium", good ? "text-success" : "text-danger")}>
            {change >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {Math.abs(change * 100).toFixed(1)}%
          </span>
        )}
        {change !== null ? <span className="hidden sm:inline">vs previous period</span> : hint}
      </div>
    </Card>
  );
}
