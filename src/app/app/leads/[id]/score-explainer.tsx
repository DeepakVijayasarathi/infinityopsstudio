"use client";

import * as React from "react";
import useSWR from "swr";
import { ChevronDown, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

type Explanation = { score: number; nextStep: string; factors: { label: string; points: number; max: number }[] };

/** Next best step for the lead plus a breakdown of the points behind its score. */
export function ScoreExplainer({ leadId, score }: { leadId: string; score: number }) {
  // Keyed on the score so it refreshes whenever the lead changes.
  const { data } = useSWR<Explanation>(`/api/v1/leads/${leadId}/score?s=${score}`);
  const [open, setOpen] = React.useState(false);
  if (!data) return <div className="h-10 animate-pulse rounded-lg bg-muted" aria-hidden />;
  return (
    <div className="space-y-2">
      <p className="flex gap-2 rounded-lg bg-primary/5 p-2.5 text-[13px] leading-snug">
        <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span>{data.nextStep}</span>
      </p>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground">
        Why this score?
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul className="space-y-2">
          {data.factors.map((f) => (
            <li key={f.label} className="text-xs">
              <div className="flex justify-between gap-2">
                <span className="truncate text-muted-foreground">{f.label}</span>
                <span className="shrink-0 tabular-nums">
                  {f.points}/{f.max}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(f.points / f.max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
