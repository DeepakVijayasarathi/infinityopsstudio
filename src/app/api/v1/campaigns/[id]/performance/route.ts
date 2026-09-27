import { route } from "@/server/api";
import { campaignPerformance, getCampaign } from "@/server/services/campaigns";

export const GET = route({ permission: "campaigns:read" }, async ({ ctx, params }) => {
  await getCampaign(ctx.workspace.id, params.id!);
  return campaignPerformance(ctx.workspace.id, params.id!);
});
