import { Sparkles } from "lucide-react";
import { formatMicros } from "@/lib/utils";

export function AIMeta({ meta, usage, streaming }: { meta: { label?: string; model: string; provider: string } | null; usage: { credits: number; costMicros: number } | null; streaming: boolean }) {
  if (!meta) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <Sparkles className="size-3.5 text-primary" />
      <span>{meta.label ?? meta.model}</span>
      {meta.provider === "local" && <span className="rounded bg-warning/10 px-1.5 py-0.5 text-warning">Demo model — connect Claude Code or add an AI provider key for real output</span>}
      {meta.provider === "claude-code" && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">Local Claude Code</span>}
      {streaming && <span className="animate-pulse">Generating…</span>}
      {usage && (
        <span>
          · {usage.credits} credit{usage.credits === 1 ? "" : "s"} · {formatMicros(usage.costMicros)}
        </span>
      )}
    </p>
  );
}
