import type { Metadata } from "next";
import { requirePagePermission } from "@/server/page-context";
import { can } from "@/server/tenant";
import { db } from "@/server/db";
import { campaignPerformance, getCampaign } from "@/server/services/campaigns";
import { CampaignDetail } from "./campaign-detail";

export const metadata: Metadata = { title: "Campaign" };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePagePermission("campaigns:read");
  const { id } = await params;
  const [campaign, performance, workers] = await Promise.all([
    getCampaign(ctx.workspace.id, id),
    campaignPerformance(ctx.workspace.id, id),
    db.aIWorker.findMany({ where: { workspaceId: ctx.workspace.id, isActive: true }, select: { id: true, name: true, title: true } }),
  ]);
  return (
    <CampaignDetail
      campaign={JSON.parse(JSON.stringify(campaign))}
      performance={performance}
      workers={workers}
      perms={{ write: can(ctx, "campaigns:write"), approve: can(ctx, "campaigns:approve"), content: can(ctx, "content:write") }}
    />
  );
}
