import * as React from "react";
import { cn } from "@/lib/utils";
import { humanize, STATUS_TONES, type Tone } from "@/lib/constants";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  info: "bg-info/10 text-info ring-info/20",
  success: "bg-success/10 text-success ring-success/20",
  warning: "bg-warning/10 text-warning ring-warning/25",
  danger: "bg-danger/10 text-danger ring-danger/20",
  brand: "bg-primary/10 text-primary ring-primary/20",
};

export function Badge({ tone = "neutral", className, dot, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset whitespace-nowrap", TONES[tone], className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {props.children}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? "neutral"} dot className={className}>
      {humanize(status)}
    </Badge>
  );
}
