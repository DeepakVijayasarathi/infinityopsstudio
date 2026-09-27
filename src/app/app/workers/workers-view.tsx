"use client";

import { TimeAgo } from "@/components/ui/time";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Clock, History, Inbox, Users2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { timeAgo } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkerIcon } from "@/components/marketing/worker-icon";
import { TaskDialog, type TaskRow } from "./task-dialog";

type Worker = {
  id: string;
  key: string;
  name: string;
  title: string;
  description: string;
  color: string;
  isActive: boolean;
  capabilities: string[];
  template?: { icon: string; capabilities: { key: string; label: string }[] };
  stats: { total: number; completed: number; pending: number; failed: number };
};

export function WorkersView({ workers, approvals, recent, canManage, activeLimit, initialTab }: { workers: Worker[]; approvals: TaskRow[]; recent: TaskRow[]; canManage: boolean; activeLimit: number; initialTab: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [openTask, setOpenTask] = React.useState<string | null>(null);
  const active = workers.filter((w) => w.isActive).length;

  async function toggle(w: Worker, isActive: boolean) {
    setBusy(w.id);
    try {
      await api.patch(`workers/${w.id}`, { isActive });
      toast.success(`${w.name} ${isActive ? "activated" : "deactivated"}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Tabs defaultValue={initialTab}>
      <TabsList>
        <TabsTrigger value="roster">
          <Users2 /> Roster
        </TabsTrigger>
        <TabsTrigger value="approvals">
          <Inbox /> Approvals {approvals.length > 0 && <span className="rounded-full bg-warning/15 px-1.5 text-[11px] text-warning">{approvals.length}</span>}
        </TabsTrigger>
        <TabsTrigger value="activity">
          <History /> Recent tasks
        </TabsTrigger>
      </TabsList>

      <TabsContent value="roster">
        <p className="mb-4 text-sm text-muted-foreground">
          {active} of {activeLimit} active worker slots used on your plan.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {workers.map((w) => (
            <Card key={w.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between">
                <span className="grid size-11 place-items-center rounded-xl text-white shadow-sm" style={{ background: w.color }}>
                  <WorkerIcon name={w.template?.icon} className="size-5" />
                </span>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  {w.isActive ? "Active" : "Inactive"}
                  <Switch checked={w.isActive} disabled={!canManage || busy === w.id} onCheckedChange={(v) => toggle(w, v)} aria-label={`${w.isActive ? "Deactivate" : "Activate"} ${w.name}`} />
                </label>
              </div>
              <h2 className="mt-4 font-semibold">{w.name}</h2>
              <p className="text-sm text-muted-foreground">{w.title}</p>
              <p className="mt-3 line-clamp-3 flex-1 text-sm text-muted-foreground">{w.description}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-surface p-2 text-center">
                <div>
                  <p className="text-sm font-semibold tabular-nums">{w.stats.total}</p>
                  <p className="text-[11px] text-muted-foreground">Tasks</p>
                </div>
                <div>
                  <p className="text-sm font-semibold tabular-nums">{w.stats.completed}</p>
                  <p className="text-[11px] text-muted-foreground">Done</p>
                </div>
                <div>
                  <p className="text-sm font-semibold tabular-nums">{w.stats.pending}</p>
                  <p className="text-[11px] text-muted-foreground">Pending</p>
                </div>
              </div>
              <Link href={`/app/workers/${w.id}`} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                Open workspace <ArrowRight className="size-4" />
              </Link>
            </Card>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="approvals">
        {approvals.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="No outputs waiting for approval" description="When workers finish tasks that require approval, they'll appear here." />
        ) : (
          <TaskList tasks={approvals} onOpen={setOpenTask} />
        )}
      </TabsContent>
      <TabsContent value="activity">
        {recent.length === 0 ? <EmptyState icon={Clock} title="No tasks yet" description="Open a worker and assign the first task." /> : <TaskList tasks={recent} onOpen={setOpenTask} />}
      </TabsContent>
      <TaskDialog taskId={openTask} onClose={() => setOpenTask(null)} onChanged={() => router.refresh()} />
    </Tabs>
  );
}

export function TaskList({ tasks, onOpen }: { tasks: TaskRow[]; onOpen: (id: string) => void }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {tasks.map((t) => (
        <li key={t.id}>
          <button onClick={() => onOpen(t.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/60">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg text-xs font-semibold text-white" style={{ background: t.worker.color }}>
              {t.worker.name.charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{t.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {t.worker.name} · {t.createdBy?.name ?? "Automation"} · <TimeAgo date={t.createdAt} />
              </p>
            </div>
            <StatusBadge status={t.status} />
          </button>
        </li>
      ))}
    </ul>
  );
}
