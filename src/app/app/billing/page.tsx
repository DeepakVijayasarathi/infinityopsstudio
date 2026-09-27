import type { Metadata } from "next";
import { requirePagePermission } from "@/server/page-context";
import { can } from "@/server/tenant";
import { billingOverview } from "@/server/billing/service";
import { PageHeader } from "@/components/ui/page-header";
import { BillingView } from "./billing-view";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string; plan?: string }> }) {
  const ctx = await requirePagePermission("billing:view");
  const data = await billingOverview(ctx.workspace.id);
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Billing" description="Plan, usage, invoices and payment settings for this workspace." />
      <BillingView data={JSON.parse(JSON.stringify(data))} canManage={can(ctx, "billing:manage")} checkout={sp.checkout ?? null} suggestedPlan={sp.plan ?? null} />
    </>
  );
}
