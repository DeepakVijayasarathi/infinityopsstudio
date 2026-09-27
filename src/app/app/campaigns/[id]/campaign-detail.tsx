"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, BarChart3, Check, ClipboardList, Copy, FileText, ListChecks, MoreHorizontal, Pencil, Plus, Send, Sparkles, Square, Trash2, Wand2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { CAMPAIGN_TRANSITIONS, CONTENT_TYPE_LABELS, humanize, type CampaignStatus } from "@/lib/constants";
import { cn, formatCompact, formatCurrency, formatDate, formatPercent, timeAgo } from "@/lib/utils";
import { TimeAgo, DateText } from "@/components/ui/time";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { Markdown } from "@/components/ui/markdown";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirm } from "@/components/ui/confirm";
import { StatCard } from "@/components/ui/stat-card";
import { SimpleBarChart, TrendAreaChart } from "@/components/charts/charts";
import { AIMeta } from "@/components/app/ai-meta";
import { useAIStream } from "@/hooks/use-ai-stream";
import { CampaignForm, campaignDefaults } from "../campaign-form";

type Task = { id: string; title: string; description: string | null; status: "TODO" | "IN_PROGRESS" | "DONE"; dueDate: string | null; worker: { id: string; name: string; color: string } | null };
type Campaign = {
  id: string;
  name: string;
  description: string | null;
  objective: string;
  status: CampaignStatus;
  approvalStatus: string;
  targetAudience: string | null;
  budgetCents: number;
  spentCents: number;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  channels: string[];
  strategy: string | null;
  owner: { name: string } | null;
  tasks: Task[];
  contents: { id: string; title: string; type: keyof typeof CONTENT_TYPE_LABELS; status: string; updatedAt: string }[];
  aiTasks: { id: string; title: string; status: string; createdAt: string; worker: { name: string; color: string } }[];
  _count: { leads: number; socialPosts: number; emailCampaigns: number };
};
type Perf = Awaited<ReturnType<typeof import("@/server/services/campaigns").campaignPerformance>>;

const STATUS_ACTION: Partial<Record<CampaignStatus, string>> = { ACTIVE: "Launch / resume", PAUSED: "Pause", COMPLETED: "Mark completed", ARCHIVED: "Archive", PLANNING: "Move to planning", DRAFT: "Back to draft" };

export function CampaignDetail({ campaign: c, performance, workers, perms }: { campaign: Campaign; performance: Perf; workers: { id: string; name: string; title: string }[]; perms: { write: boolean; approve: boolean; content: boolean } }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>, msg: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(msg);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const done = c.tasks.filter((t) => t.status === "DONE").length;

  return (
    <div className="space-y-6">
      <Link href="/app/campaigns" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Campaigns
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={c.status} />
            {c.approvalStatus !== "NOT_REQUIRED" && <Badge tone={c.approvalStatus === "APPROVED" ? "success" : c.approvalStatus === "PENDING" ? "warning" : "danger"}>Approval: {humanize(c.approvalStatus)}</Badge>}
            <Badge tone="brand">{humanize(c.objective)}</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
          {c.description && <p className="max-w-3xl text-sm text-muted-foreground">{c.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {perms.write && c.approvalStatus !== "PENDING" && c.status !== "ACTIVE" && c.status !== "COMPLETED" && (
            <Button variant="outline" loading={busy === "submit"} onClick={() => run("submit", () => api.post(`campaigns/${c.id}/approval`, { action: "submit" }), "Submitted for approval")}>
              <Send /> Submit for approval
            </Button>
          )}
          {perms.approve && c.approvalStatus === "PENDING" && (
            <>
              <Button variant="outline" loading={busy === "changes"} onClick={() => run("changes", () => api.post(`campaigns/${c.id}/approval`, { action: "changes", note: "Please revise before launch." }), "Changes requested")}>
                Request changes
              </Button>
              <Button loading={busy === "approve"} onClick={() => run("approve", () => api.post(`campaigns/${c.id}/approval`, { action: "approve" }), "Campaign approved")}>
                <Check /> Approve
              </Button>
            </>
          )}
          {perms.write && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" aria-label="Campaign actions">
                  <MoreHorizontal /> Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil /> Edit details
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    run(
                      "dup",
                      async () => {
                        const copy = await api.post<{ id: string }>(`campaigns/${c.id}/duplicate`);
                        router.push(`/app/campaigns/${copy.id}`);
                      },
                      "Campaign duplicated",
                    )
                  }
                >
                  <Copy /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Change status</DropdownMenuLabel>
                {CAMPAIGN_TRANSITIONS[c.status].map((s) => (
                  <DropdownMenuItem key={s} onSelect={() => run(`status-${s}`, () => api.post(`campaigns/${c.id}/status`, { status: s }), `Campaign ${humanize(s).toLowerCase()}`)}>
                    <StatusBadge status={s} /> {STATUS_ACTION[s]}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  destructive
                  onSelect={async () => {
                    if (await confirm({ title: `Delete “${c.name}”?`, description: "The campaign will be removed from lists and reports. Linked content and leads are kept.", confirmLabel: "Delete campaign", destructive: true })) {
                      await run("del", () => api.del(`campaigns/${c.id}`), "Campaign deleted");
                      router.push("/app/campaigns");
                    }
                  }}
                >
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Budget used" value={`${formatCurrency(c.spentCents, c.currency, { compact: true })} / ${formatCurrency(c.budgetCents, c.currency, { compact: true })}`} hint={<Progress value={c.budgetCents ? (c.spentCents / c.budgetCents) * 100 : 0} className="mt-1 h-1.5 w-28" />} />
        <StatCard label="Impressions" value={formatCompact(performance.totals.impressions)} hint={<span>CTR {formatPercent(performance.totals.ctr, 2)}</span>} />
        <StatCard label="Leads" value={performance.totals.leads.toLocaleString()} hint={<span>{c._count.leads} linked in CRM</span>} />
        <StatCard label="ROAS" value={`${performance.totals.roas.toFixed(2)}×`} hint={<span>{formatCurrency(performance.totals.revenueCents, c.currency, { compact: true })} revenue</span>} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">
            <ClipboardList /> Overview
          </TabsTrigger>
          <TabsTrigger value="strategy">
            <Sparkles /> Strategy
          </TabsTrigger>
          <TabsTrigger value="tasks">
            <ListChecks /> Tasks <span className="text-[11px] text-muted-foreground">{done}/{c.tasks.length}</span>
          </TabsTrigger>
          <TabsTrigger value="content">
            <FileText /> Content
          </TabsTrigger>
          <TabsTrigger value="performance">
            <BarChart3 /> Performance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Campaign brief</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  {[
                    ["Target audience", c.targetAudience ?? "Not defined"],
                    ["Timeline", <><DateText date={c.startDate} /> → <DateText date={c.endDate} /></>],
                    ["Channels", c.channels.join(", ") || "None selected"],
                    ["Owner", c.owner?.name ?? "Unassigned"],
                    ["Social posts", String(c._count.socialPosts)],
                    ["Email campaigns", String(c._count.emailCampaigns)],
                  ].map(([k, v]) => (
                    <div key={String(k)}>
                      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{k}</dt>
                      <dd className="mt-1">{v}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>AI activity</CardTitle>
                <CardDescription>Worker tasks linked to this campaign</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {c.aiTasks.length === 0 && <p className="text-sm text-muted-foreground">No AI tasks yet.</p>}
                {c.aiTasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-sm">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: t.worker.color }} />
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <StatusBadge status={t.status} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="strategy">
          <StrategyPanel campaign={c} canWrite={perms.write} onSaved={() => router.refresh()} />
        </TabsContent>

        <TabsContent value="tasks">
          <TasksPanel campaign={c} workers={workers} canWrite={perms.write} onChanged={() => router.refresh()} />
        </TabsContent>

        <TabsContent value="content">
          <div className="mb-4 flex justify-end">
            {perms.content && (
              <Button asChild>
                <Link href={`/app/content/new?campaignId=${c.id}`}>
                  <Wand2 /> Generate content for this campaign
                </Link>
              </Button>
            )}
          </div>
          {c.contents.length === 0 ? (
            <EmptyState icon={FileText} title="No content linked yet" description="Generate content from this campaign or link existing items in Content Studio." />
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {c.contents.map((ct) => (
                <li key={ct.id}>
                  <Link href={`/app/content/${ct.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60">
                    <FileText className="size-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{ct.title}</span>
                    <span className="hidden text-xs text-muted-foreground sm:inline">{CONTENT_TYPE_LABELS[ct.type]}</span>
                    <StatusBadge status={ct.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="performance">
          {performance.series.length === 0 ? (
            <EmptyState icon={BarChart3} title="No performance data yet" description="Metrics appear once the campaign is running and channels report results." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Impressions</CardTitle>
                </CardHeader>
                <CardContent>
                  <TrendAreaChart data={performance.series} xKey="date" series={[{ key: "impressions", label: "Impressions" }]} height={240} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Leads & conversions</CardTitle>
                </CardHeader>
                <CardContent>
                  <SimpleBarChart data={performance.series} xKey="date" series={[{ key: "leads", label: "Leads" }, { key: "conversions", label: "Conversions" }]} height={240} dateAxis />
                </CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>By channel</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="py-2">Channel</th>
                          <th className="py-2 text-right">Impressions</th>
                          <th className="py-2 text-right">Clicks</th>
                          <th className="py-2 text-right">Conversions</th>
                          <th className="py-2 text-right">Spend</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {performance.byChannel.map((b) => (
                          <tr key={b.channel}>
                            <td className="py-2">{humanize(b.channel)}</td>
                            <td className="py-2 text-right tabular-nums">{(b.impressions ?? 0).toLocaleString()}</td>
                            <td className="py-2 text-right tabular-nums">{(b.clicks ?? 0).toLocaleString()}</td>
                            <td className="py-2 text-right tabular-nums">{(b.conversions ?? 0).toLocaleString()}</td>
                            <td className="py-2 text-right tabular-nums">{formatCurrency(b.spendCents ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Edit campaign</DialogTitle>
          </DialogHeader>
          <CampaignForm
            initial={campaignDefaults(c)}
            submitLabel="Save changes"
            onCancel={() => setEditing(false)}
            onSubmit={async (payload) => {
              await api.patch(`campaigns/${c.id}`, payload);
              toast.success("Campaign updated");
              setEditing(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StrategyPanel({ campaign, canWrite, onSaved }: { campaign: Campaign; canWrite: boolean; onSaved: () => void }) {
  const ai = useAIStream();
  const [instructions, setInstructions] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const shown = ai.streaming || ai.text ? ai.text : campaign.strategy;

  async function generate() {
    const { text } = await ai.start(`campaigns/${campaign.id}/strategy`, { instructions: instructions || undefined });
    if (text) {
      toast.success("Strategy saved to the campaign");
      onSaved();
    }
  }

  async function toTasks() {
    setBusy(true);
    try {
      const r = await api.post<{ created: number }>(`campaigns/${campaign.id}/strategy/tasks`);
      toast.success(`${r.created} task${r.created === 1 ? "" : "s"} added from the strategy`);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>AI strategy</CardTitle>
          <CardDescription>Nova, your Marketing Strategist, drafts a full plan from the campaign brief and Brand Kit.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Extra direction" htmlFor="si" hint="Optional">
            <Textarea id="si" value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} placeholder="Focus on LinkedIn and webinars; budget split 60/40" disabled={!canWrite} />
          </Field>
          {ai.streaming ? (
            <Button variant="outline" className="w-full" onClick={ai.stop}>
              <Square /> Stop
            </Button>
          ) : (
            <Button className="w-full" onClick={generate} disabled={!canWrite}>
              <Sparkles /> {campaign.strategy ? "Regenerate strategy" : "Generate strategy"}
            </Button>
          )}
          {campaign.strategy && !ai.streaming && (
            <Button variant="outline" className="w-full" loading={busy} onClick={toTasks} disabled={!canWrite}>
              <ListChecks /> Create tasks from strategy
            </Button>
          )}
          <AIMeta meta={ai.meta} usage={ai.usage} streaming={ai.streaming} />
          {ai.error && <p className="text-sm text-danger">{ai.error}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6">
          {shown ? <Markdown content={shown} /> : <EmptyState icon={Sparkles} title="No strategy yet" description="Generate a strategy to get positioning, channel plan, timeline, deliverables and KPIs." className="border-0 bg-transparent" />}
        </CardContent>
      </Card>
    </div>
  );
}

function TasksPanel({ campaign, workers, canWrite, onChanged }: { campaign: Campaign; workers: { id: string; name: string; title: string }[]; canWrite: boolean; onChanged: () => void }) {
  const [title, setTitle] = React.useState("");
  const [due, setDue] = React.useState("");
  const [workerId, setWorkerId] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const columns: { key: Task["status"]; label: string }[] = [
    { key: "TODO", label: "To do" },
    { key: "IN_PROGRESS", label: "In progress" },
    { key: "DONE", label: "Done" },
  ];

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      await api.post(`campaigns/${campaign.id}/tasks`, { title, dueDate: due || null, workerId: workerId || null });
      setTitle("");
      setDue("");
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAdding(false);
    }
  }
  async function move(t: Task, status: Task["status"]) {
    try {
      await api.patch(`campaigns/${campaign.id}/tasks/${t.id}`, { status });
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function remove(t: Task) {
    try {
      await api.del(`campaigns/${campaign.id}/tasks/${t.id}`);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <form onSubmit={add} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" aria-label="Task title" className="flex-1" required minLength={2} />
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className="sm:w-40" />
          <Select value={workerId} onChange={(e) => setWorkerId(e.target.value)} aria-label="Assign AI worker" className="sm:w-48">
            <option value="">No AI worker</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} · {w.title}
              </option>
            ))}
          </Select>
          <Button type="submit" loading={adding}>
            <Plus /> Add
          </Button>
        </form>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {columns.map((col) => {
          const items = campaign.tasks.filter((t) => t.status === col.key);
          return (
            <section key={col.key} className="rounded-xl bg-surface p-3" aria-label={col.label}>
              <h3 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">
                {col.label} <span className="text-xs font-normal text-muted-foreground">{items.length}</span>
              </h3>
              <ul className="space-y-2">
                {items.map((t) => (
                  <li key={t.id} className="group rounded-lg border border-border bg-card p-3 text-sm card-shadow">
                    <p className={cn("font-medium", t.status === "DONE" && "text-muted-foreground line-through")}>{t.title}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {t.worker && (
                        <span className="inline-flex items-center gap-1">
                          <span className="size-2 rounded-full" style={{ background: t.worker.color }} /> {t.worker.name}
                        </span>
                      )}
                      {t.dueDate && <span>Due <DateText date={t.dueDate} options={{ month: "short", day: "numeric" }} /></span>}
                    </div>
                    {canWrite && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {columns
                          .filter((c) => c.key !== t.status)
                          .map((c) => (
                            <button key={c.key} onClick={() => move(t, c.key)} className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">
                              → {c.label}
                            </button>
                          ))}
                        <button onClick={() => remove(t)} className="ml-auto rounded-md px-2 py-0.5 text-[11px] text-danger opacity-70 hover:bg-danger/10 hover:opacity-100" aria-label={`Delete task ${t.title}`}>
                          Delete
                        </button>
                      </div>
                    )}
                  </li>
                ))}
                {items.length === 0 && <li className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No tasks</li>}
              </ul>
            </section>
          );
        })}
      </div>
      {campaign.aiTasks.length > 0 && <p className="text-xs text-muted-foreground">Last AI activity <TimeAgo date={campaign.aiTasks[0]!.createdAt} />.</p>}
    </div>
  );
}
