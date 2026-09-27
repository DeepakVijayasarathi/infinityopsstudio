import { z } from "zod";
import { route } from "@/server/api";
import { paginationSchema } from "@/server/pagination";
import { leadSchema } from "@/lib/schemas";
import { LEAD_SOURCES, LEAD_STATUSES } from "@/lib/constants";
import { createLead, listLeads } from "@/server/services/leads";

const q = paginationSchema.extend({
  status: z.enum(LEAD_STATUSES).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  tag: z.string().max(40).optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  campaignId: z.string().optional(),
});
export const GET = route({ permission: "leads:read", query: q }, async ({ ctx, query }) => listLeads(ctx.workspace.id, query));
export const POST = route({ permission: "leads:write", body: leadSchema }, async ({ ctx, body }) => createLead(ctx, body));
