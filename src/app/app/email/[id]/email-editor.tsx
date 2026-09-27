"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CalendarClock, Eye, FlaskConical, Pause, Play, Plus, Save, Send, Sparkles, Square, Trash2, Users, XCircle } from "lucide-react";
import { api } from "@/lib/api-client";
import { humanize, LEAD_SOURCES, LEAD_STATUSES } from "@/lib/constants";
import { cn, formatPercent } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/ui/markdown";
import { useConfirm } from "@/components/ui/confirm";
import { AIMeta } from "@/components/app/ai-meta";
import { useAIStream } from "@/hooks/use-ai-stream";

type Segment = { statuses?: string[]; sources?: string[]; tags?: string[]; minScore?: number; campaignId?: string };
type Step = { delayDays: number; subject: string; body: string };
type Campaign = {
  id: string;
  name: string;
  type: "BROADCAST" | "SEQUENCE";
  status: string;
  subject: string;
  previewText: string | null;
  body: string;
  fromName: string | null;
  segment: Segment | null;
  steps: Step[] | null;
  campaignId: string | null;
  scheduledAt: string | null;
  recipientsCount: number;
  deliveredCount: number;
  openCount: number;
  clickCount: number;
  conversionCount: number;
  unsubscribeCount: number;
};

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function EmailEditor({ campaign: c, tags, campaigns, perms }: { campaign: Campaign; tags: string[]; campaigns: { id: string; name: string }[]; perms: { write: boolean; send: boolean } }) {
  const router = useRouter();
  const confirm = useConfirm();
  const editable = perms.write && ["DRAFT", "SCHEDULED", "PAUSED"].includes(c.status);
  const [v, setV] = React.useState({ name: c.name, subject: c.subject, previewText: c.previewText ?? "", body: c.body, fromName: c.fromName ?? "", campaignId: c.campaignId ?? "" });
  const [segment, setSegment] = React.useState<Segment>(c.segment ?? {});
  const [steps, setSteps] = React.useState<Step[]>(c.steps ?? []);
  const [audience, setAudience] = React.useState<{ count: number; sample: { firstName: string; lastName: string | null; email: string | null }[] } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState(false);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [when, setWhen] = React.useState(c.scheduledAt ? toLocalInput(new Date(c.scheduledAt)) : "");
  const ai = useAIStream();
  const [goal, setGoal] = React.useState("");

  // Live audience count for the segment.
  React.useEffect(() => {
    const t = setTimeout(() => {
      api.post<typeof audience>("email/segments/preview", segment).then(setAudience).catch(() => setAudience(null));
    }, 300);
    return () => clearTimeout(t);
  }, [segment]);

  const toggle = (key: "statuses" | "sources" | "tags", value: string) =>
    setSegment((s) => {
      const cur = new Set(s[key] ?? []);
      if (cur.has(value)) cur.delete(value);
      else cur.add(value);
      return { ...s, [key]: [...cur] };
    });

  async function save(silent = false) {
    setBusy("save");
    try {
      await api.patch(`email/campaigns/${c.id}`, { ...v, previewText: v.previewText || null, fromName: v.fromName || null, campaignId: v.campaignId || null, segment, steps: c.type === "SEQUENCE" ? steps : null });
      if (!silent) toast.success("Saved");
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function schedule(now: boolean) {
    if (!(await save(true))) return;
    if (now && !(await confirm({ title: c.type === "SEQUENCE" ? "Activate this sequence?" : "Send this campaign now?", description: `${audience?.count ?? 0} subscribed contacts match your segment. This can't be undone.`, confirmLabel: c.type === "SEQUENCE" ? "Activate" : "Send now" }))) return;
    setBusy("schedule");
    try {
      const r = await api.post<{ recipients: number }>(`email/campaigns/${c.id}/schedule`, { scheduledAt: now ? null : new Date(when).toISOString() });
      toast.success(now ? `Sending to ${r.recipients.toLocaleString()} contacts` : `Scheduled for ${r.recipients.toLocaleString()} contacts`);
      setScheduleOpen(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function state(s: "PAUSED" | "ACTIVE" | "CANCELLED") {
    setBusy(s);
    try {
      await api.post(`email/campaigns/${c.id}/state`, { state: s });
      toast.success(s === "PAUSED" ? "Paused" : s === "ACTIVE" ? "Resumed" : "Cancelled");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    if (!(await save(true))) return;
    setBusy("test");
    try {
      const r = await api.post<{ sentTo: string }>(`email/campaigns/${c.id}/test`);
      toast.success(`Test email sent to ${r.sentTo}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function write(kind: "email" | "subject-lines") {
    if (goal.trim().length < 3) return toast.error("Describe the email goal first");
    const { text } = await ai.start("email/writer", { goal, kind });
    if (text && kind === "email") setV((x) => ({ ...x, body: text }));
  }

  const sent = c.deliveredCount > 0;

  return (
    <div className="space-y-6">
      <Link href="/app/email" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Email marketing
      </Link>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusBadge status={c.status} />
            <Badge tone={c.type === "SEQUENCE" ? "brand" : "neutral"}>{c.type === "SEQUENCE" ? "Sequence" : "Broadcast"}</Badge>
          </div>
          <input value={v.name} onChange={(e) => setV((x) => ({ ...x, name: e.target.value }))} readOnly={!editable} aria-label="Campaign name" className="mt-2 w-full bg-transparent text-2xl font-semibold tracking-tight outline-none" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPreview(true)}>
            <Eye /> Preview
          </Button>
          {perms.write && (
            <Button variant="outline" onClick={test} loading={busy === "test"}>
              <FlaskConical /> Send test
            </Button>
          )}
          {editable && (
            <Button variant="outline" onClick={() => save()} loading={busy === "save"}>
              <Save /> Save
            </Button>
          )}
          {perms.send && editable && (
            <>
              <Button variant="outline" onClick={() => setScheduleOpen(true)}>
                <CalendarClock /> Schedule
              </Button>
              <Button onClick={() => schedule(true)} loading={busy === "schedule"}>
                <Send /> {c.type === "SEQUENCE" ? "Activate" : "Send now"}
              </Button>
            </>
          )}
          {perms.send && c.status === "ACTIVE" && (
            <Button variant="outline" onClick={() => state("PAUSED")} loading={busy === "PAUSED"}>
              <Pause /> Pause
            </Button>
          )}
          {perms.send && c.status === "PAUSED" && (
            <Button variant="outline" onClick={() => state("ACTIVE")} loading={busy === "ACTIVE"}>
              <Play /> Resume
            </Button>
          )}
          {perms.send && ["SCHEDULED", "ACTIVE", "PAUSED"].includes(c.status) && (
            <Button variant="ghost" className="text-danger" onClick={() => state("CANCELLED")} loading={busy === "CANCELLED"}>
              <XCircle /> Cancel
            </Button>
          )}
        </div>
      </div>

      {sent && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            ["Delivered", c.deliveredCount.toLocaleString()],
            ["Open rate", formatPercent(c.openCount / c.deliveredCount)],
            ["Click rate", formatPercent(c.clickCount / c.deliveredCount)],
            ["Conversions", c.conversionCount.toLocaleString()],
            ["Unsubscribes", c.unsubscribeCount.toLocaleString()],
          ].map(([l, val]) => (
            <Card key={l} className="p-4">
              <p className="text-xs text-muted-foreground">{l}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{val}</p>
            </Card>
          ))}
        </div>
      )}
      {!editable && perms.write && <p className="rounded-lg bg-muted px-4 py-2.5 text-sm text-muted-foreground">This campaign is {humanize(c.status).toLowerCase()} and can no longer be edited. Duplicate it from a template to send again.</p>}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4 pt-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Subject line" htmlFor="subject" required>
                  <Input id="subject" value={v.subject} onChange={(e) => setV((x) => ({ ...x, subject: e.target.value }))} readOnly={!editable} />
                </Field>
                <Field label="Preview text" htmlFor="preview">
                  <Input id="preview" value={v.previewText} onChange={(e) => setV((x) => ({ ...x, previewText: e.target.value }))} readOnly={!editable} />
                </Field>
                <Field label="From name" htmlFor="from">
                  <Input id="from" value={v.fromName} onChange={(e) => setV((x) => ({ ...x, fromName: e.target.value }))} readOnly={!editable} placeholder="Sarah at Northwind" />
                </Field>
                <Field label="Marketing campaign" htmlFor="mc">
                  <Select id="mc" value={v.campaignId} onChange={(e) => setV((x) => ({ ...x, campaignId: e.target.value }))} disabled={!editable}>
                    <option value="">None</option>
                    {campaigns.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label={c.type === "SEQUENCE" ? "Email 1 (sent on enrollment)" : "Body"} htmlFor="body" hint="Markdown supported. Merge tags: {{first_name}}, {{last_name}}, {{company}}, {{cta_url}}. An unsubscribe link is added automatically.">
                <Textarea id="body" value={v.body} onChange={(e) => setV((x) => ({ ...x, body: e.target.value }))} readOnly={!editable} rows={12} className="font-mono text-[13px]" />
              </Field>
            </CardContent>
          </Card>

          {c.type === "SEQUENCE" && (
            <Card>
              <CardHeader>
                <CardTitle>Follow-up steps</CardTitle>
                <CardDescription>Each step waits the given number of days after the previous email.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {steps.map((s, i) => (
                  <div key={i} className="rounded-lg border border-border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium">Email {i + 2}</p>
                      {editable && (
                        <Button size="icon-sm" variant="ghost" aria-label={`Remove email ${i + 2}`} onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}>
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
                      <Field label="Wait (days)" htmlFor={`d-${i}`}>
                        <Input id={`d-${i}`} type="number" min={1} max={90} value={s.delayDays} readOnly={!editable} onChange={(e) => setSteps((x) => x.map((y, j) => (j === i ? { ...y, delayDays: Number(e.target.value) || 1 } : y)))} />
                      </Field>
                      <Field label="Subject" htmlFor={`s-${i}`}>
                        <Input id={`s-${i}`} value={s.subject} readOnly={!editable} onChange={(e) => setSteps((x) => x.map((y, j) => (j === i ? { ...y, subject: e.target.value } : y)))} />
                      </Field>
                    </div>
                    <Textarea className="mt-3 font-mono text-[13px]" rows={4} value={s.body} readOnly={!editable} aria-label={`Email ${i + 2} body`} onChange={(e) => setSteps((x) => x.map((y, j) => (j === i ? { ...y, body: e.target.value } : y)))} />
                  </div>
                ))}
                {editable && steps.length < 10 && (
                  <Button variant="outline" size="sm" onClick={() => setSteps((x) => [...x, { delayDays: 3, subject: "", body: "Hi {{first_name}},\n\n" }])}>
                    <Plus /> Add step
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4" /> Audience
              </CardTitle>
              <CardDescription>
                <span className="text-lg font-semibold text-foreground tabular-nums">{audience?.count.toLocaleString() ?? "…"}</span> subscribed contacts match
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <fieldset disabled={!editable}>
                <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Lead status</legend>
                <div className="flex flex-wrap gap-1.5">
                  {LEAD_STATUSES.map((s) => (
                    <Chip key={s} on={!!segment.statuses?.includes(s)} onClick={() => toggle("statuses", s)}>
                      {humanize(s)}
                    </Chip>
                  ))}
                </div>
              </fieldset>
              <fieldset disabled={!editable}>
                <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Source</legend>
                <div className="flex flex-wrap gap-1.5">
                  {LEAD_SOURCES.map((s) => (
                    <Chip key={s} on={!!segment.sources?.includes(s)} onClick={() => toggle("sources", s)}>
                      {humanize(s)}
                    </Chip>
                  ))}
                </div>
              </fieldset>
              {tags.length > 0 && (
                <fieldset disabled={!editable}>
                  <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Tags (any)</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                      <Chip key={t} on={!!segment.tags?.includes(t)} onClick={() => toggle("tags", t)}>
                        {t}
                      </Chip>
                    ))}
                  </div>
                </fieldset>
              )}
              <Field label={`Minimum lead score: ${segment.minScore ?? 0}`} htmlFor="minScore">
                <Input id="minScore" type="range" min={0} max={100} step={5} disabled={!editable} value={segment.minScore ?? 0} onChange={(e) => setSegment((s) => ({ ...s, minScore: Number(e.target.value) || undefined }))} className="h-8 px-0 accent-[hsl(var(--primary))]" />
              </Field>
              {audience && audience.sample.length > 0 && (
                <div className="rounded-lg bg-surface p-3 text-xs text-muted-foreground">
                  e.g. {audience.sample.map((s) => `${s.firstName} ${s.lastName ?? ""}`.trim()).join(", ")}
                  {audience.count > audience.sample.length ? ` and ${(audience.count - audience.sample.length).toLocaleString()} more` : ""}
                </div>
              )}
            </CardContent>
          </Card>

          {editable && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" /> AI email writer
                </CardTitle>
                <CardDescription>Echo writes in your brand voice.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} placeholder="Invite trial users to a live onboarding session on Thursday" aria-label="Email goal" />
                <div className="flex flex-wrap gap-2">
                  {ai.streaming ? (
                    <Button size="sm" variant="outline" onClick={ai.stop}>
                      <Square /> Stop
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => write("email")}>
                        Write body
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => write("subject-lines")}>
                        Subject ideas
                      </Button>
                    </>
                  )}
                </div>
                {(ai.text || ai.error) && <div className="max-h-56 overflow-y-auto rounded-lg border border-border p-3 text-sm scrollbar-thin">{ai.error ? <p className="text-danger">{ai.error}</p> : <Markdown content={ai.text} className="text-sm" />}</div>}
                <AIMeta meta={ai.meta} usage={ai.usage} streaming={ai.streaming} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{v.subject.replace(/\{\{\s*first_name\s*\}\}/g, "Alex")}</DialogTitle>
            <DialogDescription>{v.previewText || "No preview text"} · merge tags shown with sample values</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60dvh] overflow-y-auto rounded-xl border border-border bg-white p-6 text-slate-900 scrollbar-thin">
            <Markdown content={v.body.replace(/\{\{\s*first_name\s*\}\}/g, "Alex").replace(/\{\{\s*company\s*\}\}/g, "Coastal Freight").replace(/\{\{\s*cta_url\s*\}\}/g, "#")} />
            <p className="mt-8 border-t pt-3 text-xs text-slate-500">Unsubscribe link added automatically</p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Schedule {c.type === "SEQUENCE" ? "sequence start" : "send"}</DialogTitle>
            <DialogDescription>Time is in your local timezone.</DialogDescription>
          </DialogHeader>
          <Field label="Send at" htmlFor="when">
            <Input id="when" type="datetime-local" value={when} min={toLocalInput(new Date())} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => schedule(false)} loading={busy === "schedule"} disabled={!when}>
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn("rounded-full border px-2.5 py-0.5 text-xs transition disabled:opacity-60", on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}
