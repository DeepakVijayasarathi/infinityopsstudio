"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Workflow, Zap } from "lucide-react";
import { api } from "@/lib/api-client";
import { TRIGGER_LABELS, type WorkflowTrigger } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { TimeAgo } from "@/components/ui/time";

type WF = { id: string; name: string; description: string | null; trigger: WorkflowTrigger; isEnabled: boolean; runCount: number; lastRunAt: string | null; _count: { nodes: number }; executions: { status: string; startedAt: string }[] };

export function WorkflowList({ workflows, canWrite, limit }: { workflows: WF[]; canWrite: boolean; limit: number }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const active = workflows.filter((w) => w.isEnabled).length;

  async function toggle(w: WF, enabled: boolean) {
    setBusy(w.id);
    try {
      await api.post(`automations/${w.id}/enabled`, { enabled });
      toast.success(`${w.name} ${enabled ? "enabled" : "disabled"}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {active} of {limit < 0 ? "unlimited" : limit} active automations used
        </p>
        {canWrite && (
          <Button asChild>
            <Link href="/app/automations/new">
              <Plus /> New automation
            </Link>
          </Button>
        )}
      </div>
      {workflows.length === 0 ? (
        <EmptyState icon={Workflow} title="No automations yet" description="Start with a template like “New lead → welcome email” and customize it." action={canWrite && <Button asChild><Link href="/app/automations/new"><Plus /> New automation</Link></Button>} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {workflows.map((w) => (
            <Card key={w.id} className="flex items-start gap-4 p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Zap className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/app/automations/${w.id}`} className="font-semibold hover:text-primary">
                  {w.name}
                </Link>
                {w.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{w.description}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">When: {TRIGGER_LABELS[w.trigger].label}</span>
                  <span>{w._count.nodes} steps</span>
                  <span>{w.runCount.toLocaleString()} runs</span>
                  {w.lastRunAt && (
                    <span>
                      Last run <TimeAgo date={w.lastRunAt} />
                    </span>
                  )}
                  {w.executions[0] && <StatusBadge status={w.executions[0].status} />}
                </div>
              </div>
              <Switch checked={w.isEnabled} disabled={!canWrite || busy === w.id} onCheckedChange={(v) => toggle(w, v)} aria-label={`${w.isEnabled ? "Disable" : "Enable"} ${w.name}`} />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
