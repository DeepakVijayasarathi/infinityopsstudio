"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Check, Clock, Play, Sparkles, X } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { TimeAgo } from "@/components/ui/time";

type Config = { enabled: boolean; runHourUtc: number; autoDrafts: boolean; focus: string | null; lastRunAt: string | null };
type Run = { id: string; status: "RUNNING" | "COMPLETED" | "FAILED"; trigger: string; summary: string | null; error: string | null; startedAt: string };
type Proposal = { id: string; title: string; description: string; reason: string | null; status: "PENDING" | "DISMISSED" | "DONE" | "FAILED"; resultMessage: string | null; resultHref: string | null; createdAt: string; decidedAt: string | null };
type Overview = { config: Config; latest: Run | null; runs: Run[]; pending: Proposal[]; recent: Proposal[] };

/** "08:30" in the viewer's own time for a UTC hour. */
function localTime(hourUtc: number) {
  const d = new Date();
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function AgentView({ initial, canConfigure, canDecide }: { initial: Overview; canConfigure: boolean; canDecide: boolean; timezone: string }) {
  const [o, setO] = React.useState(initial);
  const [focus, setFocus] = React.useState(initial.config.focus ?? "");
  const [running, setRunning] = React.useState(false);
  const [deciding, setDeciding] = React.useState<string | null>(null);

  const refresh = async () => setO(await api.get<Overview>("agent"));

  async function saveConfig(patch: Partial<Config>) {
    try {
      const config = await api.put<Config>("agent", patch);
      setO((x) => ({ ...x, config }));
      toast.success("Saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function runNow() {
    setRunning(true);
    try {
      await api.post("agent/run");
      await refresh();
      toast.success("Today's brief is ready");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function decide(p: Proposal, decision: "approve" | "dismiss") {
    setDeciding(p.id);
    try {
      const r = await api.post<Proposal>(`agent/proposals/${p.id}`, { decision });
      if (decision === "approve") toast.success(r.resultMessage ?? "Done", r.resultHref ? { action: { label: "Open", onClick: () => (window.location.href = r.resultHref!) } } : undefined);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeciding(null);
      await refresh();
    }
  }

  const c = o.config;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Card className="overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500" />
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary" /> Today&apos;s brief
              </CardTitle>
              <CardDescription>{o.latest ? <>Prepared <TimeAgo date={o.latest.startedAt} /></> : "No brief yet"}</CardDescription>
            </div>
            {canConfigure && (
              <Button size="sm" onClick={runNow} disabled={running}>
                <Play /> {running ? "Reviewing…" : "Run now"}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {o.latest?.status === "FAILED" ? (
              <p className="text-sm text-destructive">The last run failed: {o.latest.error}</p>
            ) : o.latest?.summary ? (
              <div className="space-y-3 text-[15px] leading-relaxed">
                {o.latest.summary.split(/\n{2,}/).map((para, i) => (
                  <p key={i} className="whitespace-pre-line">
                    {para}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Press “Run now” for your first brief, or switch on the daily schedule.</p>
            )}
          </CardContent>
        </Card>

        <section aria-labelledby="todo" className="space-y-3">
          <h2 id="todo" className="text-lg font-semibold">
            Suggested actions {o.pending.length > 0 && <Badge tone="brand">{o.pending.length}</Badge>}
          </h2>
          {o.pending.length === 0 ? (
            <EmptyState icon={Check} title="You're all caught up" description="New suggestions appear after each daily review." />
          ) : (
            o.pending.map((p) => (
              <Card key={p.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      {p.title} {p.status === "FAILED" && <Badge tone="danger">Failed</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{p.description}</p>
                    {p.reason && <p className="mt-1 text-xs text-muted-foreground">Why: {p.reason}</p>}
                    {p.status === "FAILED" && p.resultMessage && <p className="mt-1 text-xs text-destructive">{p.resultMessage}</p>}
                  </div>
                  {canDecide && (
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" variant="ghost" onClick={() => decide(p, "dismiss")} disabled={!!deciding} aria-label={`Dismiss: ${p.title}`}>
                        <X /> Dismiss
                      </Button>
                      <Button size="sm" onClick={() => decide(p, "approve")} disabled={!!deciding}>
                        <Check /> {deciding === p.id ? "Working…" : p.status === "FAILED" ? "Retry" : "Approve"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </section>

        {o.recent.length > 0 && (
          <section aria-labelledby="done" className="space-y-2">
            <h2 id="done" className="text-lg font-semibold">
              Recently handled
            </h2>
            <Card>
              <ul className="divide-y">
                {o.recent.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    {p.status === "DONE" ? <Check className="size-4 text-emerald-600" /> : <X className="size-4 text-muted-foreground" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{p.title}</span>
                      {p.resultMessage && <span className="block truncate text-xs text-muted-foreground">{p.resultMessage}</span>}
                    </span>
                    {p.resultHref && (
                      <Link href={p.resultHref} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        Open <ArrowRight className="size-3" />
                      </Link>
                    )}
                    {p.decidedAt && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        <TimeAgo date={p.decidedAt} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily schedule</CardTitle>
            <CardDescription>The AI Manager never publishes, sends or spends without your approval.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block font-medium">Run every morning</span>
                <span className="text-xs text-muted-foreground">Brief + suggestions, with a notification</span>
              </span>
              <Switch checked={c.enabled} disabled={!canConfigure} onCheckedChange={(v) => saveConfig({ enabled: v })} aria-label="Run every morning" />
            </label>
            <Field label="Time" htmlFor="agent-hour" hint="Shown in your local time">
              <Select id="agent-hour" value={c.runHourUtc} disabled={!canConfigure} onChange={(e) => saveConfig({ runHourUtc: Number(e.target.value) })}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {localTime(h)}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block font-medium">Prepare drafts automatically</span>
                <span className="text-xs text-muted-foreground">Up to 3 content and social drafts per day, ready for review. Uses AI credits.</span>
              </span>
              <Switch checked={c.autoDrafts} disabled={!canConfigure} onCheckedChange={(v) => saveConfig({ autoDrafts: v })} aria-label="Prepare drafts automatically" />
            </label>
            <Field label="Focus this month" htmlFor="agent-focus" hint="e.g. “Launch of our new pricing” or “More demo bookings from clinics”">
              <div className="flex gap-2">
                <Input id="agent-focus" value={focus} maxLength={300} disabled={!canConfigure} onChange={(e) => setFocus(e.target.value)} />
                {canConfigure && (
                  <Button size="sm" variant="outline" disabled={focus === (c.focus ?? "")} onClick={() => saveConfig({ focus })}>
                    Save
                  </Button>
                )}
              </div>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">History</CardTitle>
          </CardHeader>
          <CardContent>
            {o.runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No runs yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {o.runs.map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <Clock className="size-3.5 text-muted-foreground" />
                    <TimeAgo date={r.startedAt} />
                    <span className="text-xs text-muted-foreground">{r.trigger === "schedule" ? "scheduled" : "manual"}</span>
                    <Badge className="ml-auto" tone={r.status === "COMPLETED" ? "success" : r.status === "FAILED" ? "danger" : "info"}>
                      {r.status === "COMPLETED" ? "Done" : r.status === "FAILED" ? "Failed" : "Running"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
