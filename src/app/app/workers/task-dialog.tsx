"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { Check, Copy, FileText, Loader2, Pencil, RotateCcw, X } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatDateTime, formatMicros } from "@/lib/utils";
import { DateText } from "@/components/ui/time";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/ui/markdown";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/components/app/app-context";

export type TaskRow = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  capability: string;
  worker: { id: string; name: string; title: string; color: string; key: string };
  createdBy: { name: string } | null;
};

type TaskDetail = TaskRow & {
  instructions: string;
  output: string | null;
  error: string | null;
  promptTokens: number;
  completionTokens: number;
  costMicros: number;
  model: string | null;
  reviewNote: string | null;
  approvedBy: { name: string } | null;
  approvedAt: string | null;
  completedAt: string | null;
  campaign: { id: string; name: string } | null;
};

export function TaskDialog({ taskId, onClose, onChanged }: { taskId: string | null; onClose: () => void; onChanged?: () => void }) {
  const can = useCan();
  const { data: task, mutate } = useSWR<TaskDetail>(taskId ? `/api/v1/workers/tasks/${taskId}` : null, {
    refreshInterval: (t) => (t && ["QUEUED", "RUNNING"].includes(t.status) ? 1500 : 0),
  });
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    setEditing(false);
    setNote("");
  }, [taskId]);

  async function act(name: string, fn: () => Promise<unknown>, success: string) {
    setBusy(name);
    try {
      await fn();
      toast.success(success);
      await mutate();
      onChanged?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const pending = task && ["QUEUED", "RUNNING"].includes(task.status);
  return (
    <Dialog open={!!taskId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="xl">
        {!task ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-64" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={task.status} />
                <span className="text-xs text-muted-foreground">
                  {task.worker.name} · {task.worker.title}
                </span>
              </div>
              <DialogTitle>{task.title}</DialogTitle>
              <DialogDescription>
                Brief: {task.instructions}
                {task.campaign && (
                  <>
                    {" "}
                    · Campaign:{" "}
                    <Link href={`/app/campaigns/${task.campaign.id}`} className="text-primary hover:underline">
                      {task.campaign.name}
                    </Link>
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            {pending && (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-6 text-sm text-muted-foreground">
                <Loader2 className="size-5 animate-spin text-primary" />
                {task.status === "QUEUED" ? "Queued — the worker will start shortly…" : `${task.worker.name} is working on this task…`}
              </div>
            )}
            {task.status === "FAILED" && <div className="rounded-xl border border-danger/25 bg-danger/5 p-4 text-sm text-danger">{task.error ?? "The task failed."}</div>}

            {task.output && (
              <div className="rounded-xl border border-border">
                <div className="flex items-center justify-between border-b border-border px-4 py-2">
                  <p className="text-xs text-muted-foreground">
                    {task.model ?? "model"} · {(task.promptTokens + task.completionTokens).toLocaleString()} tokens · {formatMicros(task.costMicros)}
                  </p>
                  <div className="flex gap-1">
                    <Button size="icon-sm" variant="ghost" aria-label="Copy output" onClick={() => navigator.clipboard.writeText(task.output ?? "").then(() => toast.success("Copied"))}>
                      <Copy />
                    </Button>
                    {task.status === "AWAITING_APPROVAL" && can("tasks:approve") && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Edit output"
                        onClick={() => {
                          setDraft(task.output ?? "");
                          setEditing((e) => !e);
                        }}
                      >
                        <Pencil />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="max-h-[48dvh] overflow-y-auto p-4 scrollbar-thin">
                  {editing ? <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-[40dvh] font-mono text-[13px]" aria-label="Edit output" /> : <Markdown content={task.output} />}
                </div>
              </div>
            )}

            {task.reviewNote && (
              <p className="mt-3 text-sm text-muted-foreground">
                Review note from {task.approvedBy?.name}: “{task.reviewNote}”
              </p>
            )}
            {task.approvedAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                {task.status === "APPROVED" ? "Approved" : "Reviewed"} by {task.approvedBy?.name} · <DateText date={task.approvedAt} withTime />
              </p>
            )}

            <div className="mt-5 flex flex-col gap-3">
              {task.status === "AWAITING_APPROVAL" && can("tasks:approve") && (
                <div className="flex flex-col gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3 sm:flex-row sm:items-center">
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the requester" className="h-9 flex-1 rounded-lg border border-input bg-card px-3 text-sm" aria-label="Review note" />
                  <div className="flex gap-2">
                    <Button variant="outline" loading={busy === "reject"} onClick={() => act("reject", () => api.post(`workers/tasks/${task.id}/review`, { decision: "reject", note: note || undefined }), "Output rejected")}>
                      <X /> Reject
                    </Button>
                    <Button loading={busy === "approve"} onClick={() => act("approve", () => api.post(`workers/tasks/${task.id}/review`, { decision: "approve", note: note || undefined, ...(editing ? { output: draft } : {}) }), "Output approved")}>
                      <Check /> Approve{editing ? " edits" : ""}
                    </Button>
                  </div>
                </div>
              )}
              {task.status === "AWAITING_APPROVAL" && !can("tasks:approve") && <p className="text-sm text-muted-foreground">Waiting for a manager to review this output.</p>}
              <div className="flex flex-wrap justify-end gap-2">
                {["FAILED", "REJECTED", "CANCELLED"].includes(task.status) && (
                  <Button variant="outline" loading={busy === "retry"} onClick={() => act("retry", () => api.post(`workers/tasks/${task.id}/retry`), "Task re-queued")}>
                    <RotateCcw /> Retry
                  </Button>
                )}
                {task.status === "QUEUED" && (
                  <Button variant="outline" loading={busy === "cancel"} onClick={() => act("cancel", () => api.post(`workers/tasks/${task.id}/cancel`), "Task cancelled")}>
                    Cancel task
                  </Button>
                )}
                {task.output && ["APPROVED", "COMPLETED"].includes(task.status) && can("content:write") && (
                  <Button
                    loading={busy === "save"}
                    onClick={() =>
                      act(
                        "save",
                        async () => {
                          const c = await api.post<{ id: string }>(`workers/tasks/${task.id}/save-content`);
                          window.location.href = `/app/content/${c.id}`;
                        },
                        "Saved to Content Studio",
                      )
                    }
                  >
                    <FileText /> Save to Content Studio
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
