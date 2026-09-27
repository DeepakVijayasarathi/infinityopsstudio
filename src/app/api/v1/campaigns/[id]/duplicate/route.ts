import { route } from "@/server/api";
import { duplicateCampaign } from "@/server/services/campaigns";

export const POST = route({ permission: "campaigns:write" }, async ({ ctx, params }) => {
  const c = await duplicateCampaign(ctx, params.id!);
  return { id: c.id };
});
