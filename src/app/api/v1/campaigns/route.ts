import { z } from "zod";
import { route } from "@/server/api";
import { paginationSchema } from "@/server/pagination";
import { campaignSchema } from "@/lib/schemas";
import { CAMPAIGN_OBJECTIVES, CAMPAIGN_STATUSES } from "@/lib/constants";
import { createCampaign, listCampaigns } from "@/server/services/campaigns";

const q = paginationSchema.extend({ status: z.enum(CAMPAIGN_STATUSES).optional(), objective: z.enum(CAMPAIGN_OBJECTIVES).optional() });
export const GET = route({ permission: "campaigns:read", query: q }, async ({ ctx, query }) => listCampaigns(ctx.workspace.id, query));
export const POST = route({ permission: "campaigns:write", body: campaignSchema }, async ({ ctx, body }) => createCampaign(ctx, body));
