"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Megaphone, Plus } from "lucide-react";
import { api } from "@/lib/api-client";
import { CAMPAIGN_OBJECTIVES, CAMPAIGN_STATUSES, humanize } from "@/lib/constants";
import { formatCompact, formatCurrency } from "@/lib/utils";
import { DateText } from "@/components/ui/time";
import { Button } from "@/components/ui/button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/states";
import { Progress } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ListToolbar, UrlPagination } from "@/components/app/list-toolbar";
import { CampaignForm, campaignDefaults } from "./campaign-form";

type Row = {
  id: string;
  name: string;
  status: string;
  objective: string;
  approvalStatus: string;
  budgetCents: number;
  spentCents: number;
  startDate: string | null;
  endDate: string | null;
  channels: string[];
  owner: { name: string } | null;
  _count: { tasks: number; contents: number; leads: number };
  metrics: { impressions: number | null; leads: number | null } | null;
};

export function CampaignsView({ data, canWrite, openNew }: { data: { items: Row[]; meta: { page: number; totalPages: number; total: number } }; canWrite: boolean; openNew: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(openNew && canWrite);

  return (
    <>
      <ListToolbar
        placeholder="Search campaigns"
        filters={[
          { key: "status", label: "All active statuses", options: CAMPAIGN_STATUSES.map((s) => ({ value: s, label: humanize(s) })) },
          { key: "objective", label: "Any objective", options: CAMPAIGN_OBJECTIVES.map((s) => ({ value: s, label: humanize(s) })) },
        ]}
      >
        {canWrite && (
          <Button onClick={() => setOpen(true)} className="sm:ml-auto">
            <Plus /> New campaign
          </Button>
        )}
      </ListToolbar>
      <DataTable
        rows={data.items}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/app/campaigns/${r.id}`)}
        empty={
          <EmptyState
            icon={Megaphone}
            title="No campaigns found"
            description="Create a campaign to plan channels, budget and content — then let Nova draft the strategy."
            action={canWrite && <Button onClick={() => setOpen(true)}><Plus /> New campaign</Button>}
          />
        }
        columns={[
          {
            key: "name",
            header: "Campaign",
            cell: (r) => (
              <div className="min-w-0">
                <Link href={`/app/campaigns/${r.id}`} className="font-medium hover:text-primary" onClick={(e) => e.stopPropagation()}>
                  {r.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {humanize(r.objective)} · {r.channels.slice(0, 3).join(", ") || "No channels"}
                </p>
              </div>
            ),
          },
          { key: "status", header: "Status", cell: (r) => <div className="flex flex-wrap gap-1"><StatusBadge status={r.status} />{r.approvalStatus === "PENDING" && <Badge tone="warning">Needs approval</Badge>}</div> },
          {
            key: "budget",
            header: "Budget",
            cell: (r) => (
              <div className="w-32">
                <p className="text-xs tabular-nums">
                  {formatCurrency(r.spentCents, "USD", { compact: true })} / {formatCurrency(r.budgetCents, "USD", { compact: true })}
                </p>
                <Progress value={r.budgetCents ? (r.spentCents / r.budgetCents) * 100 : 0} className="mt-1 h-1.5" tone={r.spentCents > r.budgetCents ? "danger" : "primary"} />
              </div>
            ),
            hideOnMobile: true,
          },
          { key: "impr", header: "Impressions", cell: (r) => <span className="tabular-nums">{formatCompact(r.metrics?.impressions ?? 0)}</span>, className: "text-right" },
          { key: "leads", header: "Leads", cell: (r) => <span className="tabular-nums">{(r.metrics?.leads ?? 0).toLocaleString()}</span>, className: "text-right" },
          { key: "dates", header: "Timeline", cell: (r) => <span className="text-xs text-muted-foreground whitespace-nowrap"><DateText date={r.startDate} options={{ month: "short", day: "numeric" }} /> – <DateText date={r.endDate} options={{ month: "short", day: "numeric", year: "numeric" }} /></span>, hideOnMobile: true },
          { key: "owner", header: "Owner", cell: (r) => <span className="text-sm text-muted-foreground">{r.owner?.name ?? "—"}</span>, hideOnMobile: true },
        ]}
      />
      <UrlPagination {...data.meta} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>New campaign</DialogTitle>
            <DialogDescription>You can generate a full AI strategy after creating it.</DialogDescription>
          </DialogHeader>
          <CampaignForm
            initial={campaignDefaults()}
            submitLabel="Create campaign"
            onCancel={() => setOpen(false)}
            onSubmit={async (payload) => {
              const c = await api.post<{ id: string }>("campaigns", payload);
              toast.success("Campaign created");
              router.push(`/app/campaigns/${c.id}`);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
