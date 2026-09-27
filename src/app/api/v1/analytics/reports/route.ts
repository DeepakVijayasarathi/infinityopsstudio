import { z } from "zod";
import { route } from "@/server/api";
import { generateReportContent } from "@/server/services/reports";

export const POST = route({ permission: "analytics:read", body: z.object({ days: z.coerce.number().int().min(1).max(365).default(30), campaignId: z.string().optional() }), rateLimit: { limit: 20, windowSec: 3600 } }, async ({ ctx, body }) => {
  const content = await generateReportContent(ctx.workspace.id, body.days, body.campaignId);
  return { id: content.id, title: content.title };
});
