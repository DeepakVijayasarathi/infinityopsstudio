"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, CreditCard, ExternalLink, FileText, Sparkles } from "lucide-react";
import { api } from "@/lib/api-client";
import { cn, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { DateText } from "@/components/ui/time";
import { EmptyState } from "@/components/ui/states";
import { useConfirm } from "@/components/ui/confirm";

type Plan = { key: string; name: string; tagline: string; monthlyPriceCents: number | null; yearlyPriceCents: number | null; highlighted?: boolean; features: string[] };
type Data = {
  subscription: { plan: string; status: string; interval: "MONTHLY" | "YEARLY"; currentPeriodEnd: string; cancelAtPeriodEnd: boolean; pendingPlan: string | null; provider: string } | null;
  plan: Plan;
  provider: { id: string; label: string; hasPortal: boolean };
  usage: { key: string; label: string; used: number; limit: number }[];
  invoices: { id: string; number: string; amountCents: number; currency: string; status: string; description: string | null; issuedAt: string; hostedUrl: string | null }[];
  plans: Plan[];
};

const ORDER = ["FREE", "STARTER", "GROWTH", "SCALE", "ENTERPRISE"];

export function BillingView({ data, canManage, checkout, suggestedPlan }: { data: Data; canManage: boolean; checkout: string | null; suggestedPlan: string | null }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [interval, setInterval] = React.useState<"MONTHLY" | "YEARLY">(data.subscription?.interval ?? "MONTHLY");
  const [busy, setBusy] = React.useState<string | null>(null);
  const sub = data.subscription;
  const current = sub?.plan ?? "FREE";

  React.useEffect(() => {
    if (checkout === "success") toast.success("Payment received — your plan will update in a few seconds.");
    if (checkout === "cancelled") toast.message("Checkout cancelled. Your plan hasn't changed.");
  }, [checkout]);

  async function change(plan: Plan) {
    if (plan.key === "ENTERPRISE") {
      window.location.href = "/contact?type=SALES";
      return;
    }
    const downgrade = ORDER.indexOf(plan.key) < ORDER.indexOf(current);
    if (!(await confirm({ title: `${downgrade ? "Downgrade" : "Switch"} to ${plan.name}?`, description: downgrade ? "The change takes effect at the end of your current billing period. Usage above the new limits will be blocked from then." : data.provider.id === "manual" ? "Your plan changes immediately and an invoice is issued for the new period." : "You'll be redirected to secure checkout.", confirmLabel: downgrade ? "Schedule downgrade" : "Continue" }))) return;
    setBusy(plan.key);
    try {
      const r = await api.post<{ type: "redirect" | "applied" | "scheduled"; url?: string }>("billing/change-plan", { plan: plan.key, interval });
      if (r.type === "redirect" && r.url) {
        window.location.href = r.url;
        return;
      }
      toast.success(r.type === "scheduled" ? `Downgrade to ${plan.name} scheduled` : `You're now on ${plan.name}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function portal() {
    setBusy("portal");
    try {
      const r = await api.post<{ url: string }>("billing/portal");
      window.location.href = r.url;
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardDescription>Current plan</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              {data.plan.name} <StatusBadge status={sub?.status ?? "ACTIVE"} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">{data.plan.tagline}</p>
            {data.plan.monthlyPriceCents !== null && (
              <p>
                <span className="text-xl font-semibold">{formatCurrency(sub?.interval === "YEARLY" ? (data.plan.yearlyPriceCents ?? 0) : data.plan.monthlyPriceCents)}</span>
                <span className="text-muted-foreground"> /month · billed {sub?.interval === "YEARLY" ? "yearly" : "monthly"}</span>
              </p>
            )}
            {sub && (
              <p className="text-muted-foreground">
                Current period ends <DateText date={sub.currentPeriodEnd} />
              </p>
            )}
            {sub?.pendingPlan && (
              <div className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-warning">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p>
                    Changes to {sub.pendingPlan.charAt(0) + sub.pendingPlan.slice(1).toLowerCase()} on <DateText date={sub.currentPeriodEnd} />.
                  </p>
                  {canManage && (
                    <button
                      className="mt-1 text-xs font-medium underline"
                      onClick={async () => {
                        await api.post("billing/cancel-pending");
                        toast.success("Scheduled change cancelled");
                        router.refresh();
                      }}
                    >
                      Keep my current plan
                    </button>
                  )}
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Billing via {data.provider.label}</p>
            {data.provider.hasPortal && canManage && (
              <Button variant="outline" size="sm" onClick={portal} loading={busy === "portal"}>
                <CreditCard /> Manage payment methods
              </Button>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Usage this period</CardTitle>
            <CardDescription>You&apos;ll get an alert at 80% of any monthly limit.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {data.usage.map((u) => {
              const pct = u.limit < 0 ? 0 : (u.used / Math.max(1, u.limit)) * 100;
              return (
                <div key={u.key}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span>{u.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {u.used.toLocaleString()} / {u.limit < 0 ? "∞" : u.limit.toLocaleString()}
                    </span>
                  </div>
                  <Progress value={u.limit < 0 ? 4 : pct} tone={pct >= 100 ? "danger" : pct >= 80 ? "warning" : "primary"} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="plans-heading">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="plans-heading" className="text-lg font-semibold">
            Plans
          </h2>
          <div className="inline-flex rounded-full border border-border bg-card p-1 text-sm" role="radiogroup" aria-label="Billing interval">
            {(["MONTHLY", "YEARLY"] as const).map((i) => (
              <button key={i} role="radio" aria-checked={interval === i} onClick={() => setInterval(i)} className={cn("rounded-full px-4 py-1 font-medium", interval === i ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                {i === "MONTHLY" ? "Monthly" : "Yearly (save 20%)"}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {data.plans.map((p) => {
            const isCurrent = p.key === current && (sub?.interval ?? "MONTHLY") === interval;
            const price = interval === "YEARLY" ? p.yearlyPriceCents : p.monthlyPriceCents;
            return (
              <Card key={p.key} className={cn("flex flex-col p-5", p.key === suggestedPlan && "ring-2 ring-primary", p.highlighted && "border-primary/50")}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{p.name}</h3>
                  {p.highlighted && (
                    <Badge tone="brand">
                      <Sparkles className="size-3" /> Popular
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-2xl font-semibold">{price === null ? "Custom" : formatCurrency(price)}</p>
                <p className="text-xs text-muted-foreground">{price === null ? "Talk to sales" : "per month"}</p>
                <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" /> {f}
                    </li>
                  ))}
                </ul>
                <Button className="mt-5" variant={isCurrent ? "outline" : p.highlighted ? "default" : "outline"} disabled={isCurrent || !canManage} loading={busy === p.key} onClick={() => change(p)}>
                  {isCurrent ? "Current plan" : p.key === "ENTERPRISE" ? "Contact sales" : ORDER.indexOf(p.key) < ORDER.indexOf(current) ? "Downgrade" : "Upgrade"}
                </Button>
              </Card>
            );
          })}
        </div>
        {!canManage && <p className="mt-3 text-sm text-muted-foreground">Only owners and admins can change the plan.</p>}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Invoices & payment history</CardTitle>
        </CardHeader>
        <CardContent>
          {data.invoices.length === 0 ? (
            <EmptyState icon={FileText} title="No invoices yet" description="Invoices appear here after your first paid period." className="py-8" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2">Invoice</th>
                    <th className="py-2">Date</th>
                    <th className="py-2">Description</th>
                    <th className="py-2">Status</th>
                    <th className="py-2 text-right">Amount</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="py-2.5 font-medium">{inv.number}</td>
                      <td className="py-2.5 text-muted-foreground">
                        <DateText date={inv.issuedAt} />
                      </td>
                      <td className="py-2.5 text-muted-foreground">{inv.description}</td>
                      <td className="py-2.5">
                        <StatusBadge status={inv.status} />
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{formatCurrency(inv.amountCents, inv.currency)}</td>
                      <td className="py-2.5 text-right">
                        <a href={inv.hostedUrl ?? `/api/v1/billing/invoices/${inv.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          View <ExternalLink className="size-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
