import { z } from "zod";
import { route } from "@/server/api";
import { LEAD_SOURCES, LEAD_STATUSES } from "@/lib/constants";
import { exportLeads } from "@/server/services/leads";

const q = z.object({ status: z.enum(LEAD_STATUSES).optional(), source: z.enum(LEAD_SOURCES).optional() });
export const GET = route({ permission: "leads:read", query: q, rateLimit: { limit: 30, windowSec: 3600 } }, async ({ ctx, query }) => {
  const csv = await exportLeads(ctx.workspace.id, query);
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"` } });
});
