"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import { ArrowLeft, Bot, ListChecks, MessageSquare, Send, Settings2, Sparkles, Square, BarChart3 } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatCompact, formatMicros, timeAgo } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { Markdown } from "@/components/ui/markdown";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModelSelect } from "@/components/app/model-select";
import { AIMeta } from "@/components/app/ai-meta";
import { WorkerIcon } from "@/components/marketing/worker-icon";
import { useAIStream } from "@/hooks/use-ai-stream";
import { TaskDialog, type TaskRow } from "../task-dialog";
import { TaskList } from "../workers-view";

type Capability = { key: string; label: string; description: string; placeholder: string };
type Worker = {
  id: string;
  key: string;
  name: string;
  title: string;
  description: string;
  color: string;
  isActive: boolean;
  customInstructions: string | null;
  model: string | null;
  temperature: number;
  requiresApproval: boolean;
  template?: { icon: string; capabilities: Capability[] };
  usage: { tasks: number; tasksLast30d: number; tokens: number; costMicros: number };
};

export function WorkerDetail({ worker, tasks, campaigns, canRun, canManage, openTaskId }: { worker: Worker; tasks: TaskRow[]; campaigns: { id: string; name: string }[]; canRun: boolean; canManage: boolean; openTaskId: string | null }) {
  const router = useRouter();
  const caps = worker.template?.capabilities ?? [];
  const [openTask, setOpenTask] = React.useState<string | null>(openTaskId);

  return (
    <div className="space-y-6">
      <Link href="/app/workers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All workers
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="grid size-14 place-items-center rounded-2xl text-white shadow-md" style={{ background: worker.color }}>
          <WorkerIcon name={worker.template?.icon} className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{worker.name}</h1>
            <Badge tone={worker.isActive ? "success" : "neutral"} dot>
              {worker.isActive ? "Active" : "Inactive"}
            </Badge>
            {worker.requiresApproval && <Badge tone="warning">Approval required</Badge>}
          </div>
          <p className="text-muted-foreground">{worker.title}</p>
        </div>
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">{worker.description}</p>

      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">
            <ListChecks /> Tasks
          </TabsTrigger>
          <TabsTrigger value="chat">
            <MessageSquare /> Chat
          </TabsTrigger>
          <TabsTrigger value="config">
            <Settings2 /> Configuration
          </TabsTrigger>
          <TabsTrigger value="usage">
            <BarChart3 /> Usage
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
            <StartTask worker={worker} caps={caps} campaigns={campaigns} canRun={canRun} onCreated={(id) => { setOpenTask(id); router.refresh(); }} />
            <div>
              <h2 className="mb-3 text-sm font-semibold">Task history</h2>
              {tasks.length === 0 ? <EmptyState icon={Bot} title="No tasks yet" description={`Assign ${worker.name} a task to see output here.`} /> : <TaskList tasks={tasks} onOpen={setOpenTask} />}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="chat">
          <WorkerChat worker={worker} canRun={canRun} />
        </TabsContent>

        <TabsContent value="config">
          <WorkerConfig worker={worker} canManage={canManage} onSaved={() => router.refresh()} />
        </TabsContent>

        <TabsContent value="usage">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Total tasks", worker.usage.tasks.toLocaleString()],
              ["Tasks (30 days)", worker.usage.tasksLast30d.toLocaleString()],
              ["Tokens used", formatCompact(worker.usage.tokens)],
              ["AI cost", formatMicros(worker.usage.costMicros)],
            ].map(([l, v]) => (
              <Card key={l} className="p-4">
                <p className="text-sm text-muted-foreground">{l}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">{v}</p>
              </Card>
            ))}
          </div>
          <h3 className="mb-3 mt-8 text-sm font-semibold">Capabilities</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {caps.map((c) => (
              <div key={c.key} className="rounded-xl border border-border bg-card p-4">
                <p className="font-medium">{c.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      <TaskDialog taskId={openTask} onClose={() => setOpenTask(null)} onChanged={() => router.refresh()} />
    </div>
  );
}

function StartTask({ worker, caps, campaigns, canRun, onCreated }: { worker: Worker; caps: Capability[]; campaigns: { id: string; name: string }[]; canRun: boolean; onCreated: (id: string) => void }) {
  const [capability, setCapability] = React.useState(caps[0]?.key ?? "");
  const [instructions, setInstructions] = React.useState("");
  const [context, setContext] = React.useState("");
  const [campaignId, setCampaignId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const cap = caps.find((c) => c.key === capability);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const task = await api.post<{ id: string }>(`workers/${worker.id}/tasks`, { capability, instructions, context: context || undefined, campaignId: campaignId || null });
      toast.success(`${worker.name} is on it`);
      setInstructions("");
      setContext("");
      onCreated(task.id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start a task</CardTitle>
        <CardDescription>Pick a capability and describe what you need.</CardDescription>
      </CardHeader>
      <CardContent>
        {!worker.isActive ? (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Activate {worker.name} on the Workers page to assign tasks.</p>
        ) : !canRun ? (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Your role can view tasks but not run workers.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div role="radiogroup" aria-label="Capability" className="grid grid-cols-2 gap-2">
              {caps.map((c) => (
                <button
                  type="button"
                  key={c.key}
                  role="radio"
                  aria-checked={capability === c.key}
                  onClick={() => setCapability(c.key)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition ${capability === c.key ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {cap && <p className="text-xs text-muted-foreground">{cap.description}</p>}
            <Field label="Brief" htmlFor="instructions" required>
              <Textarea id="instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder={cap?.placeholder} rows={4} required minLength={5} />
            </Field>
            <Field label="Additional context" htmlFor="context" hint="Optional: data, links or constraints.">
              <Textarea id="context" value={context} onChange={(e) => setContext(e.target.value)} rows={2} />
            </Field>
            {campaigns.length > 0 && (
              <Field label="Link to campaign" htmlFor="campaign">
                <Select id="campaign" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                  <option value="">No campaign</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Button type="submit" className="w-full" loading={busy} disabled={instructions.trim().length < 5}>
              <Sparkles /> Assign to {worker.name}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

type Msg = { role: "user" | "assistant"; content: string };

function WorkerChat({ worker, canRun }: { worker: Worker; canRun: boolean }) {
  const { data: convos, mutate } = useSWR<{ id: string; title: string; updatedAt: string }[]>(`/api/v1/workers/${worker.id}/conversations`);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const ai = useAIStream();
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [messages, ai.text]);

  async function load(id: string) {
    const c = await api.get<{ messages: { role: string; content: string }[] }>(`workers/conversations/${id}`);
    setConversationId(id);
    setMessages(c.messages.filter((m): m is Msg => m.role === "user" || m.role === "assistant"));
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || ai.streaming) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    const { text: reply, response } = await ai.start(`workers/${worker.id}/chat`, { message: text, conversationId });
    const newId = response?.headers.get("x-conversation-id");
    if (newId) setConversationId(newId);
    if (reply) setMessages((m) => [...m, { role: "assistant", content: reply }]);
    ai.setText("");
    mutate();
  }

  if (!worker.isActive || !canRun) return <EmptyState icon={MessageSquare} title="Chat unavailable" description={!worker.isActive ? `Activate ${worker.name} to chat.` : "Your role can't run workers."} />;

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-1">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            setConversationId(null);
            setMessages([]);
          }}
        >
          New conversation
        </Button>
        <ul className="mt-2 space-y-0.5">
          {convos?.map((c) => (
            <li key={c.id}>
              <button onClick={() => load(c.id)} className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted ${conversationId === c.id ? "bg-muted font-medium" : ""}`}>
                <span className="line-clamp-1">{c.title}</span>
                <span className="text-[11px] text-muted-foreground"><TimeAgo date={c.updatedAt} /></span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <Card className="flex h-[65dvh] min-h-[420px] flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin" aria-live="polite">
          {messages.length === 0 && !ai.streaming && (
            <div className="grid h-full place-items-center text-center text-sm text-muted-foreground">
              <div>
                <MessageSquare className="mx-auto mb-2 size-8 text-primary" />
                Ask {worker.name} anything — brainstorm, critique a draft or plan your week.
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground" : "max-w-[92%] rounded-2xl rounded-bl-md bg-muted px-4 py-3"}>
              {m.role === "user" ? m.content : <Markdown content={m.content} className="text-sm" />}
            </div>
          ))}
          {ai.streaming && (
            <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-muted px-4 py-3">
              <Markdown content={ai.text || "…"} className="text-sm" />
            </div>
          )}
          {ai.error && <p className="text-sm text-danger">{ai.error}</p>}
          <div ref={endRef} />
        </div>
        <form onSubmit={send} className="flex items-end gap-2 border-t border-border p-3">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                (e.currentTarget.form as HTMLFormElement).requestSubmit();
              }
            }}
            placeholder={`Message ${worker.name}…`}
            rows={1}
            className="min-h-10 resize-none"
            aria-label="Message"
          />
          {ai.streaming ? (
            <Button type="button" variant="outline" size="icon" onClick={ai.stop} aria-label="Stop generating">
              <Square />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Send">
              <Send />
            </Button>
          )}
        </form>
        <div className="px-3 pb-2">
          <AIMeta meta={ai.meta} usage={ai.usage} streaming={ai.streaming} />
        </div>
      </Card>
    </div>
  );
}

function WorkerConfig({ worker, canManage, onSaved }: { worker: Worker; canManage: boolean; onSaved: () => void }) {
  const [customInstructions, setInstructions] = React.useState(worker.customInstructions ?? "");
  const [model, setModel] = React.useState<string | null>(worker.model);
  const [temperature, setTemperature] = React.useState(worker.temperature);
  const [requiresApproval, setApproval] = React.useState(worker.requiresApproval);
  const [busy, setBusy] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch(`workers/${worker.id}`, { customInstructions: customInstructions || null, model, temperature, requiresApproval });
      toast.success("Configuration saved");
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Prompt & context configuration</CardTitle>
        <CardDescription>{worker.name} always receives your Brand Kit. Add workspace-specific instructions on top.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-5">
          <fieldset disabled={!canManage} className="space-y-5">
            <Field label="Custom instructions" htmlFor="ci" hint="E.g. “Always include a customer example with a number.” Up to 4,000 characters.">
              <Textarea id="ci" value={customInstructions} onChange={(e) => setInstructions(e.target.value)} rows={5} maxLength={4000} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="AI model" htmlFor="model">
                <ModelSelect value={model} onChange={setModel} />
              </Field>
              <Field label={`Creativity (temperature ${temperature.toFixed(1)})`} htmlFor="temp" hint="Ignored by models that manage sampling themselves.">
                <Input id="temp" type="range" min={0} max={1} step={0.1} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} className="h-9 px-0 accent-[hsl(var(--primary))]" />
              </Field>
            </div>
            <label className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
              <span>
                <span className="block text-sm font-medium">Require approval</span>
                <span className="text-xs text-muted-foreground">Outputs wait for a manager&apos;s review before they&apos;re marked complete.</span>
              </span>
              <Switch checked={requiresApproval} onCheckedChange={setApproval} aria-label="Require approval" />
            </label>
          </fieldset>
          {canManage ? (
            <Button type="submit" loading={busy}>
              Save configuration
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Only managers and admins can change worker configuration.</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
