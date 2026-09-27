import { z } from "zod";
import { route } from "@/server/api";
import { emailCampaignSchema } from "@/lib/schemas";
import { EMAIL_CAMPAIGN_STATUSES } from "@/lib/constants";
import { createEmailCampaign, listEmailCampaigns } from "@/server/services/email";

export const GET = route({ permission: "email:read", query: z.object({ status: z.enum(EMAIL_CAMPAIGN_STATUSES).optional() }) }, async ({ ctx, query }) => listEmailCampaigns(ctx.workspace.id, query.status));
export const POST = route({ permission: "email:write", body: emailCampaignSchema }, async ({ ctx, body }) => createEmailCampaign(ctx, body));
