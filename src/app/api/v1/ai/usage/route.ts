import { z } from "zod";
import { route } from "@/server/api";
import { aiUsageAnalytics, resolveRange } from "@/server/services/analytics";

export const GET = route({ permission: "analytics:read", query: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }) }, async ({ ctx, query }) =>
  aiUsageAnalytics(ctx.workspace.id, resolveRange({ days: query.days })),
);
