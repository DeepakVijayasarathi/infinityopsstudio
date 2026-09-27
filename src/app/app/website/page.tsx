import type { Metadata } from "next";
import { requirePagePermission } from "@/server/page-context";
import { can } from "@/server/tenant";
import { env } from "@/server/env";
import { getOrCreateWidget, websiteStats } from "@/server/services/website";
import { PageHeader } from "@/components/ui/page-header";
import { WebsiteView } from "./website-view";

export const metadata: Metadata = { title: "Website" };

export default async function WebsitePage() {
  const ctx = await requirePagePermission("analytics:read");
  const [widget, stats] = await Promise.all([getOrCreateWidget(ctx.workspace.id), websiteStats(ctx.workspace.id, 30)]);
  const { inboundEmailToken: _t, ...w } = widget;
  return (
    <>
      <PageHeader title="Website" description="Real visitors, AI chat and lead capture for your own website — one copy-paste snippet." />
      <WebsiteView widget={JSON.parse(JSON.stringify(w))} stats={stats} appUrl={env().APP_URL} canEdit={can(ctx, "integrations:manage")} />
    </>
  );
}
