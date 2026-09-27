import { z } from "zod";
import { route } from "@/server/api";
import { exportAnalyticsCsv, resolveRange } from "@/server/services/analytics";
import { analyticsPdf } from "@/server/services/reports";

const range = z.object({ days: z.coerce.number().int().min(1).max(730).optional(), from: z.string().optional(), to: z.string().optional() });
export const GET = route({ permission: "analytics:read", query: range.extend({ format: z.enum(["csv", "pdf"]).default("csv") }), rateLimit: { limit: 30, windowSec: 3600 } }, async ({ ctx, query }) => {
  const r = resolveRange(query);
  const stamp = new Date().toISOString().slice(0, 10);
  if (query.format === "pdf") {
    const pdf = await analyticsPdf(ctx.workspace.id, r);
    return new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="marketing-report-${stamp}.pdf"` } });
  }
  const csv = await exportAnalyticsCsv(ctx.workspace.id, r);
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="analytics-${stamp}.csv"` } });
});
