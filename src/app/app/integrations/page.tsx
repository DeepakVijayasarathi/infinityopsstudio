import type { Metadata } from "next";
import { requireContext } from "@/server/page-context";
import { can } from "@/server/tenant";
import { listIntegrations } from "@/server/services/integrations";
import { INTEGRATION_CATEGORIES } from "@/server/integrations/registry";
import { PageHeader } from "@/components/ui/page-header";
import { IntegrationsView } from "./integrations-view";

export const metadata: Metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const ctx = await requireContext();
  const items = await listIntegrations(ctx.workspace.id);
  return (
    <>
      <PageHeader title="Integrations" description="Connect social networks, email, analytics, CRM, ad platforms and webhooks." />
      <IntegrationsView items={JSON.parse(JSON.stringify(items))} categories={INTEGRATION_CATEGORIES} canManage={can(ctx, "integrations:manage")} />
    </>
  );
}
