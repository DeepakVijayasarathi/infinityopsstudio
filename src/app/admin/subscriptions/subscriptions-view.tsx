"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DateText } from "@/components/ui/time";

type Sub = { id: string; plan: string; status: string; interval: string; provider: string; currentPeriodEnd: string; cancelAtPeriodEnd: boolean; pendingPlan: string | null; workspace: { id: string; name: string } };
type Inv = { id: string; number: string; amountCents: number; currency: string; issuedAt: string; workspace: { name: string } };

export function SubscriptionsView({ subs, openInvoices }: { subs: Sub[]; openInvoices: Inv[] }) {
  const router = useRouter();
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Open invoices</CardTitle>
          <CardDescription>Invoice-billed workspaces awaiting payment. Mark paid once funds are received.</CardDescription>
        </CardHeader>
        <CardContent>
          {openInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open invoices.</p>
          ) : (
            <ul className="divide-y divide-border">
              {openInvoices.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                  <span className="font-medium">{i.number}</span>
                  <span className="text-muted-foreground">{i.workspace.name}</span>
                  <DateText date={i.issuedAt} className="text-xs text-muted-foreground" />
                  <span className="ml-auto tabular-nums">{formatCurrency(i.amountCents, i.currency)}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await api.post(`admin/invoices/${i.id}/paid`);
                        toast.success(`${i.number} marked as paid`);
                        router.refresh();
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    Mark paid
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <DataTable
        rows={subs}
        rowKey={(s) => s.id}
        columns={[
          { key: "ws", header: "Workspace", cell: (s) => <span className="font-medium">{s.workspace.name}</span> },
          { key: "plan", header: "Plan", cell: (s) => <Badge tone="brand">{s.plan}</Badge> },
          { key: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
          { key: "interval", header: "Interval", cell: (s) => s.interval.toLowerCase(), hideOnMobile: true },
          { key: "provider", header: "Provider", cell: (s) => s.provider, hideOnMobile: true },
          { key: "renews", header: "Period ends", cell: (s) => <DateText date={s.currentPeriodEnd} className="text-xs" /> },
          { key: "pending", header: "Pending change", cell: (s) => (s.pendingPlan ? <Badge tone="warning">→ {s.pendingPlan}</Badge> : "—"), hideOnMobile: true },
        ]}
      />
    </div>
  );
}
