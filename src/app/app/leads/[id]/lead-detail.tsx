"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Building2, CheckSquare, Globe, Mail, MailCheck, MailOpen, MousePointerClick, NotebookPen, Pencil, Phone, PhoneCall, Plus, Sparkles, Square, Trash2, Users, Workflow } from "lucide-react";
import { api } from "@/lib/api-client";
import { humanize, LEAD_STATUSES } from "@/lib/constants";
import { cn, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/misc";
import { DateText, TimeAgo } from "@/components/ui/time";
import { useConfirm } from "@/components/ui/confirm";
import { LeadForm } from "../lead-form";
import { ScoreExplainer } from "./score-explainer";

type Activity = { id: string; type: string; content: string; createdAt: string; actor: { name: string } | null };
type Lead = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  website: string | null;
  source: string;
  status: string;
  score: number;
  tags: string[];
  valueCents: number;
  ownerId: string | null;
  campaignId: string | null;
  unsubscribedAt: string | null;
  lastContactedAt: string | null;
  createdAt: string;
  owner: { id: string; name: string } | null;
  campaign: { id: string; name: string } | null;
  activities: Activity[];
  tasks: { id: string; title: string; dueDate: string | null; completedAt: string | null }[];
  emailSends: { id: string; sentAt: string | null; openedAt: string | null; clickedAt: string | null; emailCampaign: { id: string; name: string; subject: string } }[];
};

const ACTIVITY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  CREATED: Plus,
  NOTE: NotebookPen,
  STATUS_CHANGE: Workflow,
  SCORE_CHANGE: Sparkles,
  EMAIL_SENT: MailCheck,
  EMAIL_OPENED: MailOpen,
  EMAIL_CLICKED: MousePointerClick,
  CALL: PhoneCall,
  MEETING: Users,
  TASK: CheckSquare,
  IMPORTED: Plus,
  WORKFLOW: Workflow,
};

export function LeadDetail({ lead, members, campaigns, perms }: { lead: Lead; members: { id: string; name: string }[]; campaigns: { id: string; name: string }[]; perms: { write: boolean; delete: boolean; send: boolean } }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editing, setEditing] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [noteType, setNoteType] = React.useState<"NOTE" | "CALL" | "MEETING">("NOTE");
  const [taskTitle, setTaskTitle] = React.useState("");
  const [taskDue, setTaskDue] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const name = `${lead.firstName} ${lead.lastName ?? ""}`.trim();

  async function run(key: string, fn: () => Promise<unknown>, msg?: string) {
    setBusy(key);
    try {
      await fn();
      if (msg) toast.success(msg);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/app/leads" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Leads
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar name={name} className="size-14 text-base" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          <p className="text-muted-foreground">{[lead.jobTitle, lead.company].filter(Boolean).join(" at ") || "No company"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {perms.write ? (
            <Select aria-label="Status" value={lead.status} onChange={(e) => run("status", () => api.patch(`leads/${lead.id}`, { status: e.target.value }), `Moved to ${humanize(e.target.value)}`)} className="w-40">
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          ) : (
            <StatusBadge status={lead.status} />
          )}
          {perms.write && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
          )}
          {perms.delete && (
            <Button
              variant="ghost"
              size="icon"
              className="text-danger"
              aria-label="Delete lead"
              onClick={async () => {
                if (!(await confirm({ title: `Delete ${name}?`, destructive: true, confirmLabel: "Delete lead" }))) return;
                await run("delete", () => api.del(`leads/${lead.id}`), "Lead deleted");
                router.push("/app/leads");
              }}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4 pt-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Lead score</span>
                <span className={cn("text-2xl font-semibold tabular-nums", lead.score >= 70 ? "text-success" : lead.score >= 40 ? "text-warning" : "")}>{lead.score}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={lead.score} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-primary" style={{ width: `${lead.score}%` }} />
              </div>
              <ScoreExplainer leadId={lead.id} score={lead.score} />
              <dl className="space-y-3 text-sm">
                {lead.email && (
                  <div className="flex items-center gap-2.5">
                    <Mail className="size-4 text-muted-foreground" />
                    <a href={`mailto:${lead.email}`} className="truncate hover:text-primary">
                      {lead.email}
                    </a>
                    {lead.unsubscribedAt && <Badge tone="danger">Unsubscribed</Badge>}
                  </div>
                )}
                {lead.phone && (
                  <div className="flex items-center gap-2.5">
                    <Phone className="size-4 text-muted-foreground" />
                    <a href={`tel:${lead.phone}`} className="hover:text-primary">
                      {lead.phone}
                    </a>
                  </div>
                )}
                {lead.company && (
                  <div className="flex items-center gap-2.5">
                    <Building2 className="size-4 text-muted-foreground" /> {lead.company}
                  </div>
                )}
                {lead.website && (
                  <div className="flex items-center gap-2.5">
                    <Globe className="size-4 text-muted-foreground" />
                    <a href={lead.website} target="_blank" rel="noopener noreferrer" className="truncate hover:text-primary">
                      {lead.website.replace(/^https?:\/\//, "")}
                    </a>
                  </div>
                )}
              </dl>
              <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
                {[
                  ["Source", humanize(lead.source)],
                  ["Deal value", lead.valueCents ? formatCurrency(lead.valueCents) : "—"],
                  ["Owner", lead.owner?.name ?? "Unassigned"],
                  ["Campaign", lead.campaign?.name ?? "—"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="mt-0.5 truncate">{v}</dd>
                  </div>
                ))}
                <div>
                  <dt className="text-xs text-muted-foreground">Added</dt>
                  <dd className="mt-0.5">
                    <DateText date={lead.createdAt} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Last contacted</dt>
                  <dd className="mt-0.5">{lead.lastContactedAt ? <TimeAgo date={lead.lastContactedAt} /> : "Never"}</dd>
                </div>
              </dl>
              {lead.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 border-t border-border pt-4">
                  {lead.tags.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tasks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {lead.tasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks yet.</p>}
              {lead.tasks.map((t) => (
                <div key={t.id} className="group flex items-center gap-2 text-sm">
                  <button
                    onClick={() => perms.write && run(`t-${t.id}`, () => api.patch(`leads/${lead.id}/tasks/${t.id}`, { done: !t.completedAt }))}
                    aria-label={t.completedAt ? `Reopen ${t.title}` : `Complete ${t.title}`}
                    className="text-muted-foreground hover:text-primary"
                    disabled={!perms.write}
                  >
                    {t.completedAt ? <CheckSquare className="size-4 text-success" /> : <Square className="size-4" />}
                  </button>
                  <span className={cn("min-w-0 flex-1 truncate", t.completedAt && "text-muted-foreground line-through")}>{t.title}</span>
                  {t.dueDate && <DateText date={t.dueDate} options={{ month: "short", day: "numeric" }} className={cn("text-xs", !t.completedAt && new Date(t.dueDate) < new Date() ? "text-danger" : "text-muted-foreground")} />}
                  {perms.write && (
                    <button onClick={() => run(`d-${t.id}`, () => api.del(`leads/${lead.id}/tasks/${t.id}`))} className="text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-danger" aria-label={`Delete ${t.title}`}>
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {perms.write && (
                <form
                  className="flex gap-2 pt-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!taskTitle.trim()) return;
                    void run("task", async () => {
                      await api.post(`leads/${lead.id}/tasks`, { title: taskTitle, dueDate: taskDue || null });
                      setTaskTitle("");
                      setTaskDue("");
                    });
                  }}
                >
                  <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="New task" aria-label="New task" className="h-8" />
                  <Input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} aria-label="Due date" className="h-8 w-36" />
                  <Button size="sm" type="submit" loading={busy === "task"} aria-label="Add task">
                    <Plus />
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {perms.write && (
            <Card className="p-4">
              <div className="mb-2 flex gap-1" role="radiogroup" aria-label="Activity type">
                {(["NOTE", "CALL", "MEETING"] as const).map((t) => (
                  <button key={t} role="radio" aria-checked={noteType === t} onClick={() => setNoteType(t)} className={cn("rounded-md px-2.5 py-1 text-xs font-medium", noteType === t ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
                    {t === "NOTE" ? "Note" : t === "CALL" ? "Log call" : "Log meeting"}
                  </button>
                ))}
              </div>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={noteType === "NOTE" ? "Add a note…" : "What was discussed? Next steps?"} aria-label="Activity details" />
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  loading={busy === "note"}
                  disabled={!note.trim()}
                  onClick={() =>
                    run(
                      "note",
                      async () => {
                        await api.post(`leads/${lead.id}/notes`, { content: note, type: noteType });
                        setNote("");
                      },
                      "Activity logged",
                    )
                  }
                >
                  Save
                </Button>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-5 border-l border-border pl-6">
                {lead.activities.map((a) => {
                  const Icon = ACTIVITY_ICON[a.type] ?? NotebookPen;
                  return (
                    <li key={a.id} className="relative">
                      <span className="absolute -left-[35px] grid size-7 place-items-center rounded-full border border-border bg-card">
                        <Icon className="size-3.5 text-primary" />
                      </span>
                      <p className="whitespace-pre-wrap text-sm">{a.content}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {humanize(a.type)} · {a.actor?.name ?? "System"} · <TimeAgo date={a.createdAt} />
                      </p>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>

          {lead.emailSends.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Emails</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {lead.emailSends.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                      <Link href={`/app/email/${s.emailCampaign.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-primary">
                        {s.emailCampaign.subject}
                      </Link>
                      {s.clickedAt ? <Badge tone="success">Clicked</Badge> : s.openedAt ? <Badge tone="info">Opened</Badge> : <Badge>Sent</Badge>}
                      {s.sentAt && <TimeAgo date={s.sentAt} className="text-xs text-muted-foreground" />}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Edit lead</DialogTitle>
          </DialogHeader>
          <LeadForm
            initial={lead}
            members={members}
            campaigns={campaigns}
            submitLabel="Save changes"
            onCancel={() => setEditing(false)}
            onSubmit={async (data) => {
              await api.patch(`leads/${lead.id}`, data);
              toast.success("Lead updated");
              setEditing(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
