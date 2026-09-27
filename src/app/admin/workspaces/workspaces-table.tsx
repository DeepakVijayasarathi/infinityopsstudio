"use client";

import * as React from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { StatusBadge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { DateText } from "@/components/ui/time";
import { useConfirm } from "@/components/ui/confirm";
import { AdminTable } from "../admin-table";

type W = { id: string; name: string; slug: string; createdAt: string; subscription: { plan: string; status: string; interval: string; provider: string } | null; _count: { members: number; campaigns: number; leads: number } };
const PLANS = ["FREE", "STARTER", "GROWTH", "SCALE", "ENTERPRISE"];

export function WorkspacesTable() {
  const confirm = useConfirm();
  const [key, setKey] = React.useState(0);
  return (
    <AdminTable<W>
      endpoint="/api/v1/admin/workspaces"
      refreshKey={key}
      placeholder="Search workspaces"
      rowKey={(w) => w.id}
      columns={[
        {
          key: "name",
          header: "Workspace",
          cell: (w) => (
            <div>
              <p className="font-medium">{w.name}</p>
              <p className="text-xs text-muted-foreground">{w.slug}</p>
            </div>
          ),
        },
        {
          key: "plan",
          header: "Plan",
          cell: (w) => (
            <Select
              aria-label={`Plan for ${w.name}`}
              className="h-8 w-32"
              value={w.subscription?.plan ?? "FREE"}
              onChange={async (e) => {
                const plan = e.target.value;
                if (!(await confirm({ title: `Override ${w.name} to ${plan}?`, description: "This bypasses the payment provider and is recorded in the audit log.", confirmLabel: "Override plan" }))) return;
                try {
                  await api.post(`admin/workspaces/${w.id}/plan`, { plan, interval: w.subscription?.interval ?? "MONTHLY" });
                  toast.success("Plan updated");
                  setKey((k) => k + 1);
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
            >
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          ),
        },
        { key: "status", header: "Billing", cell: (w) => (w.subscription ? <StatusBadge status={w.subscription.status} /> : "—") },
        { key: "members", header: "Members", cell: (w) => w._count.members, className: "text-right" },
        { key: "campaigns", header: "Campaigns", cell: (w) => w._count.campaigns, className: "text-right", hideOnMobile: true },
        { key: "leads", header: "Leads", cell: (w) => w._count.leads.toLocaleString(), className: "text-right", hideOnMobile: true },
        { key: "created", header: "Created", cell: (w) => <DateText date={w.createdAt} className="text-xs text-muted-foreground" />, hideOnMobile: true },
      ]}
    />
  );
}
