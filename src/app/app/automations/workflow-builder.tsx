"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowLeft, ArrowUp, Bell, Bot, Clock, Copy, FileBarChart, GitBranch, Globe, Mail, Play, Plus, Save, Share2, Sparkles, Trash2, UserCog, Zap } from "lucide-react";
import { api } from "@/lib/api-client";
import { humanize, LEAD_SOURCES, LEAD_STATUSES, NODE_LABELS, PLATFORM_LABELS, SOCIAL_PLATFORMS, TRIGGER_LABELS, WORKFLOW_TRIGGERS, type WorkflowNodeType, type WorkflowTrigger } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { DateText } from "@/components/ui/time";
import { useConfirm } from "@/components/ui/confirm";

type Cfg = Record<string, unknown>;
type Node = { type: WorkflowNodeType; label: string; config: Cfg };
type Workflow = { id: string; name: string; description: string | null; trigger: WorkflowTrigger; triggerConfig: Cfg | null; isEnabled: boolean; webhookUrl: string | null; nodes: Node[] };
type Execution = { id: string; status: string; startedAt: string; finishedAt: string | null; error: string | null; logs: { at: string; step: number; label: string; status: string; message: string }[] };

const NODE_ICON: Record<WorkflowNodeType, React.ComponentType<{ className?: string }>> = {
  CONDITION: GitBranch,
  DELAY: Clock,
  AI_ACTION: Sparkles,
  SEND_EMAIL: Mail,
  CREATE_SOCIAL_POST: Share2,
  UPDATE_LEAD: UserCog,
  ASSIGN_WORKER: Bot,
  WEBHOOK: Globe,
  NOTIFY: Bell,
  GENERATE_REPORT: FileBarChart,
};

const OPERATORS: Record<string, string> = {
  equals: "equals",
  not_equals: "does not equal",
  contains: "contains",
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  exists: "has any value",
  not_exists: "is empty",
};

const DEFAULTS: Record<WorkflowNodeType, Cfg> = {
  CONDITION: { field: "lead.score", operator: "gte", value: "30" },
  DELAY: { amount: 1, unit: "days" },
  AI_ACTION: { workerKey: "content-writer", capability: "social-captions", instructions: "{{payload.title}}", saveAsContent: false },
  SEND_EMAIL: { to: "lead", email: "", subject: "Thanks for your interest, {{lead.firstName}}", body: "Hi {{lead.firstName}}, thanks for reaching out!" },
  CREATE_SOCIAL_POST: { platform: "LINKEDIN", text: "{{lastOutput}}", scheduleInHours: 24 },
  UPDATE_LEAD: { status: "CONTACTED", addTag: "", scoreDelta: 0 },
  ASSIGN_WORKER: { workerKey: "marketing-strategist", capability: "audience-analysis", instructions: "Account plan for {{lead.company}}" },
  WEBHOOK: { url: "", useIntegration: true },
  NOTIFY: { title: "Automation ran for {{lead.firstName}}", body: "" },
  GENERATE_REPORT: { days: 30 },
};

const TEMPLATES: { name: string; description: string; trigger: WorkflowTrigger; triggerConfig?: Cfg; nodes: Node[] }[] = [
  {
    name: "New lead → qualify → welcome → assign worker",
    description: "Qualify inbound leads, send a welcome email and ask Nova for an account plan.",
    trigger: "LEAD_CREATED",
    nodes: [
      { type: "CONDITION", label: "Score is at least 30", config: { field: "lead.score", operator: "gte", value: "30" } },
      { type: "UPDATE_LEAD", label: "Mark as contacted", config: { status: "CONTACTED", addTag: "auto-qualified" } },
      { type: "SEND_EMAIL", label: "Welcome email", config: DEFAULTS.SEND_EMAIL },
      { type: "ASSIGN_WORKER", label: "Account plan from Nova", config: DEFAULTS.ASSIGN_WORKER },
    ],
  },
  {
    name: "New blog → social posts → schedule",
    description: "Turn every published article into a LinkedIn post awaiting approval.",
    trigger: "CONTENT_PUBLISHED",
    nodes: [
      { type: "AI_ACTION", label: "Draft social posts", config: { workerKey: "social-media-manager", capability: "post-creation", instructions: "{{payload.title}}", saveAsContent: false } },
      { type: "CREATE_SOCIAL_POST", label: "Queue LinkedIn post", config: { platform: "LINKEDIN", text: "New on the blog: {{payload.title}}", scheduleInHours: 24 } },
    ],
  },
  { name: "Campaign completed → performance report", description: "Generate an executive report the moment a campaign ends.", trigger: "CAMPAIGN_COMPLETED", nodes: [{ type: "GENERATE_REPORT", label: "Generate report", config: { days: 90 } }, { type: "NOTIFY", label: "Notify team", config: { title: "Report ready for {{payload.name}}", body: "" } }] },
  {
    name: "Low engagement → AI optimization",
    description: "When 7-day social engagement drops under 2%, ask Apex for fixes.",
    trigger: "ENGAGEMENT_LOW",
    triggerConfig: { threshold: 0.02 },
    nodes: [{ type: "AI_ACTION", label: "Optimization ideas", config: { workerKey: "growth-strategist", capability: "conversion-ideas", instructions: "Engagement rate is {{payload.engagementRate}}. Suggest fixes.", saveAsContent: true } }],
  },
];

export function WorkflowBuilder({ workflow, executions, workers, capabilities, canWrite }: { workflow: Workflow | null; executions: Execution[]; workers: { key: string; name: string; title: string }[]; capabilities: Record<string, { key: string; label: string }[]>; canWrite: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [name, setName] = React.useState(workflow?.name ?? "");
  const [description, setDescription] = React.useState(workflow?.description ?? "");
  const [trigger, setTrigger] = React.useState<WorkflowTrigger>(workflow?.trigger ?? "LEAD_CREATED");
  const [triggerConfig, setTriggerConfig] = React.useState<Cfg>(workflow?.triggerConfig ?? {});
  const [nodes, setNodes] = React.useState<Node[]>(workflow?.nodes.map((n) => ({ type: n.type, label: n.label, config: n.config })) ?? []);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(executions[0]?.id ?? null);

  const applyTemplate = (t: (typeof TEMPLATES)[number]) => {
    setName(t.name);
    setDescription(t.description);
    setTrigger(t.trigger);
    setTriggerConfig(t.triggerConfig ?? {});
    setNodes(t.nodes);
  };

  const update = (i: number, patch: Partial<Node>) => setNodes((ns) => ns.map((n, j) => (j === i ? { ...n, ...patch } : n)));
  const setCfg = (i: number, key: string, value: unknown) => setNodes((ns) => ns.map((n, j) => (j === i ? { ...n, config: { ...n.config, [key]: value } } : n)));
  const move = (i: number, dir: -1 | 1) =>
    setNodes((ns) => {
      const next = [...ns];
      const [x] = next.splice(i, 1);
      next.splice(i + dir, 0, x!);
      return next;
    });

  async function save() {
    setBusy("save");
    try {
      const body = { name, description: description || null, trigger, triggerConfig, nodes };
      if (workflow) {
        await api.patch(`automations/${workflow.id}`, body);
        toast.success("Automation saved");
        router.refresh();
      } else {
        const wf = await api.post<{ id: string }>("automations", body);
        toast.success("Automation created — enable it when you're ready");
        router.push(`/app/automations/${wf.id}`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function run() {
    if (!workflow) return;
    setBusy("run");
    try {
      await api.post(`automations/${workflow.id}/run`, { payload: {} });
      toast.success("Test run started — refresh the log in a moment");
      setTimeout(() => router.refresh(), 2500);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/app/automations" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Automations
      </Link>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <input value={name} onChange={(e) => setName(e.target.value)} readOnly={!canWrite} placeholder="Name this automation" aria-label="Automation name" className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} readOnly={!canWrite} placeholder="What does it do?" aria-label="Description" className="w-full bg-transparent text-sm text-muted-foreground outline-none" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {workflow && (
            <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              {workflow.isEnabled ? "Enabled" : "Disabled"}
              <Switch
                checked={workflow.isEnabled}
                disabled={!canWrite}
                aria-label="Enable automation"
                onCheckedChange={async (v) => {
                  try {
                    await api.post(`automations/${workflow.id}/enabled`, { enabled: v });
                    toast.success(v ? "Automation enabled" : "Automation disabled");
                    router.refresh();
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              />
            </label>
          )}
          {workflow && canWrite && (
            <Button variant="outline" onClick={run} loading={busy === "run"}>
              <Play /> Test run
            </Button>
          )}
          {canWrite && (
            <Button onClick={save} loading={busy === "save"} disabled={name.trim().length < 2}>
              <Save /> Save
            </Button>
          )}
        </div>
      </div>

      {!workflow && (
        <Card>
          <CardHeader>
            <CardTitle>Start from a template</CardTitle>
            <CardDescription>Pick a proven workflow and customize any step.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {TEMPLATES.map((t) => (
              <button key={t.name} onClick={() => applyTemplate(t)} className="rounded-xl border border-border p-3 text-left transition hover:border-primary/50">
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div>
          {/* Trigger */}
          <Card className="border-primary/30">
            <CardContent className="space-y-3 pt-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                  <Zap className="size-4" />
                </span>
                Trigger
              </div>
              <Select value={trigger} onChange={(e) => setTrigger(e.target.value as WorkflowTrigger)} disabled={!canWrite} aria-label="Trigger">
                {WORKFLOW_TRIGGERS.map((t) => (
                  <option key={t} value={t}>
                    {TRIGGER_LABELS[t].label} — {TRIGGER_LABELS[t].description}
                  </option>
                ))}
              </Select>
              {trigger === "LEAD_CREATED" && (
                <Field label="Only for source" htmlFor="tc-source">
                  <Select id="tc-source" value={String(triggerConfig.source ?? "")} onChange={(e) => setTriggerConfig({ ...triggerConfig, source: e.target.value || undefined })} disabled={!canWrite}>
                    <option value="">Any source</option>
                    {LEAD_SOURCES.map((s) => (
                      <option key={s} value={s}>
                        {humanize(s)}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {trigger === "LEAD_STATUS_CHANGED" && (
                <Field label="Only when status becomes" htmlFor="tc-status">
                  <Select id="tc-status" value={String(triggerConfig.status ?? "")} onChange={(e) => setTriggerConfig({ ...triggerConfig, status: e.target.value || undefined })} disabled={!canWrite}>
                    <option value="">Any status</option>
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {humanize(s)}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {trigger === "SCHEDULE" && (
                <Field label="Run every (hours)" htmlFor="tc-int">
                  <Input id="tc-int" type="number" min={1} max={720} value={Number(triggerConfig.intervalHours ?? 24)} onChange={(e) => setTriggerConfig({ ...triggerConfig, intervalHours: Number(e.target.value) || 24 })} disabled={!canWrite} />
                </Field>
              )}
              {trigger === "ENGAGEMENT_LOW" && (
                <Field label="Engagement rate threshold (%)" htmlFor="tc-th" hint="Checked hourly against the last 7 days of published posts.">
                  <Input id="tc-th" type="number" min={0.1} max={50} step={0.1} value={Number(triggerConfig.threshold ?? 0.02) * 100} onChange={(e) => setTriggerConfig({ ...triggerConfig, threshold: (Number(e.target.value) || 2) / 100 })} disabled={!canWrite} />
                </Field>
              )}
              {trigger === "WEBHOOK" && (
                <div className="rounded-lg bg-surface p-3 text-sm">
                  {workflow?.webhookUrl ? (
                    <div className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate text-xs">{workflow.webhookUrl}</code>
                      <Button size="icon-sm" variant="ghost" aria-label="Copy webhook URL" onClick={() => navigator.clipboard.writeText(workflow.webhookUrl!).then(() => toast.success("Copied"))}>
                        <Copy />
                      </Button>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Save the automation to get its secret webhook URL. POST JSON to it to start a run.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Steps */}
          <ol className="mt-0">
            {nodes.map((n, i) => {
              const Icon = NODE_ICON[n.type];
              return (
                <li key={i}>
                  <div className="ml-6 h-6 w-px bg-border" aria-hidden />
                  <Card>
                    <CardContent className="space-y-3 pt-4">
                      <div className="flex items-center gap-2">
                        <span className="grid size-8 place-items-center rounded-lg bg-muted text-foreground">
                          <Icon className="size-4" />
                        </span>
                        <span className="text-xs font-medium text-muted-foreground">
                          Step {i + 1} · {NODE_LABELS[n.type].label}
                        </span>
                        <input value={n.label} onChange={(e) => update(i, { label: e.target.value })} readOnly={!canWrite} aria-label={`Step ${i + 1} label`} className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none" />
                        {canWrite && (
                          <div className="flex">
                            <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                              <ArrowUp />
                            </Button>
                            <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === nodes.length - 1} onClick={() => move(i, 1)}>
                              <ArrowDown />
                            </Button>
                            <Button size="icon-sm" variant="ghost" aria-label="Remove step" className="text-danger" onClick={() => setNodes((ns) => ns.filter((_, j) => j !== i))}>
                              <Trash2 />
                            </Button>
                          </div>
                        )}
                      </div>
                      <fieldset disabled={!canWrite}>
                        <NodeConfig index={i} node={n} setCfg={(k, v) => setCfg(i, k, v)} workers={workers} capabilities={capabilities} />
                      </fieldset>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ol>
          {canWrite && (
            <>
              <div className="ml-6 h-6 w-px bg-border" aria-hidden />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full border-dashed">
                    <Plus /> Add step
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72">
                  {(Object.keys(NODE_LABELS) as WorkflowNodeType[]).map((t) => {
                    const Icon = NODE_ICON[t];
                    return (
                      <DropdownMenuItem key={t} onSelect={() => setNodes((ns) => [...ns, { type: t, label: NODE_LABELS[t].label, config: { ...DEFAULTS[t] } }])}>
                        <Icon />
                        <div>
                          <p className="text-sm">{NODE_LABELS[t].label}</p>
                          <p className="text-xs text-muted-foreground">{NODE_LABELS[t].description}</p>
                        </div>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Use variables in text fields: <code>{"{{lead.firstName}}"}</code>, <code>{"{{lead.company}}"}</code>, <code>{"{{payload.title}}"}</code>, <code>{"{{lastOutput}}"}</code> (output of the previous AI step).
          </p>
          {workflow && canWrite && (
            <Button
              variant="ghost"
              className="mt-6 text-danger"
              onClick={async () => {
                if (!(await confirm({ title: `Delete “${workflow.name}”?`, description: "Its run history is deleted too.", destructive: true, confirmLabel: "Delete automation" }))) return;
                try {
                  await api.del(`automations/${workflow.id}`);
                  toast.success("Automation deleted");
                  router.push("/app/automations");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <Trash2 /> Delete automation
            </Button>
          )}
        </div>

        <Card className="h-fit xl:sticky xl:top-20">
          <CardHeader>
            <CardTitle>Run log</CardTitle>
            <CardDescription>Last 50 executions</CardDescription>
          </CardHeader>
          <CardContent>
            {!workflow || executions.length === 0 ? (
              <EmptyState icon={Play} title="No runs yet" description="Runs appear here with a step-by-step log." className="py-8" />
            ) : (
              <ul className="space-y-2">
                {executions.map((e) => (
                  <li key={e.id} className="rounded-lg border border-border">
                    <button onClick={() => setExpanded(expanded === e.id ? null : e.id)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm" aria-expanded={expanded === e.id}>
                      <DateText date={e.startedAt} withTime className="text-xs text-muted-foreground" />
                      <StatusBadge status={e.status} />
                    </button>
                    {expanded === e.id && (
                      <ol className="space-y-1.5 border-t border-border px-3 py-2 text-xs">
                        {e.logs.map((l, i) => (
                          <li key={i} className="flex gap-2">
                            <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", l.status === "ok" ? "bg-success" : l.status === "error" ? "bg-danger" : l.status === "waiting" ? "bg-info" : "bg-muted-foreground")} />
                            <span>
                              <span className="font-medium">
                                {l.step}. {l.label}
                              </span>{" "}
                              <span className="text-muted-foreground">— {l.message}</span>
                            </span>
                          </li>
                        ))}
                        {e.logs.length === 0 && <li className="text-muted-foreground">Starting…</li>}
                        {e.error && <li className="text-danger">{e.error}</li>}
                      </ol>
                    )}
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

function NodeConfig({ index, node, setCfg, workers, capabilities }: { index: number; node: Node; setCfg: (k: string, v: unknown) => void; workers: { key: string; name: string; title: string }[]; capabilities: Record<string, { key: string; label: string }[]> }) {
  const c = node.config;
  const s = (k: string) => String(c[k] ?? "");
  const id = (k: string) => `step-${index}-${k}`;
  const WorkerPicker = (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Worker" htmlFor="w">
        <Select
          value={s("workerKey")}
          onChange={(e) => {
            setCfg("workerKey", e.target.value);
            setCfg("capability", capabilities[e.target.value]?.[0]?.key ?? "");
          }}
          aria-label="Worker"
        >
          {workers.map((w) => (
            <option key={w.key} value={w.key}>
              {w.name} · {w.title}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Capability" htmlFor="c">
        <Select value={s("capability")} onChange={(e) => setCfg("capability", e.target.value)} aria-label="Capability">
          {(capabilities[s("workerKey")] ?? []).map((cap) => (
            <option key={cap.key} value={cap.key}>
              {cap.label}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
  switch (node.type) {
    case "CONDITION":
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Field" htmlFor={id("field")} hint="e.g. lead.score, lead.source, payload.status">
            <Input id={id("field")} value={s("field")} onChange={(e) => setCfg("field", e.target.value)} placeholder="lead.score" />
          </Field>
          <Field label="Operator" htmlFor={id("op")}>
            <Select id={id("op")} value={s("operator")} onChange={(e) => setCfg("operator", e.target.value)}>
              {Object.entries(OPERATORS).map(([o, label]) => (
                <option key={o} value={o}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Value" htmlFor={id("val")}>
            <Input id={id("val")} value={s("value")} onChange={(e) => setCfg("value", e.target.value)} placeholder="30" disabled={["exists", "not_exists"].includes(s("operator"))} />
          </Field>
        </div>
      );
    case "DELAY":
      return (
        <div className="flex gap-3">
          <Input type="number" min={1} max={365} value={Number(c.amount ?? 1)} onChange={(e) => setCfg("amount", Number(e.target.value) || 1)} aria-label="Amount" className="w-28" />
          <Select value={s("unit")} onChange={(e) => setCfg("unit", e.target.value)} aria-label="Unit" className="w-40">
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </Select>
        </div>
      );
    case "AI_ACTION":
      return (
        <div className="space-y-3">
          {WorkerPicker}
          <Field label="Brief" htmlFor={id("i")}>
            <Textarea value={s("instructions")} onChange={(e) => setCfg("instructions", e.target.value)} rows={2} aria-label="Brief" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={!!c.saveAsContent} onCheckedChange={(v) => setCfg("saveAsContent", v)} aria-label="Save output to Content Studio" /> Save output to Content Studio
          </label>
        </div>
      );
    case "ASSIGN_WORKER":
      return (
        <div className="space-y-3">
          {WorkerPicker}
          <Textarea value={s("instructions")} onChange={(e) => setCfg("instructions", e.target.value)} rows={2} aria-label="Task brief" placeholder="Task brief" />
        </div>
      );
    case "SEND_EMAIL":
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Send to" htmlFor={id("to")}>
              <Select id={id("to")} value={s("to")} onChange={(e) => setCfg("to", e.target.value)}>
                <option value="lead">The lead</option>
                <option value="owner">The lead&apos;s owner</option>
                <option value="custom">Custom address</option>
              </Select>
            </Field>
            {s("to") === "custom" && (
              <Field label="Email address" htmlFor={id("email")}>
                <Input id={id("email")} type="email" value={s("email")} onChange={(e) => setCfg("email", e.target.value)} placeholder="team@company.com" />
              </Field>
            )}
          </div>
          <Field label="Subject" htmlFor={id("subject")}>
            <Input id={id("subject")} value={s("subject")} onChange={(e) => setCfg("subject", e.target.value)} />
          </Field>
          <Field label="Message" htmlFor={id("body")}>
            <Textarea id={id("body")} value={s("body")} onChange={(e) => setCfg("body", e.target.value)} rows={3} />
          </Field>
        </div>
      );
    case "CREATE_SOCIAL_POST":
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select value={s("platform")} onChange={(e) => setCfg("platform", e.target.value)} aria-label="Platform">
              {SOCIAL_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </option>
              ))}
            </Select>
            <Field label="Schedule in (hours, 0 = draft)" htmlFor={id("h")}>
              <Input type="number" min={0} max={720} value={Number(c.scheduleInHours ?? 0)} onChange={(e) => setCfg("scheduleInHours", Number(e.target.value) || 0)} aria-label="Schedule in hours" />
            </Field>
          </div>
          <Textarea value={s("text")} onChange={(e) => setCfg("text", e.target.value)} rows={3} aria-label="Post text" />
        </div>
      );
    case "UPDATE_LEAD":
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Set status" htmlFor={id("status")}>
            <Select id={id("status")} value={s("status")} onChange={(e) => setCfg("status", e.target.value || undefined)}>
              <option value="">Keep status</option>
              {LEAD_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {humanize(st)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Add tag" htmlFor={id("tag")}>
            <Input id={id("tag")} value={s("addTag")} onChange={(e) => setCfg("addTag", e.target.value || undefined)} placeholder="qualified" />
          </Field>
          <Field label="Change score by" htmlFor={id("score")}>
            <Input id={id("score")} type="number" min={-100} max={100} value={Number(c.scoreDelta ?? 0)} onChange={(e) => setCfg("scoreDelta", Number(e.target.value) || undefined)} />
          </Field>
        </div>
      );
    case "WEBHOOK":
      return (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={!!c.useIntegration} onCheckedChange={(v) => setCfg("useIntegration", v)} aria-label="Use outgoing webhook integration" /> Use the signed “Outgoing webhook” integration
          </label>
          {!c.useIntegration && <Input type="url" value={s("url")} onChange={(e) => setCfg("url", e.target.value)} placeholder="https://example.com/hook" aria-label="Webhook URL" />}
        </div>
      );
    case "NOTIFY":
      return (
        <div className="space-y-3">
          <Input value={s("title")} onChange={(e) => setCfg("title", e.target.value)} placeholder="Notification title" aria-label="Title" />
          <Input value={s("body")} onChange={(e) => setCfg("body", e.target.value)} placeholder="Details (optional)" aria-label="Body" />
        </div>
      );
    case "GENERATE_REPORT":
      return (
        <Field label="Report period (days)" htmlFor={id("d")}>
          <Input type="number" min={1} max={365} value={Number(c.days ?? 30)} onChange={(e) => setCfg("days", Number(e.target.value) || 30)} aria-label="Days" className="w-32" />
        </Field>
      );
  }
}
