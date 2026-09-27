import { z } from "zod";
import { route } from "@/server/api";
import { CAMPAIGN_STATUSES } from "@/lib/constants";
import { changeCampaignStatus } from "@/server/services/campaigns";

export const POST = route({ permission: "campaigns:write", body: z.object({ status: z.enum(CAMPAIGN_STATUSES) }) }, async ({ ctx, params, body }) => changeCampaignStatus(ctx, params.id!, body.status));
