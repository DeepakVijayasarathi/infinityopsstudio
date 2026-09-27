import { route } from "@/server/api";
import { campaignUpdateSchema } from "@/lib/schemas";
import { deleteCampaign, getCampaign, updateCampaign } from "@/server/services/campaigns";

export const GET = route({ permission: "campaigns:read" }, async ({ ctx, params }) => getCampaign(ctx.workspace.id, params.id!));
export const PATCH = route({ permission: "campaigns:write", body: campaignUpdateSchema }, async ({ ctx, params, body }) => updateCampaign(ctx, params.id!, body));
export const DELETE = route({ permission: "campaigns:write" }, async ({ ctx, params }) => {
  await deleteCampaign(ctx, params.id!);
  return { ok: true };
});
