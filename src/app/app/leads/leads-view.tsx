"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, KanbanSquare, List, Plus, Tag, Trash2, Upload, Users } from "lucide-react";
import { api } from "@/lib/api-client";
import { humanize, LEAD_SOURCES, LEAD_STATUSES } from "@/lib/constants";
import { cn, formatCurrency } from "@/lib/utils";
import { useQueryState } from "@/hooks/use-query-state";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { TimeAgo } from "@/components/ui/time";
import { useConfirm } from "@/components/ui/confirm";
import { ListToolbar, UrlPagination } from "@/components/app/list-toolbar";
import { LeadForm } from "./lead-form";

type Lead = { id: string; firstName: string; lastName: string | null; email: string | null; company: string | null; jobTitle: string | null; status: string; source: string; score: number; tags: string[]; valueCents: number; createdAt: string; owner: { name: string } | null };
type Column = { status: string; count: number; valueCents: number; leads: { id: string; firstName: string; lastName: string | null; company: string | null; score: number; valueCents: number }[] };

function ScorePill({ score }: { score: number }) {
  const tone = score >= 70 ? "bg-success/15 text-success" : score >= 40 ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground";
  return <span className={cn("inline-flex min-w-9 justify-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", tone)} aria-label={`Score ${score}`}>{score}</span>;
}

export function LeadsView({ view, data, board, members, campaigns, openNew, perms }: { view: "list" | "pipeline"; data: { items: Lead[]; meta: { page: number; totalPages: number; total: number } } | null; board: Column[] | null; members: { id: string; name: string }[]; campaigns: { id: string; name: string }[]; openNew: boolean; perms: { write: boolean; delete: boolean } }) {
  const router = useRouter();
  const q = useQueryState();
  const confirm = useConfirm();
  const [createOpen, setCreateOpen] = React.useState(openNew && perms.write);
  const [importOpen, setImportOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = React.useState("");
  const [bulkTag, setBulkTag] = React.useState("");

  async function bulk(action: "update" | "delete") {
    if (action === "delete" && !(await confirm({ title: `Delete ${selected.size} lead${selected.size === 1 ? "" : "s"}?`, description: "They'll be removed from lists, segments and automations.", destructive: true, confirmLabel: "Delete" }))) return;
    try {
      await api.post("leads/bulk", { ids: [...selected], action, status: bulkStatus || undefined, addTag: bulkTag || undefined });
      toast.success(action === "delete" ? "Leads deleted" : "Leads updated");
      setSelected(new Set());
      setBulkStatus("");
      setBulkTag("");
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const exportUrl = `/api/v1/leads/export?${new URLSearchParams(Object.fromEntries([["status", q.get("status")], ["source", q.get("source")]].filter(([, v]) => v))).toString()}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border p-0.5" role="radiogroup" aria-label="View">
          {[
            { v: "list", label: "List", icon: List },
            { v: "pipeline", label: "Pipeline", icon: KanbanSquare },
          ].map((o) => (
            <button key={o.v} role="radio" aria-checked={view === o.v} onClick={() => q.set({ view: o.v === "list" ? null : o.v })} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm", view === o.v ? "bg-muted font-medium" : "text-muted-foreground")}>
              <o.icon className="size-4" /> {o.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href={exportUrl} download>
              <Download /> Export CSV
            </a>
          </Button>
          {perms.write && (
            <>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload /> Import CSV
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus /> Add lead
              </Button>
            </>
          )}
        </div>
      </div>

      {view === "list" && data && (
        <>
          <ListToolbar
            placeholder="Search name, email or company"
            filters={[
              { key: "status", label: "All statuses", options: LEAD_STATUSES.map((s) => ({ value: s, label: humanize(s) })) },
              { key: "source", label: "All sources", options: LEAD_SOURCES.map((s) => ({ value: s, label: humanize(s) })) },
              { key: "minScore", label: "Any score", options: [70, 40, 20].map((s) => ({ value: String(s), label: `Score ≥ ${s}` })) },
              { key: "sort", label: "Newest first", options: [{ value: "score", label: "Highest score" }, { value: "valueCents", label: "Highest value" }, { value: "updatedAt", label: "Recently updated" }] },
            ]}
          />
          {selected.size > 0 && perms.write && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-2.5 text-sm" role="region" aria-label="Bulk actions">
              <span className="font-medium">{selected.size} selected</span>
              <Select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className="h-8 w-40" aria-label="Set status">
                <option value="">Set status…</option>
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
              <div className="relative">
                <Tag className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={bulkTag} onChange={(e) => setBulkTag(e.target.value)} placeholder="Add tag" className="h-8 w-32 pl-8" aria-label="Add tag" />
              </div>
              <Button size="sm" onClick={() => bulk("update")} disabled={!bulkStatus && !bulkTag}>
                Apply
              </Button>
              {perms.delete && (
                <Button size="sm" variant="ghost" className="text-danger" onClick={() => bulk("delete")}>
                  <Trash2 /> Delete
                </Button>
              )}
              <button className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => setSelected(new Set())}>
                Clear
              </button>
            </div>
          )}
          <DataTable
            rows={data.items}
            rowKey={(r) => r.id}
            onRowClick={(r) => router.push(`/app/leads/${r.id}`)}
            selectable={perms.write ? { selected, onChange: setSelected } : undefined}
            empty={<EmptyState icon={Users} title="No leads match" description="Add leads manually, import a CSV or capture them with automations." action={perms.write && <Button onClick={() => setCreateOpen(true)}><Plus /> Add lead</Button>} />}
            columns={[
              {
                key: "name",
                header: "Lead",
                cell: (r) => (
                  <div className="min-w-0">
                    <Link href={`/app/leads/${r.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-primary">
                      {r.firstName} {r.lastName}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{r.email ?? "No email"}</p>
                  </div>
                ),
              },
              {
                key: "company",
                header: "Company",
                cell: (r) => (
                  <div className="min-w-0">
                    <p className="truncate">{r.company ?? "—"}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.jobTitle}</p>
                  </div>
                ),
                hideOnMobile: true,
              },
              { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
              { key: "score", header: "Score", cell: (r) => <ScorePill score={r.score} /> },
              { key: "source", header: "Source", cell: (r) => <span className="text-sm text-muted-foreground">{humanize(r.source)}</span>, hideOnMobile: true },
              { key: "value", header: "Value", cell: (r) => <span className="tabular-nums">{r.valueCents ? formatCurrency(r.valueCents, "USD", { compact: true }) : "—"}</span>, className: "text-right" },
              { key: "tags", header: "Tags", cell: (r) => <div className="flex flex-wrap gap-1">{r.tags.slice(0, 2).map((t) => <Badge key={t}>{t}</Badge>)}</div>, hideOnMobile: true },
              { key: "created", header: "Added", cell: (r) => <TimeAgo date={r.createdAt} className="whitespace-nowrap text-xs text-muted-foreground" />, hideOnMobile: true },
            ]}
          />
          <UrlPagination {...data.meta} />
        </>
      )}

      {view === "pipeline" && board && <Pipeline board={board} canWrite={perms.write} onMoved={() => router.refresh()} />}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Add a lead</DialogTitle>
            <DialogDescription>Score is calculated automatically from fit, source, stage and engagement.</DialogDescription>
          </DialogHeader>
          <LeadForm
            members={members}
            campaigns={campaigns}
            submitLabel="Add lead"
            onCancel={() => setCreateOpen(false)}
            onSubmit={async (data) => {
              const lead = await api.post<{ id: string }>("leads", data);
              toast.success("Lead added");
              setCreateOpen(false);
              router.push(`/app/leads/${lead.id}`);
            }}
          />
        </DialogContent>
      </Dialog>
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onDone={() => router.refresh()} />
    </>
  );
}

function Pipeline({ board, canWrite, onMoved }: { board: Column[]; canWrite: boolean; onMoved: () => void }) {
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<string | null>(null);

  async function move(id: string, status: string) {
    try {
      await api.patch(`leads/${id}`, { status });
      toast.success(`Moved to ${humanize(status)}`);
      onMoved();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="grid min-w-[1080px] grid-cols-6 gap-3">
        {board.map((col) => (
          <section
            key={col.status}
            aria-label={humanize(col.status)}
            onDragOver={(e) => {
              if (!canWrite) return;
              e.preventDefault();
              setOver(col.status);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData("text/plain");
              if (id) void move(id, col.status);
            }}
            className={cn("flex max-h-[70dvh] flex-col rounded-xl bg-surface p-2 transition", over === col.status && "ring-2 ring-primary/40")}
          >
            <header className="mb-2 px-1">
              <div className="flex items-center justify-between">
                <StatusBadge status={col.status} />
                <span className="text-xs font-medium text-muted-foreground">{col.count}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">{formatCurrency(col.valueCents, "USD", { compact: true })}</p>
            </header>
            <ul className="flex-1 space-y-2 overflow-y-auto scrollbar-thin">
              {col.leads.map((l) => (
                <li
                  key={l.id}
                  draggable={canWrite}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", l.id);
                    setDragging(l.id);
                  }}
                  onDragEnd={() => setDragging(null)}
                  className={cn("rounded-lg border border-border bg-card p-2.5 text-sm card-shadow", canWrite && "cursor-grab active:cursor-grabbing", dragging === l.id && "opacity-50")}
                >
                  <Link href={`/app/leads/${l.id}`} className="font-medium hover:text-primary">
                    {l.firstName} {l.lastName}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">{l.company ?? "—"}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <ScorePill score={l.score} />
                    {l.valueCents > 0 && <span className="text-xs tabular-nums text-muted-foreground">{formatCurrency(l.valueCents, "USD", { compact: true })}</span>}
                  </div>
                  {canWrite && (
                    <Select aria-label={`Move ${l.firstName} to stage`} className="mt-2 h-7 text-xs lg:hidden" value={col.status} onChange={(e) => move(l.id, e.target.value)}>
                      {LEAD_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {humanize(s)}
                        </option>
                      ))}
                    </Select>
                  )}
                </li>
              ))}
              {col.count > col.leads.length && <li className="px-1 text-xs text-muted-foreground">+{col.count - col.leads.length} more in list view</li>}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function ImportDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ created: number; skipped: number; errors: { row: number; message: string }[] } | null>(null);

  async function upload() {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await api.upload<typeof result>("leads/import", form);
      setResult(r);
      toast.success(`${r!.created} leads imported`);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setFile(null);
          setResult(null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import leads from CSV</DialogTitle>
          <DialogDescription>Columns are matched by header: first_name, last_name, email, phone, company, job_title, website, source, status, tags, value. Up to 5,000 rows.</DialogDescription>
        </DialogHeader>
        {!result ? (
          <>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-8 text-center text-sm transition hover:border-primary/50">
              <Upload className="size-6 text-muted-foreground" />
              {file ? <span className="font-medium">{file.name}</span> : <span className="text-muted-foreground">Choose a .csv file</span>}
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <a
              className="mt-2 inline-block text-xs text-primary hover:underline"
              href={`data:text/csv;charset=utf-8,${encodeURIComponent("first_name,last_name,email,company,job_title,source,status,tags,value\nJordan,Lee,jordan@example.com,Example Freight,VP Operations,WEBSITE,NEW,enterprise;webinar,25000\n")}`}
              download="leads-template.csv"
            >
              Download a template
            </a>
            <DialogFooter>
              <Button onClick={upload} loading={busy} disabled={!file}>
                Import
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="space-y-3">
            <Card className="grid grid-cols-2 gap-3 p-4 text-center">
              <div>
                <p className="text-2xl font-semibold text-success tabular-nums">{result.created}</p>
                <p className="text-xs text-muted-foreground">imported</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-warning tabular-nums">{result.skipped}</p>
                <p className="text-xs text-muted-foreground">skipped</p>
              </div>
            </Card>
            {result.errors.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-3 text-xs scrollbar-thin">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
