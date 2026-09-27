import type { Metadata } from "next";
import { z } from "zod";
import { requirePagePermission } from "@/server/page-context";
import { can } from "@/server/tenant";
import { paginationSchema } from "@/server/pagination";
import { listCampaigns } from "@/server/services/campaigns";
import { CAMPAIGN_OBJECTIVES, CAMPAIGN_STATUSES } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { CampaignsView } from "./campaigns-view";

export const metadata: Metadata = { title: "Campaigns" };

const q = paginationSchema.extend({ status: z.enum(CAMPAIGN_STATUSES).optional().catch(undefined), objective: z.enum(CAMPAIGN_OBJECTIVES).optional().catch(undefined), new: z.string().optional() });

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requirePagePermission("campaigns:read");
  const params = q.parse(await searchParams);
  const data = await listCampaigns(ctx.workspace.id, params);
  return (
    <>
      <PageHeader title="Campaigns" description="Plan, approve, launch and measure multi-channel campaigns." />
      <CampaignsView data={JSON.parse(JSON.stringify(data))} canWrite={can(ctx, "campaigns:write")} openNew={params.new === "1"} />
    </>
  );
}
