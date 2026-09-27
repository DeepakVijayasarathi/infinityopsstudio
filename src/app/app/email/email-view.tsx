"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileStack, Mail, MailX, Plus, Repeat, Send, Trash2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatNumber, formatPercent } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateText } from "@/components/ui/time";
import { useConfirm } from "@/components/ui/confirm";

type Campaign = { id: string; name: string; type: "BROADCAST" | "SEQUENCE"; status: string; subject: string; sentAt: string | null; scheduledAt: string | null; deliveredCount: number; openCount: number; clickCount: number; unsubscribeCount: number; updatedAt: string };
type Template = { id: string; name: string; category: string; subject: string; previewText: string | null; body: string; updatedAt: string };

export function EmailView({ initialTab, campaigns, templates, stats, unsubscribed, perms }: { initialTab: string; campaigns: Campaign[]; templates: Template[]; stats: { delivered: number; openRate: number; clickRate: number; conversionRate: number; unsubscribes: number; unsubscribedLeads: number }; unsubscribed: { id: string; firstName: string; lastName: string | null; email: string | null; unsubscribedAt: string }[]; perms: { write: boolean; send: boolean } }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [creating, setCreating] = React.useState<string | null>(null);
  const [tpl, setTpl] = React.useState<Template | "new" | null>(null);

  async function create(type: "BROADCAST" | "SEQUENCE", template?: Template) {
    setCreating(type);
    try {
      const c = await api.post<{ id: string }>("email/campaigns", {
        name: template ? template.name : type === "SEQUENCE" ? "New nurture sequence" : "New email campaign",
        type,
        subject: template?.subject ?? "A quick update from our team",
        previewText: template?.previewText ?? null,
        body: template?.body ?? "Hi {{first_name}},\n\nWrite your message here.\n\n[Call to action]({{cta_url}})",
        templateId: template?.id ?? null,
        steps: type === "SEQUENCE" ? [{ delayDays: 2, subject: "Following up, {{first_name}}", body: "Hi {{first_name}}, just checking in." }] : null,
        segment: {},
      });
      router.push(`/app/email/${c.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setCreating(null);
    }
  }

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Emails delivered" value={formatNumber(stats.delivered)} icon={Send} />
        <StatCard label="Open rate" value={formatPercent(stats.openRate)} icon={Mail} />
        <StatCard label="Click rate" value={formatPercent(stats.clickRate)} icon={Repeat} />
        <StatCard label="Unsubscribed contacts" value={formatNumber(stats.unsubscribedLeads)} icon={MailX} />
      </div>
      <Tabs defaultValue={initialTab}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="campaigns">
              <Mail /> Campaigns
            </TabsTrigger>
            <TabsTrigger value="templates">
              <FileStack /> Templates
            </TabsTrigger>
            <TabsTrigger value="unsubscribes">
              <MailX /> Unsubscribes
            </TabsTrigger>
          </TabsList>
          {perms.write && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => create("SEQUENCE")} loading={creating === "SEQUENCE"}>
                <Repeat /> New sequence
              </Button>
              <Button onClick={() => create("BROADCAST")} loading={creating === "BROADCAST"}>
                <Plus /> New campaign
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="campaigns">
          <DataTable
            rows={campaigns}
            rowKey={(r) => r.id}
            onRowClick={(r) => router.push(`/app/email/${r.id}`)}
            empty={<EmptyState icon={Mail} title="No email campaigns yet" description="Send a broadcast or build an automated nurture sequence." />}
            columns={[
              {
                key: "name",
                header: "Campaign",
                cell: (r) => (
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.subject}</p>
                  </div>
                ),
              },
              { key: "type", header: "Type", cell: (r) => <Badge tone={r.type === "SEQUENCE" ? "brand" : "neutral"}>{r.type === "SEQUENCE" ? "Sequence" : "Broadcast"}</Badge> },
              { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
              { key: "delivered", header: "Delivered", cell: (r) => <span className="tabular-nums">{r.deliveredCount.toLocaleString()}</span>, className: "text-right" },
              { key: "open", header: "Opens", cell: (r) => <span className="tabular-nums">{r.deliveredCount ? formatPercent(r.openCount / r.deliveredCount) : "—"}</span>, className: "text-right" },
              { key: "click", header: "Clicks", cell: (r) => <span className="tabular-nums">{r.deliveredCount ? formatPercent(r.clickCount / r.deliveredCount) : "—"}</span>, className: "text-right" },
              { key: "when", header: "Sent / scheduled", cell: (r) => <span className="text-xs text-muted-foreground">{r.sentAt ? <DateText date={r.sentAt} /> : r.scheduledAt ? <DateText date={r.scheduledAt} withTime /> : "—"}</span>, hideOnMobile: true },
            ]}
          />
        </TabsContent>

        <TabsContent value="templates">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {perms.write && (
              <button onClick={() => setTpl("new")} className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground transition hover:border-primary hover:text-primary">
                <Plus className="size-5" /> New template
              </button>
            )}
            {templates.map((t) => (
              <Card key={t.id} className="flex flex-col p-4">
                <Badge className="w-fit">{t.category}</Badge>
                <h3 className="mt-2 font-semibold">{t.name}</h3>
                <p className="line-clamp-1 text-sm text-muted-foreground">{t.subject}</p>
                <p className="mt-2 line-clamp-3 flex-1 whitespace-pre-line text-xs text-muted-foreground">{t.body}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {perms.write && (
                    <Button size="sm" onClick={() => create("BROADCAST", t)}>
                      Use template
                    </Button>
                  )}
                  {perms.write && (
                    <Button size="sm" variant="outline" onClick={() => setTpl(t)}>
                      Edit
                    </Button>
                  )}
                  {perms.write && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="ml-auto text-danger"
                      aria-label={`Delete template ${t.name}`}
                      onClick={async () => {
                        if (!(await confirm({ title: `Delete “${t.name}”?`, destructive: true, confirmLabel: "Delete" }))) return;
                        try {
                          await api.del(`email/templates/${t.id}`);
                          toast.success("Template deleted");
                          router.refresh();
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="unsubscribes">
          {unsubscribed.length === 0 ? (
            <EmptyState icon={MailX} title="No unsubscribes" description="Contacts who opt out are listed here and are automatically excluded from every send." />
          ) : (
            <Card>
              <ul className="divide-y divide-border">
                {unsubscribed.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/app/leads/${u.id}`} className="font-medium hover:text-primary">
                        {u.firstName} {u.lastName}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {u.email} · unsubscribed <DateText date={u.unsubscribedAt} />
                      </p>
                    </div>
                    {perms.send && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          if (!(await confirm({ title: "Resubscribe this contact?", description: "Only do this if the person explicitly asked to receive marketing email again.", confirmLabel: "Resubscribe" }))) return;
                          try {
                            await api.post(`leads/${u.id}/resubscribe`);
                            toast.success("Contact resubscribed");
                            router.refresh();
                          } catch (e) {
                            toast.error((e as Error).message);
                          }
                        }}
                      >
                        Resubscribe
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </TabsContent>
      </Tabs>
      <TemplateDialog template={tpl} onClose={() => setTpl(null)} onSaved={() => router.refresh()} />
    </>
  );
}

function TemplateDialog({ template, onClose, onSaved }: { template: Template | "new" | null; onClose: () => void; onSaved: () => void }) {
  const t = template && template !== "new" ? template : null;
  const [v, setV] = React.useState({ name: "", category: "general", subject: "", previewText: "", body: "" });
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (template) setV({ name: t?.name ?? "", category: t?.category ?? "general", subject: t?.subject ?? "", previewText: t?.previewText ?? "", body: t?.body ?? "Hi {{first_name}},\n\n" });
  }, [template, t]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (t) await api.patch(`email/templates/${t.id}`, v);
      else await api.post("email/templates", v);
      toast.success("Template saved");
      onClose();
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={!!template} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <form onSubmit={save}>
          <DialogHeader>
            <DialogTitle>{t ? "Edit template" : "New template"}</DialogTitle>
            <DialogDescription>Use {"{{first_name}}"}, {"{{company}}"} and {"{{cta_url}}"} merge tags. Body supports Markdown.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" htmlFor="t-name" required>
                <Input id="t-name" value={v.name} onChange={(e) => setV((x) => ({ ...x, name: e.target.value }))} required />
              </Field>
              <Field label="Category" htmlFor="t-cat">
                <Input id="t-cat" value={v.category} onChange={(e) => setV((x) => ({ ...x, category: e.target.value }))} />
              </Field>
            </div>
            <Field label="Subject" htmlFor="t-subject" required>
              <Input id="t-subject" value={v.subject} onChange={(e) => setV((x) => ({ ...x, subject: e.target.value }))} required />
            </Field>
            <Field label="Preview text" htmlFor="t-preview">
              <Input id="t-preview" value={v.previewText} onChange={(e) => setV((x) => ({ ...x, previewText: e.target.value }))} />
            </Field>
            <Field label="Body" htmlFor="t-body" required>
              <Textarea id="t-body" value={v.body} onChange={(e) => setV((x) => ({ ...x, body: e.target.value }))} rows={10} className="font-mono text-[13px]" required />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
